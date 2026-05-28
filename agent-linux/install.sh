#!/usr/bin/env bash
set -Eeuo pipefail

DEFAULT_SOURCE_BASE_URL=""
DEFAULT_RUNTIME_MANIFEST_URL=""
DEFAULT_RUNTIME_FILE_URL=""
DEFAULT_INSTALL_DIR="/opt/agentlx"
SYSTEMD_SERVICE_NAME="agentlx"
SYSTEMD_SERVICE_PATH="/etc/systemd/system/${SYSTEMD_SERVICE_NAME}.service"
RUNTIME_MANIFEST_NAME=".agentlx-runtime-manifest.json"

API_BASE_URL=""
ENROLLMENT_TOKEN=""
LOCATION=""
AGENT_NAME=""
INSTALL_DIR="$DEFAULT_INSTALL_DIR"
SOURCE_BASE_URL="${AGENTLX_SOURCE_BASE_URL:-$DEFAULT_SOURCE_BASE_URL}"
RUNTIME_MANIFEST_URL="${AGENTLX_RUNTIME_MANIFEST_URL:-$DEFAULT_RUNTIME_MANIFEST_URL}"
RUNTIME_FILE_URL="${AGENTLX_RUNTIME_FILE_URL:-$DEFAULT_RUNTIME_FILE_URL}"
POLL_INTERVAL_SEC="30"
HEARTBEAT_INTERVAL_SEC="60"
INVENTORY_REFRESH_INTERVAL_SEC="300"
TERMINAL_OUTPUT_BATCH_MS="50"
TERMINAL_WORKING_DIRECTORY=""
AGENT_VERSION="agentlx-linux-0.1.0"

log() {
  printf '[agentlx-install] %s\n' "$*"
}

fail() {
  printf '[agentlx-install] erro: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Uso:
  bash install.sh \
    --api-base-url https://api.seudominio.com \
    --enrollment-token TOKEN_FORTE \
    --location DC-SP-01

Parametros obrigatorios:
  --api-base-url URL
  --enrollment-token TOKEN

Parametros opcionais:
  --location NOME
  --agent-name NOME
  --install-dir CAMINHO
  --source-base-url URL
  --poll-interval-sec NUM
  --heartbeat-interval-sec NUM
  --inventory-refresh-interval-sec NUM
  --terminal-output-batch-ms NUM
  --terminal-working-directory CAMINHO
  --agent-version VALOR
  --help
EOF
}

require_root() {
  if [ "${EUID}" -ne 0 ]; then
    fail "execute este instalador com sudo ou como root."
  fi
}

parse_args() {
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --api-base-url)
        API_BASE_URL="${2:-}"
        shift 2
        ;;
      --enrollment-token)
        ENROLLMENT_TOKEN="${2:-}"
        shift 2
        ;;
      --location)
        LOCATION="${2:-}"
        shift 2
        ;;
      --agent-name)
        AGENT_NAME="${2:-}"
        shift 2
        ;;
      --install-dir)
        INSTALL_DIR="${2:-}"
        shift 2
        ;;
      --source-base-url)
        SOURCE_BASE_URL="${2:-}"
        shift 2
        ;;
      --poll-interval-sec)
        POLL_INTERVAL_SEC="${2:-}"
        shift 2
        ;;
      --heartbeat-interval-sec)
        HEARTBEAT_INTERVAL_SEC="${2:-}"
        shift 2
        ;;
      --inventory-refresh-interval-sec)
        INVENTORY_REFRESH_INTERVAL_SEC="${2:-}"
        shift 2
        ;;
      --terminal-output-batch-ms)
        TERMINAL_OUTPUT_BATCH_MS="${2:-}"
        shift 2
        ;;
      --terminal-working-directory)
        TERMINAL_WORKING_DIRECTORY="${2:-}"
        shift 2
        ;;
      --agent-version)
        AGENT_VERSION="${2:-}"
        shift 2
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

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    echo "apt"
    return
  fi
  if command -v dnf >/dev/null 2>&1; then
    echo "dnf"
    return
  fi
  if command -v yum >/dev/null 2>&1; then
    echo "yum"
    return
  fi
  if command -v zypper >/dev/null 2>&1; then
    echo "zypper"
    return
  fi
  if command -v pacman >/dev/null 2>&1; then
    echo "pacman"
    return
  fi
  if command -v apk >/dev/null 2>&1; then
    echo "apk"
    return
  fi
  fail "nenhum gerenciador de pacotes suportado foi encontrado."
}

assert_not_installed() {
  local reasons=()
  local existing_config="${INSTALL_DIR}/config.json"

  if [ -f "${SYSTEMD_SERVICE_PATH}" ]; then
    reasons+=("servico ${SYSTEMD_SERVICE_NAME} ja existe em ${SYSTEMD_SERVICE_PATH}")
  fi

  if command -v systemctl >/dev/null 2>&1; then
    if systemctl list-unit-files "${SYSTEMD_SERVICE_NAME}.service" --no-legend 2>/dev/null | grep -q "^${SYSTEMD_SERVICE_NAME}\\.service"; then
      reasons+=("unit ${SYSTEMD_SERVICE_NAME}.service ja esta registrada no systemd")
    fi
  fi

  if [ -f "${existing_config}" ] && grep -Eq '"(machine_id|agent_id|agent_secret|agent_token)"[[:space:]]*:[[:space:]]*"[^"]+' "${existing_config}"; then
    reasons+=("configuracao existente em ${existing_config} ja possui identidade registrada")
  fi

  if [ -f "${INSTALL_DIR}/agent.py" ] || [ -f "${INSTALL_DIR}/requirements.txt" ] || [ -d "${INSTALL_DIR}/agentlx" ]; then
    reasons+=("arquivos do agent ja existem em ${INSTALL_DIR}")
  fi

  if [ "${#reasons[@]}" -gt 0 ]; then
    printf '[agentlx-install] instalacao recusada:\n' >&2
    for reason in "${reasons[@]}"; do
      printf '  - %s\n' "${reason}" >&2
    done
    printf '[agentlx-install] use a instalacao existente ou remova-a antes de instalar novamente.\n' >&2
    exit 1
  fi
}

install_system_packages() {
  local manager
  manager="$(detect_package_manager)"
  log "instalando dependencias do sistema com ${manager}..."

  case "${manager}" in
    apt)
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get install -y python3 python3-pip python3-venv ca-certificates curl
      ;;
    dnf)
      dnf install -y python3 python3-pip ca-certificates curl
      ;;
    yum)
      yum install -y python3 python3-pip ca-certificates curl
      ;;
    zypper)
      zypper --non-interactive install python3 python3-pip ca-certificates curl
      ;;
    pacman)
      pacman -Sy --noconfirm python python-pip ca-certificates curl
      ;;
    apk)
      apk add --no-cache python3 py3-pip ca-certificates curl bash
      ;;
  esac
}

download_file() {
  local url="$1"
  local output="$2"

  if command -v curl >/dev/null 2>&1; then
    if [ -n "${ENROLLMENT_TOKEN}" ]; then
      curl -fsSL -H "x-agent-enrollment-token: ${ENROLLMENT_TOKEN}" "${url}" -o "${output}"
    else
      curl -fsSL "${url}" -o "${output}"
    fi
    return
  fi

  fail "curl nao encontrado para baixar ${url}."
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

resolve_local_source_dir() {
  local script_source script_dir
  script_source="${BASH_SOURCE[0]:-}"
  if [ -z "${script_source}" ] || [ ! -f "${script_source}" ]; then
    return 1
  fi

  script_dir="$(cd "$(dirname "${script_source}")" && pwd)"
  if [ -f "${script_dir}/agent.py" ] && [ -f "${script_dir}/requirements.txt" ] && [ -f "${script_dir}/config.example.json" ] && [ -d "${script_dir}/agentlx" ]; then
    printf '%s\n' "${script_dir}"
    return 0
  fi

  return 1
}

build_local_runtime_manifest() {
  local source_dir="$1"
  local output_file="$2"

  python3 - "${source_dir}" "${output_file}" <<'PY'
import hashlib
import json
import os
import sys
from pathlib import Path

source_dir = Path(sys.argv[1]).resolve()
output_file = Path(sys.argv[2]).resolve()
files = ["agent.py", "requirements.txt", "config.example.json"]

runtime_dir = source_dir / "agentlx"
for path in sorted(runtime_dir.rglob("*")):
    if not path.is_file():
        continue
    relative = path.relative_to(source_dir).as_posix()
    if relative.endswith(".pyc") or "__pycache__/" in relative:
        continue
    files.append(relative)

entries = []
for relative in sorted(files):
    body = (source_dir / relative).read_bytes()
    entries.append({
        "path": relative,
        "sha256": hashlib.sha256(body).hexdigest(),
        "size": len(body),
    })

payload = {
    "version": 1,
    "generatedAt": None,
    "files": entries,
}
output_file.write_text(json.dumps(payload, indent=2, ensure_ascii=True) + "\n", encoding="utf-8")
PY
}

copy_runtime_from_source() {
  local source_dir="$1"
  local target_dir="$2"

  python3 - "${source_dir}" "${target_dir}" <<'PY'
import os
import shutil
import sys
from pathlib import Path

source_dir = Path(sys.argv[1]).resolve()
target_dir = Path(sys.argv[2]).resolve()
files = ["agent.py", "requirements.txt", "config.example.json"]

runtime_dir = source_dir / "agentlx"
for path in sorted(runtime_dir.rglob("*")):
    if not path.is_file():
        continue
    relative = path.relative_to(source_dir).as_posix()
    if relative.endswith(".pyc") or "__pycache__/" in relative:
        continue
    files.append(relative)

for relative in sorted(set(files)):
    source_path = source_dir / relative
    target_path = target_dir / relative
    target_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source_path, target_path)
PY
}

resolve_runtime_urls() {
  if [ -n "${SOURCE_BASE_URL}" ]; then
    if [ -z "${RUNTIME_MANIFEST_URL}" ]; then
      RUNTIME_MANIFEST_URL="${SOURCE_BASE_URL%/}/runtime-manifest"
    fi
    if [ -z "${RUNTIME_FILE_URL}" ]; then
      RUNTIME_FILE_URL="${SOURCE_BASE_URL%/}/runtime"
    fi
  fi

  if [ -z "${RUNTIME_MANIFEST_URL}" ] && [ -n "${API_BASE_URL}" ]; then
    RUNTIME_MANIFEST_URL="${API_BASE_URL%/}/api/agent/files/runtime-manifest"
  fi

  if [ -z "${RUNTIME_FILE_URL}" ] && [ -n "${API_BASE_URL}" ]; then
    RUNTIME_FILE_URL="${API_BASE_URL%/}/api/agent/files/runtime"
  fi

  [ -n "${RUNTIME_MANIFEST_URL}" ] || fail "URL do manifesto do runtime nao configurada."
  [ -n "${RUNTIME_FILE_URL}" ] || fail "URL dos arquivos do runtime nao configurada."
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

fetch_agent_files() {
  local source_dir tmp_dir manifest_file
  install -d -m 0700 "${INSTALL_DIR}"

  if source_dir="$(resolve_local_source_dir)"; then
    log "copiando runtime local do agent para ${INSTALL_DIR}..."
    copy_runtime_from_source "${source_dir}" "${INSTALL_DIR}"
    build_local_runtime_manifest "${source_dir}" "${INSTALL_DIR}/${RUNTIME_MANIFEST_NAME}"
    return
  fi

  resolve_runtime_urls

  tmp_dir="$(mktemp -d)"
  manifest_file="${tmp_dir}/runtime-manifest.json"

  log "baixando manifesto do runtime..."
  download_file "${RUNTIME_MANIFEST_URL}" "${manifest_file}"
  log "baixando runtime modular do agent..."
  download_runtime_from_manifest "${manifest_file}" "${INSTALL_DIR}"
  install -m 0644 "${manifest_file}" "${INSTALL_DIR}/${RUNTIME_MANIFEST_NAME}"
  rm -rf "${tmp_dir}"
}

write_config() {
  local config_file example_file hostname_value
  config_file="${INSTALL_DIR}/config.json"
  example_file="${INSTALL_DIR}/config.example.json"
  hostname_value="$(hostname -s 2>/dev/null || hostname || echo agentlx-host)"

  if [ -z "${AGENT_NAME}" ]; then
    AGENT_NAME="${hostname_value}"
  fi

  python3 - "$config_file" "$example_file" "$API_BASE_URL" "$ENROLLMENT_TOKEN" "$AGENT_NAME" "$LOCATION" "$POLL_INTERVAL_SEC" "$HEARTBEAT_INTERVAL_SEC" "$INVENTORY_REFRESH_INTERVAL_SEC" "$TERMINAL_OUTPUT_BATCH_MS" "$TERMINAL_WORKING_DIRECTORY" "$AGENT_VERSION" <<'PY'
import json
import os
import sys

(
    config_path,
    example_path,
    api_base_url,
    enrollment_token,
    agent_name,
    location,
    poll_interval_sec,
    heartbeat_interval_sec,
    inventory_refresh_interval_sec,
    terminal_output_batch_ms,
    terminal_working_directory,
    agent_version,
) = sys.argv[1:]

data = {}

if os.path.exists(example_path):
    with open(example_path, "r", encoding="utf-8") as handle:
        data.update(json.load(handle))

if os.path.exists(config_path):
    with open(config_path, "r", encoding="utf-8") as handle:
        data.update(json.load(handle))

data["api_base_url"] = api_base_url.rstrip("/")
data["enrollment_token"] = enrollment_token
data["agent_name"] = agent_name
data["location"] = location
data["poll_interval_sec"] = int(poll_interval_sec)
data["heartbeat_interval_sec"] = int(heartbeat_interval_sec)
data["inventory_refresh_interval_sec"] = int(inventory_refresh_interval_sec)
data["terminal_output_batch_ms"] = int(terminal_output_batch_ms)
data["terminal_working_directory"] = terminal_working_directory
data["agent_version"] = agent_version
data["agent_secret"] = str(data.get("agent_secret") or "")
data["agent_token"] = ""
data["machine_id"] = str(data.get("machine_id") or "")
data["agent_id"] = str(data.get("agent_id") or "")
for key in (
    "agent_secret_persisted",
    "agent_secret_persisted_at",
    "agent_secret_last_persist_error",
):
    data.pop(key, None)

with open(config_path, "w", encoding="utf-8") as handle:
    json.dump(data, handle, indent=2, ensure_ascii=True)
    handle.write("\n")
PY
  chown root:root "${config_file}"
  chmod 0600 "${config_file}"
}

create_virtualenv() {
  local venv_dir="${INSTALL_DIR}/.venv"
  if [ ! -x "${venv_dir}/bin/python" ]; then
    log "criando virtualenv em ${venv_dir}..."
    python3 -m venv "${venv_dir}"
  fi

  log "instalando dependencias Python do agent..."
  "${venv_dir}/bin/python" -m pip install --upgrade pip setuptools wheel
  "${venv_dir}/bin/python" -m pip install -r "${INSTALL_DIR}/requirements.txt"
}

register_agent() {
  local python_bin="${INSTALL_DIR}/.venv/bin/python"
  log "registrando agent..."
  (
    cd "${INSTALL_DIR}"
    "${python_bin}" agent.py register
  )
}

ensure_service_active() {
  local python_bin="${INSTALL_DIR}/.venv/bin/python"

  if ! command -v systemctl >/dev/null 2>&1; then
    fail "systemctl nao encontrado. Este instalador exige systemd para validar o servico."
  fi

  if ! systemctl is-active --quiet "${SYSTEMD_SERVICE_NAME}"; then
    log "servico ${SYSTEMD_SERVICE_NAME} ainda nao esta ativo; tentando instalar/iniciar explicitamente..."
    (
      cd "${INSTALL_DIR}"
      "${python_bin}" agent.py install-service
    )
  fi

  if ! systemctl is-active --quiet "${SYSTEMD_SERVICE_NAME}"; then
    systemctl --no-pager status "${SYSTEMD_SERVICE_NAME}" || true
    fail "o servico ${SYSTEMD_SERVICE_NAME} nao ficou ativo apos a instalacao."
  fi

  log "servico ${SYSTEMD_SERVICE_NAME} validado com sucesso."
  systemctl --no-pager --full status "${SYSTEMD_SERVICE_NAME}" | sed -n '1,12p'
}

main() {
  require_root
  parse_args "$@"

  [ -n "${API_BASE_URL}" ] || fail "--api-base-url e obrigatorio."
  [ -n "${ENROLLMENT_TOKEN}" ] || fail "--enrollment-token e obrigatorio."

  assert_not_installed
  install_system_packages
  fetch_agent_files
  write_config
  create_virtualenv
  register_agent
  ensure_service_active

  log "instalacao concluida."
  log "diretorio: ${INSTALL_DIR}"
  log "configuracao: ${INSTALL_DIR}/config.json"
}

main "$@"
