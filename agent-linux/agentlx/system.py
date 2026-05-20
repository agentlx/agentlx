from __future__ import annotations

import os
import platform
import re
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

from .config import LOG_PATH, PID_PATH, ROOT, SELF_UNINSTALL_DELAY_SEC, SYSTEMD_SERVICE_NAME, SYSTEMD_SERVICE_PATH
from .utils import clamp


def is_linux() -> bool:
    return platform.system().lower() == "linux"


def process_is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def read_pid() -> int | None:
    if not PID_PATH.exists():
        return None
    try:
        return int(PID_PATH.read_text(encoding="utf-8").strip())
    except (OSError, ValueError):
        return None


def remove_pid_file() -> None:
    try:
        if PID_PATH.exists():
            PID_PATH.unlink()
    except OSError:
        pass


def ensure_single_instance() -> None:
    existing_pid = read_pid()
    if existing_pid and process_is_running(existing_pid):
        raise SystemExit(f"Agent ja esta em execucao com PID {existing_pid}.")
    if existing_pid:
        remove_pid_file()
    PID_PATH.write_text(str(os.getpid()), encoding="utf-8")


def build_systemd_unit() -> str:
    python_bin = Path(sys.executable).resolve()
    agent_script = (ROOT / "agent.py").resolve()
    working_dir = ROOT.resolve()
    return f"""[Unit]
Description=agentlx Linux Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory={working_dir}
ExecStart={python_bin} {agent_script} run-foreground
Restart=always
RestartSec=5
Environment=PYTHONUNBUFFERED=1
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=read-only
ReadWritePaths={working_dir} /run /tmp /var/tmp
ProtectControlGroups=true
ProtectKernelModules=true
ProtectKernelTunables=true
LockPersonality=true
RestrictRealtime=true
RestrictSUIDSGID=true
SystemCallArchitectures=native
CapabilityBoundingSet=CAP_CHOWN CAP_DAC_OVERRIDE CAP_DAC_READ_SEARCH CAP_FOWNER CAP_KILL CAP_NET_BIND_SERVICE CAP_SETGID CAP_SETUID CAP_SYS_BOOT

[Install]
WantedBy=multi-user.target
"""


def run_process(
    args: list[str],
    timeout: int = 15,
    capture_output: bool = True,
    input_text: str | None = None,
) -> tuple[int, str, str]:
    stdout_pipe: int | None = subprocess.PIPE if capture_output else None
    stderr_pipe: int | None = subprocess.PIPE if capture_output else None
    stdin_pipe: int | None = subprocess.PIPE if input_text is not None else None

    process = subprocess.Popen(
        args,
        stdin=stdin_pipe,
        stdout=stdout_pipe,
        stderr=stderr_pipe,
        text=True,
        encoding="utf-8",
        errors="replace",
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(input=input_text, timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except OSError:
            pass
        try:
            stdout, stderr = process.communicate(timeout=1)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except OSError:
                pass
            stdout, stderr = process.communicate()
        return 124, (stdout or "").strip(), f"Command timed out after {timeout}s"
    except Exception as exc:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except OSError:
            pass
        process.wait(timeout=1)
        return 1, "", str(exc)

    return process.returncode, (stdout or "").strip(), (stderr or "").strip()


def run_shell_command(command: str, timeout: int = 15) -> tuple[int, str, str]:
    shell = shutil.which("bash") or shutil.which("sh") or "/bin/sh"
    return run_process([shell, "-lc", command], timeout=timeout)


def run_systemctl(*args: str) -> subprocess.CompletedProcess[str]:
    if not shutil.which("systemctl"):
        raise SystemExit("systemctl nao encontrado. Este recurso exige systemd.")
    return subprocess.run(
        ["systemctl", *args],
        capture_output=True,
        text=True,
        check=False,
    )


def install_systemd_service() -> None:
    if not is_linux():
        raise SystemExit("A instalacao do servico e suportada apenas em Linux.")
    if os.geteuid() != 0:
        raise SystemExit("Execute 'python agent.py install-service' com sudo ou como root.")

    SYSTEMD_SERVICE_PATH.write_text(build_systemd_unit(), encoding="utf-8")

    for args in (
        ("daemon-reload",),
        ("enable", SYSTEMD_SERVICE_NAME),
        ("restart", SYSTEMD_SERVICE_NAME),
    ):
        result = run_systemctl(*args)
        if result.returncode != 0:
            raise SystemExit(result.stderr.strip() or result.stdout.strip() or "Falha no systemctl.")

    print(f"Servico {SYSTEMD_SERVICE_NAME} instalado em {SYSTEMD_SERVICE_PATH} e iniciado.")


def uninstall_systemd_service() -> None:
    if not is_linux():
        raise SystemExit("A remocao do servico e suportada apenas em Linux.")
    if os.geteuid() != 0:
        raise SystemExit("Execute 'python agent.py uninstall-service' com sudo ou como root.")

    if shutil.which("systemctl"):
        run_systemctl("stop", SYSTEMD_SERVICE_NAME)
        run_systemctl("disable", SYSTEMD_SERVICE_NAME)

    if SYSTEMD_SERVICE_PATH.exists():
        SYSTEMD_SERVICE_PATH.unlink()

    if shutil.which("systemctl"):
        run_systemctl("daemon-reload")
        run_systemctl("reset-failed", SYSTEMD_SERVICE_NAME)

    print(f"Servico {SYSTEMD_SERVICE_NAME} removido.")


def print_status() -> None:
    pid = read_pid()
    if pid and process_is_running(pid):
        print(f"Agent em execucao com PID {pid}.")
    else:
        print("Agent nao esta em execucao em background.")

    if shutil.which("systemctl") and SYSTEMD_SERVICE_PATH.exists():
        result = run_systemctl("is-active", SYSTEMD_SERVICE_NAME)
        service_state = result.stdout.strip() or "unknown"
        print(f"Servico systemd: {service_state}")


def stop_background_agent() -> None:
    if shutil.which("systemctl") and SYSTEMD_SERVICE_PATH.exists():
        result = run_systemctl("stop", SYSTEMD_SERVICE_NAME)
        if result.returncode != 0:
            raise SystemExit(result.stderr.strip() or result.stdout.strip() or "Falha ao parar o servico.")
        print(f"Servico {SYSTEMD_SERVICE_NAME} parado.")
        return

    pid = read_pid()
    if not pid:
        raise SystemExit("Nenhum PID local encontrado para o agent.")
    if not process_is_running(pid):
        remove_pid_file()
        raise SystemExit("O PID salvo nao esta mais ativo.")

    os.kill(pid, 15)
    for _ in range(20):
        if not process_is_running(pid):
            remove_pid_file()
            print(f"Agent com PID {pid} finalizado.")
            return
        time.sleep(0.25)

    raise SystemExit(f"Nao foi possivel finalizar o agent com PID {pid}.")


def spawn_background_agent_process() -> int:
    with LOG_PATH.open("a", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [sys.executable, str((ROOT / "agent.py").resolve()), "run-foreground"],
            cwd=str(ROOT),
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    return process.pid


def build_self_uninstall_script(remove_root: Path) -> Path:
    script_path = Path(tempfile.gettempdir()) / (
        f"lxagent-remove-{int(time.time())}-{os.getpid()}.sh"
    )
    quoted_root = shlex.quote(str(remove_root.resolve()))
    quoted_service_name = shlex.quote(SYSTEMD_SERVICE_NAME)
    quoted_service = shlex.quote(str(SYSTEMD_SERVICE_PATH))

    script = f"""#!/bin/sh
set -eu
SERVICE_NAME={quoted_service_name}
AGENT_ROOT={quoted_root}
SERVICE_PATH={quoted_service}

case "$AGENT_ROOT" in
  ""|"/"|"/bin"|"/boot"|"/dev"|"/etc"|"/home"|"/lib"|"/lib64"|"/opt"|"/proc"|"/root"|"/run"|"/sbin"|"/sys"|"/tmp"|"/usr"|"/var")
    exit 1
    ;;
esac

if [ ! -f "$AGENT_ROOT/agent.py" ] && [ ! -d "$AGENT_ROOT/agentlx" ]; then
  exit 1
fi

sleep {SELF_UNINSTALL_DELAY_SEC}
if command -v systemctl >/dev/null 2>&1; then
  systemctl stop "$SERVICE_NAME" >/dev/null 2>&1 || true
  systemctl disable "$SERVICE_NAME" >/dev/null 2>&1 || true
fi
rm -f "$SERVICE_PATH" >/dev/null 2>&1 || true
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload >/dev/null 2>&1 || true
  systemctl reset-failed "$SERVICE_NAME" >/dev/null 2>&1 || true
fi
if command -v pkill >/dev/null 2>&1; then
  pkill -TERM -f "$AGENT_ROOT/agent.py" >/dev/null 2>&1 || true
  sleep 1
  pkill -KILL -f "$AGENT_ROOT/agent.py" >/dev/null 2>&1 || true
fi
rm -rf -- "$AGENT_ROOT" >/dev/null 2>&1 || true
rm -f -- "$0" >/dev/null 2>&1 || true
"""
    script_path.write_text(script, encoding="utf-8")
    os.chmod(script_path, 0o700)
    return script_path


def launch_self_uninstall_script(script_path: Path) -> None:
    systemd_run = shutil.which("systemd-run")
    if systemd_run and shutil.which("systemctl"):
        unit_name = f"lxagent-remove-{int(time.time())}-{os.getpid()}"
        result = subprocess.run(
            [
                systemd_run,
                "--unit",
                unit_name,
                "--collect",
                "/bin/sh",
                str(script_path),
            ],
            cwd="/",
            stdin=subprocess.DEVNULL,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
        if result.returncode == 0:
            return

    subprocess.Popen(
        ["/bin/sh", str(script_path)],
        cwd="/",
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )


def parse_os_release() -> dict[str, str]:
    candidates = [Path("/etc/os-release"), Path("/usr/lib/os-release")]
    for path in candidates:
        if not path.exists():
            continue
        data: dict[str, str] = {}
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            data[key] = value.strip().strip('"').strip("'")
        if data:
            return data
    return {}


def normalize_distro_id(raw_id: str, raw_name: str, raw_pretty_name: str) -> str:
    base = (raw_id or "").strip().lower().replace("_", "-")
    name_blob = f"{raw_name} {raw_pretty_name}".lower()
    if base == "centos" and "stream" in name_blob:
        return "centos-stream"
    if base in {"redhat", "red-hat-enterprise-linux"}:
        return "rhel"
    if base == "rocky linux":
        return "rocky"
    if base == "alma linux":
        return "almalinux"
    return base or "linux"


def distro_family_for(distro_id: str, like_ids: list[str]) -> str:
    debian_like = {"debian", "ubuntu", "linuxmint", "raspbian", "pop", "neon", "elementary"}
    redhat_like = {
        "rhel",
        "redhat",
        "centos",
        "centos-stream",
        "fedora",
        "rocky",
        "almalinux",
        "cloudlinux",
        "ol",
        "amzn",
        "amazon",
    }
    gentoo_like = {"gentoo"}
    suse_like = {"opensuse", "opensuse-leap", "sles"}
    arch_like = {"arch", "manjaro"}
    alpine_like = {"alpine"}

    tokens = {distro_id, *like_ids}
    if tokens & debian_like:
        return "debian"
    if tokens & redhat_like:
        return "redhat"
    if tokens & gentoo_like:
        return "gentoo"
    if tokens & suse_like:
        return "suse"
    if tokens & arch_like:
        return "arch"
    if tokens & alpine_like:
        return "alpine"
    return "linux"


def read_distribution() -> dict[str, Any]:
    os_release = parse_os_release()
    pretty_name = os_release.get("PRETTY_NAME") or os_release.get("NAME") or "Linux"
    name = os_release.get("NAME") or pretty_name
    raw_id = os_release.get("ID", "")
    like_ids = [
        item.strip().lower().replace("_", "-")
        for item in os_release.get("ID_LIKE", "").split()
        if item.strip()
    ]
    distro_id = normalize_distro_id(raw_id, name, pretty_name)
    return {
        "id": distro_id,
        "family": distro_family_for(distro_id, like_ids),
        "version": os_release.get("VERSION_ID", ""),
        "name": name,
        "prettyName": pretty_name,
        "like": like_ids,
    }


def get_ip_address() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            return sock.getsockname()[0]
    except OSError:
        hostname = socket.gethostname()
        try:
            return socket.gethostbyname(hostname)
        except OSError:
            return "127.0.0.1"


def read_uptime_seconds() -> int:
    uptime_path = Path("/proc/uptime")
    if uptime_path.exists():
        raw = uptime_path.read_text(encoding="utf-8").split()[0]
        return int(float(raw))
    return 0


def read_memory() -> tuple[float, float]:
    meminfo_path = Path("/proc/meminfo")
    if meminfo_path.exists():
        data: dict[str, int] = {}
        for line in meminfo_path.read_text(encoding="utf-8").splitlines():
            if ":" not in line:
                continue
            key, value = line.split(":", 1)
            data[key.strip()] = int(value.strip().split()[0])
        total = data.get("MemTotal", 0) / 1024 / 1024
        available = data.get("MemAvailable", 0) / 1024 / 1024
        used = max(total - available, 0)
        return round(used, 2), round(total, 2)
    return 0.0, 0.0


def read_cpu_times() -> tuple[int, int] | None:
    stat_path = Path("/proc/stat")
    if not stat_path.exists():
        return None

    first_line = stat_path.read_text(encoding="utf-8").splitlines()[0]
    parts = first_line.split()
    if len(parts) < 5 or parts[0] != "cpu":
        return None

    values = [int(value) for value in parts[1:]]
    idle = values[3] + (values[4] if len(values) > 4 else 0)
    total = sum(values)
    return total, idle


def compute_cpu_percent(previous: tuple[int, int], current: tuple[int, int]) -> float:
    total_delta = current[0] - previous[0]
    idle_delta = current[1] - previous[1]
    if total_delta <= 0:
        return 0.0
    busy = total_delta - idle_delta
    return round(clamp((busy / total_delta) * 100, 0.0, 100.0), 2)


def read_disk_percent() -> float:
    try:
        stats = os.statvfs("/")
    except OSError:
        return 0.0

    total_blocks = stats.f_blocks
    available_blocks = stats.f_bavail
    if total_blocks <= 0:
        return 0.0

    used_blocks = total_blocks - available_blocks
    return round(clamp((used_blocks / total_blocks) * 100, 0.0, 100.0), 2)


def command_exists(command: str) -> bool:
    return shutil.which(command) is not None


def process_exit_code(args: list[str], timeout: int = 5) -> int:
    code, _, _ = run_process(args, timeout=timeout, capture_output=False)
    return code


SERVICE_DISPLAY_NAMES = {
    "nginx": "Nginx",
    "mariadb": "MariaDB",
    "mysql": "MySQL",
    "redis": "Redis",
    "redis-server": "Redis",
    "postfix": "Postfix",
    "ssh": "SSH",
    "sshd": "SSH",
    "docker": "Docker",
    "containerd": "Containerd",
    "postgresql": "PostgreSQL",
    "cron": "Cron",
    "crond": "Cron",
    "carbonio": "Carbonio",
}


def normalize_service_slug(unit_name: str) -> str:
    slug = unit_name.strip().lower()
    if slug.endswith(".service"):
        slug = slug[:-8]
    slug = re.sub(r"[^a-z0-9._@-]+", "-", slug).strip(".-_@")
    return slug[:64]


def service_display_name(slug: str) -> str:
    base_slug = slug.split("@", 1)[0]
    return SERVICE_DISPLAY_NAMES.get(base_slug, slug)[:120]


def list_systemd_units() -> str:
    if not command_exists("systemctl"):
        return ""
    code, stdout, _ = run_process(
        ["systemctl", "list-units", "--type=service", "--plain", "--no-legend", "--no-pager"],
        timeout=5,
    )
    if code != 0:
        return ""
    return stdout.lower()


def detect_services() -> list[dict[str, str]]:
    services: dict[str, dict[str, str]] = {}

    def add(slug: str, display_name: str) -> None:
        normalized_slug = normalize_service_slug(slug)
        if not normalized_slug:
            return
        services[normalized_slug] = {
            "slug": normalized_slug,
            "displayName": display_name.strip()[:120] or service_display_name(normalized_slug),
            "detectedBy": "agent",
        }

    if command_exists("systemctl"):
        code, stdout, _ = run_process(
            [
                "systemctl",
                "list-units",
                "--type=service",
                "--state=running",
                "--plain",
                "--no-legend",
                "--no-pager",
            ],
            timeout=5,
        )
        if code == 0:
            for line in stdout.splitlines():
                unit_name = line.split(None, 1)[0] if line.strip() else ""
                if not unit_name.endswith(".service"):
                    continue
                slug = normalize_service_slug(unit_name)
                if slug:
                    add(slug, service_display_name(slug))

    if Path("/opt/zextras").is_dir() or Path("/opt/carbonio").is_dir() or command_exists("zmcontrol"):
        add("carbonio", "Carbonio")
    else:
        units = list_systemd_units()
        if "carbonio" in units or "zextras" in units:
            add("carbonio", "Carbonio")

    return list(services.values())

