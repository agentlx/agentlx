from __future__ import annotations

import json
import os
import shutil
import sys
import threading
import time
from typing import Any

from .config import (
    DEFAULT_HEARTBEAT_INTERVAL_SEC,
    DEFAULT_POLL_INTERVAL_SEC,
    DEFAULT_POLL_LIMIT,
    DEFAULT_AGENT_VERSION,
    SYSTEMD_SERVICE_NAME,
    SYSTEMD_SERVICE_PATH,
    get_config_int,
    load_config,
)
from .executor import execute_queued_execution, uninstall_local_agent
from .inventory import SnapshotCollector
from .system import (
    ensure_single_instance,
    install_systemd_service,
    is_linux,
    print_status,
    process_is_running,
    read_pid,
    remove_pid_file,
    run_systemctl,
    spawn_background_agent_process,
    stop_background_agent,
    uninstall_systemd_service,
)
from .transport import poll_executions, register_agent, send_heartbeat


def auto_install_service_after_register() -> None:
    if not is_linux():
        return

    if not shutil.which("systemctl"):
        print("Registro concluido. systemctl nao encontrado; servico nao instalado automaticamente.")
        return

    if getattr(os, "geteuid", lambda: 1)() != 0:
        print(
            "Registro concluido. Execute 'sudo python3 agent.py install-service' para instalar o servico automaticamente no boot."
        )
        return

    install_systemd_service()


def start_background_agent() -> None:
    from .terminal import assert_terminal_dependencies_available

    assert_terminal_dependencies_available()

    if shutil.which("systemctl") and SYSTEMD_SERVICE_PATH.exists():
        result = run_systemctl("restart", SYSTEMD_SERVICE_NAME)
        if result.returncode != 0:
            raise SystemExit(result.stderr.strip() or result.stdout.strip() or "Falha ao iniciar o servico.")
        print(f"Servico {SYSTEMD_SERVICE_NAME} iniciado/reiniciado em background.")
        return

    existing_pid = read_pid()
    if existing_pid and process_is_running(existing_pid):
        raise SystemExit(f"Agent ja esta em execucao com PID {existing_pid}.")
    if existing_pid:
        remove_pid_file()

    pid = spawn_background_agent_process()
    print(f"Agent iniciado em background com PID {pid}. Logs: agent.log")


def run_loop(config: dict[str, Any], collector: SnapshotCollector) -> None:
    from .terminal import RealtimeTunnelClient

    if not config.get("agent_secret") or not config.get("agent_id"):
        raise SystemExit("Agent ainda nao registrado. Execute 'python agent.py register' primeiro.")

    poll_interval = get_config_int(config, "poll_interval_sec", DEFAULT_POLL_INTERVAL_SEC, 10)
    heartbeat_interval = get_config_int(
        config,
        "heartbeat_interval_sec",
        max(DEFAULT_HEARTBEAT_INTERVAL_SEC, poll_interval),
        poll_interval,
    )
    poll_limit = get_config_int(config, "poll_limit", DEFAULT_POLL_LIMIT, 1)

    wake_event = threading.Event()
    tunnel = RealtimeTunnelClient(config, wake_event=wake_event)
    tunnel.start()
    next_heartbeat_at = 0.0
    print(
        f"Loop iniciado com poll={poll_interval}s heartbeat={heartbeat_interval}s "
        f"limite={poll_limit} versao={config.get('agent_version', DEFAULT_AGENT_VERSION)}"
    )
    try:
        while True:
            now = time.monotonic()
            if now >= next_heartbeat_at:
                try:
                    heartbeat = send_heartbeat(config, collector)
                    print(
                        f"Heartbeat enviado: machine={heartbeat.get('machineId')} "
                        f"status={heartbeat.get('status')} pending={heartbeat.get('pendingExecutions')}"
                    )
                except Exception as exc:
                    print(f"[agent] erro no heartbeat: {exc}", file=sys.stderr)
                next_heartbeat_at = now + heartbeat_interval

            try:
                executions = poll_executions(config, poll_limit)
            except Exception as exc:
                print(f"[agent] erro no poll: {exc}", file=sys.stderr)
                executions = []

            for execution in executions:
                try:
                    print(
                        f"Executando acao {execution.action_type} "
                        f"template={execution.template_id} maquina={execution.machine_id}"
                    )
                    execute_queued_execution(config, execution, time.time(), collector)
                except Exception as exc:
                    print(
                        f"[agent] erro ao executar {execution.execution_id}: {exc}",
                        file=sys.stderr,
                    )

            wake_event.wait(timeout=poll_interval)
            wake_event.clear()
    finally:
        tunnel.stop()


def run_foreground(config: dict[str, Any]) -> None:
    ensure_single_instance()
    collector = SnapshotCollector(config)
    try:
        run_loop(config, collector)
    finally:
        remove_pid_file()


def load_runtime_config() -> dict[str, Any]:
    config = load_config()
    if not config.get("agent_version"):
        config["agent_version"] = DEFAULT_AGENT_VERSION
    return config


def main() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "run"

    if command == "status":
        print_status()
        return
    if command == "stop":
        stop_background_agent()
        return
    if command == "install-service":
        install_systemd_service()
        return
    if command == "uninstall-service":
        uninstall_systemd_service()
        return

    config = load_runtime_config()

    if command == "register":
        collector = SnapshotCollector(config)
        register_agent(config, collector)
        auto_install_service_after_register()
        return
    if command == "once":
        collector = SnapshotCollector(config)
        print(json.dumps(send_heartbeat(config, collector), indent=2))
        return
    if command == "run":
        start_background_agent()
        return
    if command == "run-foreground":
        run_foreground(config)
        return
    if command == "uninstall":
        uninstall_local_agent(config)
        return
    raise SystemExit(f"Comando invalido: {command}")
