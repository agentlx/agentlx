from __future__ import annotations

import base64
import hashlib
import hmac
import json
import uuid
from typing import TYPE_CHECKING, Any
from urllib import error, request

from .config import (
    DEFAULT_AGENT_VERSION,
    DEFAULT_POLL_INTERVAL_SEC,
    save_config,
)
from .protocol import QueuedExecution, normalize_queued_execution
from .utils import iso_now

if TYPE_CHECKING:
    from .inventory import SnapshotCollector


def sign_agent_request(
    agent_secret: str,
    method: str,
    path: str,
    timestamp: str,
    nonce: str,
    body_text: str,
) -> str:
    body_hash = hashlib.sha256(body_text.encode("utf-8")).hexdigest()
    payload = "\n".join([method.upper(), path, timestamp, nonce, body_hash]).encode("utf-8")
    digest = hmac.new(agent_secret.encode("utf-8"), payload, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def api_request(
    config: dict[str, Any],
    method: str,
    path: str,
    payload: dict[str, Any] | None = None,
    use_agent_auth: bool = False,
    extra_headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    url = config["api_base_url"].rstrip("/") + path
    headers = {"Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)

    body_text = "" if payload is None else json.dumps(payload, ensure_ascii=True, separators=(",", ":"))
    if use_agent_auth:
        agent_id = str(config.get("agent_id") or "").strip()
        agent_secret = str(config.get("agent_secret") or "").strip()
        if not agent_id or not agent_secret:
            raise RuntimeError("Agent ainda nao registrado ou segredo local ausente.")
        headers["Authorization"] = f"Agent {agent_id}"
        timestamp = iso_now()
        nonce = uuid.uuid4().hex
        headers["x-agent-auth-version"] = "v2"
        headers["x-agent-auth-timestamp"] = timestamp
        headers["x-agent-auth-nonce"] = nonce
        headers["x-agent-auth-signature"] = sign_agent_request(
            agent_secret,
            method,
            path,
            timestamp,
            nonce,
            body_text,
        )

    data = body_text.encode("utf-8")
    req = request.Request(url, data=data, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=20) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw) if raw else {}
            return parsed
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"HTTP {exc.code}: {body}") from exc
    except error.URLError as exc:
        raise RuntimeError(f"Erro de conexao com a API: {exc}") from exc


def build_ws_url(config: dict[str, Any], path: str) -> str:
    base_url = config["api_base_url"].rstrip("/")
    if base_url.startswith("https://"):
        return "wss://" + base_url[len("https://") :] + path
    if base_url.startswith("http://"):
        return "ws://" + base_url[len("http://") :] + path
    return base_url + path


def request_agent_decommission(
    config: dict[str, Any],
    execution_id: str | None = None,
    mode: str = "panel",
) -> dict[str, Any]:
    payload: dict[str, Any] = {"mode": mode}
    if execution_id:
        payload["executionId"] = execution_id
    return api_request(config, "POST", "/api/agent/decommission", payload, use_agent_auth=True)


def submit_execution_result_payload(config: dict[str, Any], payload: dict[str, Any]) -> None:
    api_request(config, "POST", "/api/agent/executions/result", payload, use_agent_auth=True)


def register_agent(config: dict[str, Any], collector: SnapshotCollector) -> None:
    snapshot, _ = collector.collect_snapshot(force_inventory_refresh=True)
    payload = {
        "agentName": config.get("agent_name", collector.hostname),
        "agentVersion": config.get("agent_version", DEFAULT_AGENT_VERSION),
        "pollIntervalSec": config.get("poll_interval_sec", DEFAULT_POLL_INTERVAL_SEC),
        "snapshot": snapshot,
    }
    agent_id = str(config.get("agent_id") or "").strip()
    machine_id = str(config.get("machine_id") or "").strip()
    if agent_id:
        payload["agentId"] = agent_id
    if machine_id:
        payload["machineId"] = machine_id
    response = api_request(
        config,
        "POST",
        "/api/agent/register",
        payload,
        extra_headers={"x-agent-enrollment-token": config["enrollment_token"]},
    )
    config["agent_secret"] = response["agentSecret"]
    config["machine_id"] = response["machineId"]
    config["agent_id"] = response["agentId"]
    config["poll_interval_sec"] = response["pollIntervalSec"]
    config["agent_token"] = ""
    save_config(config)
    print(f"Agent registrado com machine_id={config['machine_id']} e agent_id={config['agent_id']}")


def send_heartbeat(
    config: dict[str, Any],
    collector: SnapshotCollector,
    force_inventory_refresh: bool = False,
) -> dict[str, Any]:
    snapshot, inventory_refreshed = collector.collect_snapshot(
        force_inventory_refresh=force_inventory_refresh
    )
    payload = {
        "agentVersion": config.get("agent_version", DEFAULT_AGENT_VERSION),
        "snapshot": snapshot,
        "lastHeartbeatAt": iso_now(),
        "includeInventory": inventory_refreshed,
    }
    return api_request(config, "POST", "/api/agent/heartbeat", payload, use_agent_auth=True)


def poll_executions(config: dict[str, Any], limit: int) -> list[QueuedExecution]:
    response = api_request(
        config,
        "POST",
        "/api/agent/poll",
        {"limit": limit},
        use_agent_auth=True,
    )
    return [normalize_queued_execution(item) for item in response.get("executions", [])]
