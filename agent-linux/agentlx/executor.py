from __future__ import annotations

import os
import time
from typing import Any

from .config import ROOT
from .protocol import ACTION_AGENT_SELF_UNINSTALL, ACTION_AGENT_SYNC, ACTION_RUN_SHELL, QueuedExecution
from .system import (
    build_self_uninstall_script,
    is_linux,
    launch_self_uninstall_script,
    run_shell_command,
)
from .transport import request_agent_decommission, send_heartbeat, submit_execution_result_payload
from .utils import iso_now


def _submit_failure(
    config: dict[str, Any],
    execution: QueuedExecution,
    started_at: float,
    error_output: str,
) -> None:
    submit_execution_result_payload(
        config,
        {
            "executionId": execution.execution_id,
            "status": "failed",
            "output": "",
            "errorOutput": error_output,
            "exitCode": 1,
            "durationMs": int((time.time() - started_at) * 1000),
            "startedAt": iso_now(started_at),
            "finishedAt": iso_now(),
        },
    )


def handle_self_uninstall_execution(
    config: dict[str, Any],
    execution: QueuedExecution,
    started_at: float,
) -> None:
    start_time = iso_now(started_at)

    if not is_linux():
        _submit_failure(
            config,
            execution,
            started_at,
            "A desinstalacao automatica do agent e suportada apenas em Linux.",
        )
        return

    if not hasattr(os, "geteuid") or os.geteuid() != 0:
        _submit_failure(
            config,
            execution,
            started_at,
            "O agent precisa estar em execucao como root para concluir a desinstalacao.",
        )
        return

    script_path = build_self_uninstall_script(ROOT)
    finished_at = time.time()

    submit_execution_result_payload(
        config,
        {
            "executionId": execution.execution_id,
            "status": "success",
            "output": f"Desinstalacao do agent agendada com sucesso. Script temporario: {script_path}",
            "errorOutput": "",
            "exitCode": 0,
            "durationMs": int((finished_at - started_at) * 1000),
            "startedAt": start_time,
            "finishedAt": iso_now(finished_at),
        },
    )

    launch_self_uninstall_script(script_path)


def uninstall_local_agent(config: dict[str, Any]) -> None:
    if not is_linux():
        raise SystemExit("A desinstalacao automatica do agent e suportada apenas em Linux.")
    if os.geteuid() != 0:
        raise SystemExit("Execute 'python agent.py uninstall' com sudo ou como root.")

    if config.get("agent_secret") and config.get("agent_id"):
        try:
            request_agent_decommission(config, None, mode="manual")
        except Exception as exc:
            raise SystemExit(
                f"Nao foi possivel remover o agent do painel antes da desinstalacao local: {exc}"
            ) from exc

    script_path = build_self_uninstall_script(ROOT)
    launch_self_uninstall_script(script_path)
    print(f"Desinstalacao do agent agendada. Script temporario: {script_path}")


def run_shell_action(
    config: dict[str, Any],
    execution: QueuedExecution,
    started_at: float,
) -> None:
    command = execution.shell_command().strip()
    if not command:
        _submit_failure(config, execution, started_at, "Nenhum comando foi recebido para execucao.")
        return

    start_time = iso_now(started_at)
    code, stdout, stderr = run_shell_command(command, timeout=execution.timeout_sec)
    finished_at = time.time()
    payload = {
        "executionId": execution.execution_id,
        "status": "success" if code == 0 else "failed",
        "output": stdout,
        "errorOutput": stderr,
        "exitCode": code,
        "durationMs": int((finished_at - started_at) * 1000),
        "startedAt": start_time,
        "finishedAt": iso_now(finished_at),
    }
    submit_execution_result_payload(config, payload)


def run_agent_sync_action(
    config: dict[str, Any],
    collector: Any,
    execution: QueuedExecution,
    started_at: float,
) -> None:
    if collector is None:
        _submit_failure(
            config,
            execution,
            started_at,
            "Coletor de inventario indisponivel no agent.",
        )
        return

    start_time = iso_now(started_at)
    heartbeat = send_heartbeat(config, collector, force_inventory_refresh=True)
    finished_at = time.time()
    status = heartbeat.get("status", "desconhecido")
    pending = heartbeat.get("pendingExecutions", 0)
    submit_execution_result_payload(
        config,
        {
            "executionId": execution.execution_id,
            "status": "success",
            "output": f"Sincronizacao concluida. Status={status} pendentes={pending}.",
            "errorOutput": "",
            "exitCode": 0,
            "durationMs": int((finished_at - started_at) * 1000),
            "startedAt": start_time,
            "finishedAt": iso_now(finished_at),
        },
    )


def execute_queued_execution(
    config: dict[str, Any],
    execution: QueuedExecution,
    started_at: float,
    collector: Any = None,
) -> None:
    if execution.action_type == ACTION_AGENT_SELF_UNINSTALL:
        handle_self_uninstall_execution(config, execution, started_at)
        return

    if execution.action_type == ACTION_AGENT_SYNC:
        run_agent_sync_action(config, collector, execution, started_at)
        return

    if execution.action_type == ACTION_RUN_SHELL:
        run_shell_action(config, execution, started_at)
        return

    _submit_failure(
        config,
        execution,
        started_at,
        f"Tipo de acao nao suportado pelo agent: {execution.action_type}",
    )
