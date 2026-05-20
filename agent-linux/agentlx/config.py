from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
CONFIG_PATH = ROOT / "config.json"
DEFAULT_CONFIG_PATH = ROOT / "config.example.json"
PID_PATH = ROOT / "agent.pid"
LOG_PATH = ROOT / "agent.log"
RUNTIME_MANIFEST_PATH = ROOT / ".agentlx-runtime-manifest.json"
SYSTEMD_SERVICE_NAME = "agentlx"
SYSTEMD_SERVICE_PATH = Path("/etc/systemd/system") / f"{SYSTEMD_SERVICE_NAME}.service"
SELF_UNINSTALL_MARKER = "__AGENTLX_SELF_UNINSTALL__"
SELF_UNINSTALL_DELAY_SEC = 8
DEFAULT_AGENT_VERSION = "agentlx-linux-0.1.0"
DEFAULT_POLL_INTERVAL_SEC = 30
DEFAULT_HEARTBEAT_INTERVAL_SEC = 60
DEFAULT_POLL_LIMIT = 3


def harden_config_file(path: Path = CONFIG_PATH) -> None:
    if not path.exists() or not hasattr(os, "stat"):
        return

    stat_result = path.stat()
    current_uid = getattr(os, "geteuid", lambda: stat_result.st_uid)()
    expected_uid = 0 if current_uid == 0 else current_uid
    if stat_result.st_uid != expected_uid:
        raise SystemExit(
            f"config.json possui owner inseguro: uid={stat_result.st_uid}, esperado={expected_uid}."
        )

    if stat_result.st_mode & 0o077:
        os.chmod(path, 0o600)


def load_config() -> dict[str, Any]:
    if not CONFIG_PATH.exists():
        if not DEFAULT_CONFIG_PATH.exists():
            raise SystemExit("Arquivo de configuracao nao encontrado.")
        return json.loads(DEFAULT_CONFIG_PATH.read_text(encoding="utf-8"))
    harden_config_file(CONFIG_PATH)
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def save_config(config: dict[str, Any]) -> None:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(config, indent=2, ensure_ascii=True) + "\n"

    with tempfile.NamedTemporaryFile(
        "w",
        encoding="utf-8",
        dir=str(CONFIG_PATH.parent),
        delete=False,
    ) as handle:
        handle.write(payload)
        handle.flush()
        os.fsync(handle.fileno())
        temp_path = Path(handle.name)

    os.chmod(temp_path, 0o600)
    os.replace(temp_path, CONFIG_PATH)
    os.chmod(CONFIG_PATH, 0o600)
    harden_config_file(CONFIG_PATH)


def resolve_terminal_working_directory(config: dict[str, Any]) -> str:
    configured_path = str(config.get("terminal_working_directory") or "").strip()
    candidates: list[str] = []

    if configured_path:
        candidates.append(configured_path)

    home_dir = os.path.expanduser("~")
    if os.geteuid() == 0:
        candidates.append("/root")
    candidates.append(home_dir)
    candidates.append(str(ROOT))

    for candidate in candidates:
        if candidate and os.path.isdir(candidate):
            return candidate

    return str(ROOT)


def get_config_int(
    config: dict[str, Any],
    key: str,
    default: int,
    minimum: int,
) -> int:
    try:
        value = int(config.get(key, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, value)
