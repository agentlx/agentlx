#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_RUNTIME_MANIFEST_URL=""
DEFAULT_RUNTIME_FILE_URL=""
DEFAULT_INSTALL_DIR="/opt/agentlx"
SYSTEMD_SERVICE_NAME="agentlx"
RUNTIME_MANIFEST_NAME=".agentlx-runtime-manifest.json"

API_BASE_URL=""
INSTALL_DIR="$DEFAULT_INSTALL_DIR"
RUNTIME_MANIFEST_URL="${AGENTLX_RUNTIME_MANIFEST_URL:-$DEFAULT_RUNTIME_MANIFEST_URL}"
RUNTIME_FILE_URL="${AGENTLX_RUNTIME_FILE_URL:-$DEFAULT_RUNTIME_FILE_URL}"
NO_RESTART="0"

FILES_UPDATED=0
REQUIREMENTS_CHANGED=0
VENV_CREATED=0

log() {
  printf '[agentlx-update] %s\n' "$*"
}

fail() {
  printf '[agentlx-update] erro: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Uso:
  bash update.sh

Parametros opcionais:
  --api-base-url URL
  --install-dir CAMINHO
  --no-restart
  --help

Comportamento:
  - preserva o config.json existente;
  - baixa o runtime modular mais recente do agent;
  - substitui apenas os arquivos que realmente mudaram;
  - remove arquivos antigos que deixaram de fazer parte do runtime;
  - reinstala dependencias Python apenas se necessario;
  - reinicia o servico agentlx apenas se houver atualizacao.
EOF
}

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    fail "execute esta atualizacao com sudo ou como root."
  fi
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --api-base-url)
        API_BASE_URL="${2:-}"
        shift 2
        ;;
      --install-dir)
        INSTALL_DIR="${2:-}"
        shift 2
        ;;
      --no-restart)
        NO_RESTART="1"
        shift
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        fail "parametro desconhecido: $1"
        ;;
    esac
  done
}

require_dependencies() {
  command -v python3 >/dev/null 2>&1 || fail "python3 nao encontrado."
  command -v curl >/dev/null 2>&1 || fail "curl nao encontrado."
}

ensure_existing_installation() {
  [ -d "${INSTALL_DIR}" ] || fail "diretorio de instalacao nao encontrado: ${INSTALL_DIR}"
  [ -f "${INSTALL_DIR}/config.json" ] || fail "config.json nao encontrado em ${INSTALL_DIR}"
  chown root:root "${INSTALL_DIR}/config.json" 2>/dev/null || true
  chmod 0600 "${INSTALL_DIR}/config.json"
  [ -f "${INSTALL_DIR}/agent.py" ] || fail "agent.py nao encontrado em ${INSTALL_DIR}"
}

ensure_supported_identity() {
  python3 - "${INSTALL_DIR}/config.json" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    data = json.load(handle)

missing = [
    key
    for key in ("agent_id", "machine_id", "agent_secret")
    if not str(data.get(key) or "").strip()
]

if missing:
    print(
        "config.json nao possui identidade v2 completa; gere um novo enrollment e reinstale o agent.",
        file=sys.stderr,
    )
    sys.exit(1)
PY
}

resolve_api_base_url_from_config() {
  python3 - "${INSTALL_DIR}/config.json" <<'PY'
import json
import sys

config_path = sys.argv[1]
with open(config_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

value = str(data.get("api_base_url") or "").strip().rstrip("/")
print(value)
PY
}

resolve_remote_urls() {
  if [ -z "${API_BASE_URL}" ]; then
    API_BASE_URL="$(resolve_api_base_url_from_config)"
  fi

  [ -n "${API_BASE_URL}" ] || fail "nao foi possivel identificar o api_base_url pelo config.json."

  if [ -z "${RUNTIME_MANIFEST_URL}" ]; then
    RUNTIME_MANIFEST_URL="${API_BASE_URL%/}/api/agent/files/runtime-manifest"
  fi

  if [ -z "${RUNTIME_FILE_URL}" ]; then
    RUNTIME_FILE_URL="${API_BASE_URL%/}/api/agent/files/runtime"
  fi
}

download_file() {
  local url="$1"
  local output="$2"
  curl -fsSL "${url}" -o "${output}"
}

verify_file_sha256() {
  local file_path="$1"
  local expected_sha256="$2"

  python3 - "${file_path}" "${expected_sha256}" <<'PY'
import hashlib
import sys

file_path, expected_sha256 = sys.argv[1:]
actual_sha256 = hashlib.sha256(open(file_path, "rb").read()).hexdigest()
if actual_sha256 != expected_sha256:
    print(
        f"sha256 invalido para {file_path}: esperado {expected_sha256}, recebido {actual_sha256}",
        file=sys.stderr,
    )
    sys.exit(1)
PY
}

sanitize_config() {
  python3 - "${INSTALL_DIR}/config.json" <<'PY'
import json
import sys

config_path = sys.argv[1]
with open(config_path, "r", encoding="utf-8") as handle:
    data = json.load(handle)

changed = False
for key in (
    "agent_secret_persisted",
    "agent_secret_persisted_at",
    "agent_secret_last_persist_error",
):
    if key in data:
        data.pop(key, None)
        changed = True

if changed:
    with open(config_path, "w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=True)
        handle.write("\n")
    print("config.json limpo de chaves legadas.")
PY
}

replace_if_changed() {
  local source_file="$1"
  local target_file="$2"
  local label="$3"

  if [ -f "${target_file}" ] && cmp -s "${source_file}" "${target_file}"; then
    log "${label} ja esta atualizado."
    return 1
  fi

  mkdir -p "$(dirname "${target_file}")"
  install -m 0644 "${source_file}" "${target_file}"
  FILES_UPDATED=$((FILES_UPDATED + 1))
  log "${label} atualizado."
  return 0
}

ensure_virtualenv() {
  local venv_dir="${INSTALL_DIR}/.venv"
  if [ -x "${venv_dir}/bin/python" ]; then
    return
  fi

  log "criando virtualenv em ${venv_dir}..."
  python3 -m venv "${venv_dir}"
  VENV_CREATED=1
}

install_python_dependencies_if_needed() {
  if [ "${REQUIREMENTS_CHANGED}" -eq 0 ] && [ "${VENV_CREATED}" -eq 0 ]; then
    return
  fi

  local python_bin="${INSTALL_DIR}/.venv/bin/python"
  log "atualizando dependencias Python do agent..."
  "${python_bin}" -m pip install --upgrade pip setuptools wheel
  "${python_bin}" -m pip install -r "${INSTALL_DIR}/requirements.txt"
}

restart_service_if_needed() {
  if [ "${NO_RESTART}" = "1" ]; then
    log "reinicio do servico ignorado por --no-restart."
    return
  fi

  if [ "${FILES_UPDATED}" -eq 0 ] && [ "${VENV_CREATED}" -eq 0 ]; then
    log "nenhuma mudanca aplicada; servico mantido sem reinicio."
    return
  fi

  [ -x "${INSTALL_DIR}/.venv/bin/python" ] || fail "python da virtualenv nao encontrado."
  command -v systemctl >/dev/null 2>&1 || fail "systemctl nao encontrado."

  log "reinstalando definicao do servico e reiniciando ${SYSTEMD_SERVICE_NAME}..."
  (
    cd "${INSTALL_DIR}"
    "${INSTALL_DIR}/.venv/bin/python" agent.py install-service
  )
}

download_runtime_from_manifest() {
  local manifest_file="$1"
  local target_dir="$2"

  python3 - "${manifest_file}" "${RUNTIME_FILE_URL}" "${target_dir}" <<'PY' | while IFS=$'\t' read -r url output_path expected_sha256; do
import json
import os
import sys
import urllib.parse

manifest_path, base_url, target_dir = sys.argv[1:]
with open(manifest_path, "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

for entry in manifest.get("files", []):
    relative = str(entry.get("path") or "").strip()
    expected_sha256 = str(entry.get("sha256") or "").strip()
    if not relative or not expected_sha256:
        continue
    output_path = os.path.join(target_dir, *relative.split("/"))
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    url = f"{base_url}?path={urllib.parse.quote(relative, safe='')}"
    print(f"{url}\t{output_path}\t{expected_sha256}")
PY
    download_file "${url}" "${output_path}"
    verify_file_sha256 "${output_path}" "${expected_sha256}"
  done
}

manifest_paths() {
  local manifest_file="$1"
  python3 - "${manifest_file}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    manifest = json.load(handle)

for entry in manifest.get("files", []):
    relative = str(entry.get("path") or "").strip()
    if relative:
        print(relative)
PY
}

read_manifest_paths() {
  local manifest_file="$1"
  local target_var_name="$2"
  local -n target_var="${target_var_name}"
  mapfile -t target_var < <(manifest_paths "${manifest_file}")
}

cleanup_removed_runtime_files() {
  local current_manifest_file="$1"
  local new_manifest_file="$2"
  local relative_path
  local removed_paths=()

  [ -f "${current_manifest_file}" ] || return 0

  mapfile -t removed_paths < <(python3 - "${current_manifest_file}" "${new_manifest_file}" <<'PY'
import json
import sys

with open(sys.argv[1], "r", encoding="utf-8") as handle:
    current_manifest = json.load(handle)
with open(sys.argv[2], "r", encoding="utf-8") as handle:
    new_manifest = json.load(handle)

current_files = {str(entry.get("path") or "").strip() for entry in current_manifest.get("files", []) if str(entry.get("path") or "").strip()}
new_files = {str(entry.get("path") or "").strip() for entry in new_manifest.get("files", []) if str(entry.get("path") or "").strip()}

for relative in sorted(current_files - new_files):
    print(relative)
PY
)

  for relative_path in "${removed_paths[@]}"; do
    [ -n "${relative_path}" ] || continue
    if [ -f "${INSTALL_DIR}/${relative_path}" ]; then
      rm -f "${INSTALL_DIR}/${relative_path}"
      FILES_UPDATED=$((FILES_UPDATED + 1))
      log "${relative_path} removido por estar obsoleto."
    fi
  done
}

prune_python_caches() {
  find "${INSTALL_DIR}" -type d -name '__pycache__' -prune -exec rm -rf {} + >/dev/null 2>&1 || true
  find "${INSTALL_DIR}" -type f -name '*.pyc' -delete >/dev/null 2>&1 || true
}

apply_runtime_update() {
  local source_dir="$1"
  local manifest_file="$2"
  local current_manifest_file="${INSTALL_DIR}/${RUNTIME_MANIFEST_NAME}"
  local relative_path
  local runtime_paths=()

  cleanup_removed_runtime_files "${current_manifest_file}" "${manifest_file}"

  read_manifest_paths "${manifest_file}" runtime_paths

  for relative_path in "${runtime_paths[@]}"; do
    [ -n "${relative_path}" ] || continue
    if replace_if_changed "${source_dir}/${relative_path}" "${INSTALL_DIR}/${relative_path}" "${relative_path}"; then
      if [ "${relative_path}" = "requirements.txt" ]; then
        REQUIREMENTS_CHANGED=1
      fi
    fi
  done

  install -m 0644 "${manifest_file}" "${current_manifest_file}"
  prune_python_caches
}

main() {
  require_root
  parse_args "$@"
  require_dependencies
  ensure_existing_installation
  ensure_supported_identity
  resolve_remote_urls

  local tmp_dir runtime_dir manifest_file
  tmp_dir="$(mktemp -d)"
  trap 'rm -rf "${tmp_dir}"' EXIT
  runtime_dir="${tmp_dir}/runtime"
  manifest_file="${tmp_dir}/runtime-manifest.json"
  mkdir -p "${runtime_dir}"

  log "baixando manifesto mais recente do runtime..."
  download_file "${RUNTIME_MANIFEST_URL}" "${manifest_file}"
  log "baixando runtime modular do agent..."
  download_runtime_from_manifest "${manifest_file}" "${runtime_dir}"

  ensure_virtualenv
  apply_runtime_update "${runtime_dir}" "${manifest_file}"
  sanitize_config
  install_python_dependencies_if_needed
  restart_service_if_needed

  if [ "${FILES_UPDATED}" -eq 0 ] && [ "${VENV_CREATED}" -eq 0 ]; then
    log "nenhuma atualizacao encontrada."
  else
    log "atualizacao concluida preservando ${INSTALL_DIR}/config.json."
  fi
}

main "$@"
