from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Mapping

from .config import SELF_UNINSTALL_MARKER

ACTION_RUN_SHELL = "run_shell"
ACTION_AGENT_SELF_UNINSTALL = "agent_self_uninstall"
ACTION_AGENT_SYNC = "agent_sync"
SUPPORTED_ACTION_TYPES = {
    ACTION_RUN_SHELL,
    ACTION_AGENT_SELF_UNINSTALL,
    ACTION_AGENT_SYNC,
}


@dataclass(frozen=True)
class QueuedExecution:
    execution_id: str
    template_id: str
    template_name: str
    machine_id: str
    timeout_sec: int
    action_type: str
    payload: dict[str, Any] = field(default_factory=dict)
    legacy_command: str = ""

    def shell_command(self) -> str:
        command = self.payload.get("command")
        if isinstance(command, str) and command.strip():
            return command
        return self.legacy_command


def infer_action_type(raw: Mapping[str, Any]) -> str:
    action_type = str(raw.get("actionType") or "").strip()
    if action_type in SUPPORTED_ACTION_TYPES:
        return action_type
    if str(raw.get("command") or "") == SELF_UNINSTALL_MARKER:
        return ACTION_AGENT_SELF_UNINSTALL
    return ACTION_RUN_SHELL


def normalize_queued_execution(raw: Mapping[str, Any]) -> QueuedExecution:
    payload = raw.get("payload")
    normalized_payload = dict(payload) if isinstance(payload, dict) else {}
    legacy_command = str(raw.get("command") or "")
    action_type = infer_action_type(raw)

    if action_type == ACTION_RUN_SHELL and legacy_command and not normalized_payload.get("command"):
        normalized_payload["command"] = legacy_command

    return QueuedExecution(
        execution_id=str(raw.get("executionId") or ""),
        template_id=str(raw.get("templateId") or "terminal-remote-shell"),
        template_name=str(raw.get("templateName") or "Execucao remota"),
        machine_id=str(raw.get("machineId") or ""),
        timeout_sec=max(5, int(raw.get("timeoutSec") or 120)),
        action_type=action_type,
        payload=normalized_payload,
        legacy_command=legacy_command,
    )
