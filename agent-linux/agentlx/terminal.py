from __future__ import annotations

import asyncio
import errno
import fcntl
import inspect
import json
import os
import pty
import shlex
import shutil
import struct
import sys
import termios
import threading
import time
from pathlib import Path
from typing import Any

from .config import DEFAULT_TERMINAL_OUTPUT_BATCH_MS, resolve_terminal_working_directory
from .transport import AGENT_HTTP_USER_AGENT, api_request, build_ws_url, sign_agent_request
from .utils import iso_now

try:
    import websockets
except ModuleNotFoundError:
    websockets = None

WebSocketConnection = Any


def assert_terminal_dependencies_available() -> None:
    if websockets is None:
        raise SystemExit(
            "Dependencia ausente: instale o pacote 'websockets' com "
            "'pip3 install -r requirements.txt' antes de iniciar o agent."
        )


class RealtimeTunnelClient:
    def __init__(self, config: dict[str, Any], wake_event: threading.Event | None = None) -> None:
        self.config = config
        self.wake_event = wake_event
        self.thread: threading.Thread | None = None
        self.stop_event = threading.Event()
        self.loop: asyncio.AbstractEventLoop | None = None
        self.sessions: dict[str, dict[str, Any]] = {}
        batch_ms = int(config.get("terminal_output_batch_ms", DEFAULT_TERMINAL_OUTPUT_BATCH_MS))
        self.output_batch_window_sec = max(0.005, batch_ms / 1000)

    def _require_websockets(self) -> None:
        assert_terminal_dependencies_available()

    def start(self) -> None:
        self._require_websockets()
        if self.thread and self.thread.is_alive():
            return
        self.thread = threading.Thread(target=self._run, name="agentlx-realtime-tunnel", daemon=True)
        self.thread.start()

    def stop(self) -> None:
        self.stop_event.set()
        if self.loop and self.loop.is_running():
            self.loop.call_soon_threadsafe(lambda: None)

    def _run(self) -> None:
        asyncio.run(self._main())

    def _connect(self, ws_url: str, headers: dict[str, str]) -> Any:
        kwargs = {
            "ping_interval": 20,
            "ping_timeout": 20,
            "max_size": None,
            "compression": None,
        }
        try:
            parameters = inspect.signature(websockets.connect).parameters
        except (TypeError, ValueError):
            parameters = {}

        header_arg = "additional_headers" if "additional_headers" in parameters else "extra_headers"
        kwargs[header_arg] = headers
        return websockets.connect(ws_url, **kwargs)

    async def _main(self) -> None:
        self.loop = asyncio.get_running_loop()
        while not self.stop_event.is_set():
            if not self.config.get("agent_secret") or not self.config.get("agent_id"):
                await asyncio.sleep(5)
                continue

            try:
                await self._connect_and_serve()
            except Exception as exc:
                print(f"[agent][tunnel] erro: {exc}", file=sys.stderr)
            await asyncio.sleep(3)

    async def _connect_and_serve(self) -> None:
        ws_url = build_ws_url(self.config, "/api/agent/tunnel")
        timestamp = iso_now()
        nonce = f"ws{int(time.time() * 1000)}{os.urandom(12).hex()}"
        headers = {
            "Authorization": f"Agent {self.config['agent_id']}",
            "x-agent-auth-version": "v2",
            "x-agent-auth-timestamp": timestamp,
            "x-agent-auth-nonce": nonce,
            "x-agent-auth-signature": sign_agent_request(
                str(self.config["agent_secret"]),
                "GET",
                "/api/agent/tunnel",
                timestamp,
                nonce,
                "",
            ),
            "User-Agent": AGENT_HTTP_USER_AGENT,
        }
        async with self._connect(ws_url, headers) as websocket:
            print(f"[agent][tunnel] conectado em {ws_url}")
            async for raw_message in websocket:
                try:
                    payload = json.loads(raw_message)
                except json.JSONDecodeError:
                    continue
                await self._handle_message(websocket, payload)

    async def _handle_message(
        self,
        websocket: WebSocketConnection,
        payload: dict[str, Any],
    ) -> None:
        message_type = payload.get("type")
        session_id = payload.get("sessionId", "")

        if message_type == "agent.ready":
            return

        if message_type == "queue.refresh":
            if self.wake_event is not None:
                self.wake_event.set()
            return

        if message_type == "terminal.open":
            await self._open_terminal(
                websocket,
                session_id,
                int(payload.get("cols", 120)),
                int(payload.get("rows", 30)),
                str(payload.get("executionId", "") or ""),
                str(payload.get("command", "") or ""),
                int(payload.get("timeoutSec", 120) or 120),
            )
            return

        if message_type == "terminal.input":
            await self._write_terminal(session_id, str(payload.get("data", "")))
            return

        if message_type == "terminal.resize":
            await self._resize_terminal(
                session_id,
                int(payload.get("cols", 120)),
                int(payload.get("rows", 30)),
            )
            return

        if message_type == "terminal.close":
            await self._close_terminal(websocket, session_id, notify=True)

    async def _send_json(
        self,
        websocket: WebSocketConnection,
        payload: dict[str, Any],
    ) -> None:
        await websocket.send(json.dumps(payload))

    def _set_terminal_size(self, master_fd: int, cols: int, rows: int) -> None:
        winsize = struct.pack("HHHH", rows, cols, 0, 0)
        fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)

    def _detect_tmux_active(self, session_id: str) -> bool:
        session = self.sessions.get(session_id)
        if not session or session.get("closed"):
            return False

        master_fd = session["master_fd"]
        session_pid = int(session.get("pid", 0) or 0)
        try:
            foreground_pgid = os.tcgetpgrp(master_fd)
        except OSError:
            foreground_pgid = 0

        process_candidates: list[int] = []
        if foreground_pgid > 0:
            process_candidates.append(foreground_pgid)

        if session_pid > 0:
            process_candidates.extend(self._find_descendant_processes(session_pid))

        seen_pids: set[int] = set()
        for pid in process_candidates:
            if pid <= 0 or pid in seen_pids:
                continue

            seen_pids.add(pid)
            for candidate in [
                Path(f"/proc/{pid}/comm"),
                Path(f"/proc/{pid}/cmdline"),
            ]:
                try:
                    text = candidate.read_text(encoding="utf-8", errors="replace").replace("\x00", " ")
                except OSError:
                    continue
                if "tmux" in text.lower():
                    return True

        return False

    def _find_descendant_processes(self, parent_pid: int) -> list[int]:
        descendants: list[int] = []
        pending: list[int] = [parent_pid]
        visited: set[int] = set()

        while pending:
            current_parent = pending.pop()
            if current_parent in visited:
                continue

            visited.add(current_parent)
            for proc_dir in Path("/proc").iterdir():
                if not proc_dir.name.isdigit():
                    continue

                pid = int(proc_dir.name)
                status_path = proc_dir / "status"
                try:
                    status_text = status_path.read_text(encoding="utf-8", errors="replace")
                except OSError:
                    continue

                parent_line = next(
                    (line for line in status_text.splitlines() if line.startswith("PPid:")),
                    None,
                )
                if not parent_line:
                    continue

                try:
                    proc_parent = int(parent_line.split(":", 1)[1].strip())
                except ValueError:
                    continue

                if proc_parent != current_parent or pid in visited:
                    continue

                descendants.append(pid)
                pending.append(pid)

        return descendants

    async def _sync_tmux_status(self, session_id: str, force: bool = False) -> None:
        session = self.sessions.get(session_id)
        if not session or session.get("closed"):
            return

        session["tmux_refresh_handle"] = None
        now = time.monotonic()
        if not force and now - float(session.get("tmux_checked_at", 0.0) or 0.0) < 1.0:
            return

        session["tmux_checked_at"] = now
        active = self._detect_tmux_active(session_id)
        if not force and session.get("tmux_active") == active:
            return

        session["tmux_active"] = active
        await self._send_json(
            session["websocket"],
            {"type": "terminal.tmux", "sessionId": session_id, "active": active},
        )

    def _schedule_tmux_status_refresh(
        self,
        session_id: str,
        delay_sec: float = 0.08,
        force: bool = False,
    ) -> None:
        if not self.loop:
            return

        session = self.sessions.get(session_id)
        if not session or session.get("closed"):
            return

        refresh_handle = session.get("tmux_refresh_handle")
        if refresh_handle is not None:
            refresh_handle.cancel()

        session["tmux_refresh_handle"] = self.loop.call_later(
            max(0.0, delay_sec),
            lambda: asyncio.create_task(self._sync_tmux_status(session_id, force=force)),
        )

    async def _flush_terminal_output(self, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if not session:
            return

        session["flush_handle"] = None
        pending_output = session["pending_output"]
        if not pending_output:
            return

        payload = "".join(pending_output)
        pending_output.clear()
        await self._send_json(
            session["websocket"],
            {"type": "terminal.output", "sessionId": session_id, "data": payload},
        )

    def _schedule_terminal_flush(self, session_id: str) -> None:
        if not self.loop:
            return
        session = self.sessions.get(session_id)
        if not session or session.get("flush_handle") is not None:
            return

        session["flush_handle"] = self.loop.call_later(
            self.output_batch_window_sec,
            lambda: asyncio.create_task(self._flush_terminal_output(session_id)),
        )

    def _build_execution_wrapper(
        self,
        command: str,
        timeout_sec: int,
        marker: str,
        shell_path: str,
    ) -> str:
        quoted_shell = shlex.quote(shell_path)
        quoted_command = shlex.quote(command)
        timeout_value = max(5, int(timeout_sec))
        return (
            f"if command -v timeout >/dev/null 2>&1; then timeout {timeout_value}s sh -lc {quoted_command}; "
            "else sh -lc "
            f"{quoted_command}; fi; "
            "__agentlx_code=$?; "
            f"printf '\\r\\n{marker}:%s\\r\\n' \"$__agentlx_code\"; "
            "unset __agentlx_code; "
            f"exec {quoted_shell} -i"
        )

    def _consume_execution_output(self, session_id: str, text: str) -> str:
        session = self.sessions.get(session_id)
        if not session:
            return text

        monitor = session.get("execution_monitor")
        if not monitor or monitor.get("submitted"):
            return text

        marker = monitor["marker"]
        combined = f"{monitor['buffer']}{text}"
        marker_index = combined.find(marker)

        if marker_index < 0:
            tail_size = len(marker) + 32
            if len(combined) <= tail_size:
                monitor["buffer"] = combined
                return ""
            safe_output = combined[:-tail_size]
            monitor["captured_output"] += safe_output
            monitor["buffer"] = combined[-tail_size:]
            return safe_output

        line_end_index = combined.find("\n", marker_index)
        if line_end_index < 0:
            monitor["buffer"] = combined
            return ""

        before_marker = combined[:marker_index]
        marker_line = combined[marker_index : line_end_index + 1]
        after_marker = combined[line_end_index + 1 :]
        exit_code_raw = marker_line[len(marker) + 1 :].strip()

        try:
            exit_code = int(exit_code_raw)
        except ValueError:
            exit_code = 1

        monitor["captured_output"] += before_marker
        monitor["buffer"] = ""
        monitor["submitted"] = True

        if self.loop:
            self.loop.create_task(
                self._submit_bootstrap_result(
                    execution_id=monitor["execution_id"],
                    started_at=monitor["started_at"],
                    started_monotonic=float(monitor["started_monotonic"]),
                    output=monitor["captured_output"],
                    exit_code=exit_code,
                )
            )

        completion_notice = f"\r\n[agentlx] Execucao finalizada com exit code {exit_code}.\r\n"
        return f"{before_marker}{completion_notice}{after_marker}"

    async def _submit_bootstrap_result(
        self,
        execution_id: str,
        started_at: str,
        started_monotonic: float,
        output: str,
        exit_code: int,
    ) -> None:
        finished_at = time.time()
        payload = {
            "executionId": execution_id,
            "status": "success" if exit_code == 0 else "failed",
            "output": output,
            "errorOutput": "",
            "exitCode": exit_code,
            "durationMs": int((finished_at - started_monotonic) * 1000),
            "startedAt": started_at,
            "finishedAt": iso_now(finished_at),
        }
        try:
            api_request(
                self.config,
                "POST",
                "/api/agent/executions/result",
                payload,
                use_agent_auth=True,
            )
        except Exception as exc:
            print(
                f"[agent][tunnel] falha ao enviar resultado da execucao {execution_id}: {exc}",
                file=sys.stderr,
            )

    async def _open_terminal(
        self,
        websocket: WebSocketConnection,
        session_id: str,
        cols: int,
        rows: int,
        execution_id: str = "",
        command: str = "",
        timeout_sec: int = 120,
    ) -> None:
        if not session_id:
            return

        if session_id in self.sessions:
            await self._send_json(
                websocket,
                {"type": "terminal.error", "sessionId": session_id, "message": "Sessao ja aberta."},
            )
            return

        shell = shutil.which("bash") or os.environ.get("SHELL") or "/bin/sh"
        execution_monitor = None
        bootstrap_wrapper = None
        if execution_id and command:
            marker = f"__agentlx_EXEC_DONE__{execution_id.replace('-', '')}__"
            execution_monitor = {
                "execution_id": execution_id,
                "marker": marker,
                "buffer": "",
                "captured_output": "",
                "started_at": iso_now(),
                "started_monotonic": time.time(),
                "submitted": False,
            }
            bootstrap_wrapper = self._build_execution_wrapper(command, timeout_sec, marker, shell)

        pid, master_fd = pty.fork()
        if pid == 0:
            os.environ["TERM"] = "xterm-256color"
            os.environ["COLORTERM"] = "truecolor"
            try:
                os.chdir(resolve_terminal_working_directory(self.config))
            except OSError:
                pass
            if bootstrap_wrapper:
                os.execv(shell, [shell, "-lc", bootstrap_wrapper])
            os.execv(shell, [shell, "-i"])

        os.set_blocking(master_fd, False)
        self._set_terminal_size(master_fd, cols, rows)
        loop = self.loop
        if not loop:
            return

        session = {
            "pid": pid,
            "master_fd": master_fd,
            "websocket": websocket,
            "cols": cols,
            "rows": rows,
            "closed": False,
            "pending_output": [],
            "flush_handle": None,
            "tmux_refresh_handle": None,
            "tmux_active": None,
            "execution_monitor": execution_monitor,
        }
        self.sessions[session_id] = session

        def handle_readable() -> None:
            try:
                data = os.read(master_fd, 4096)
            except OSError as exc:
                if exc.errno == errno.EIO:
                    data = b""
                else:
                    loop.create_task(
                        self._send_json(
                            websocket,
                            {
                                "type": "terminal.error",
                                "sessionId": session_id,
                                "message": str(exc),
                            },
                        )
                    )
                    return

            if not data:
                loop.create_task(self._close_terminal(websocket, session_id, notify=True))
                return

            text = data.decode("utf-8", errors="replace")
            display_text = self._consume_execution_output(session_id, text)
            if display_text:
                session["pending_output"].append(display_text)
            self._schedule_terminal_flush(session_id)
            self._schedule_tmux_status_refresh(session_id)

        loop.add_reader(master_fd, handle_readable)
        await self._send_json(websocket, {"type": "terminal.opened", "sessionId": session_id})
        self._schedule_tmux_status_refresh(session_id, delay_sec=0.0, force=True)

    async def _write_terminal(self, session_id: str, data: str) -> None:
        session = self.sessions.get(session_id)
        if not session or session.get("closed") or not data:
            return
        os.write(session["master_fd"], data.encode("utf-8", errors="ignore"))
        self._schedule_tmux_status_refresh(session_id, delay_sec=0.2)

    async def _resize_terminal(self, session_id: str, cols: int, rows: int) -> None:
        session = self.sessions.get(session_id)
        if not session or session.get("closed"):
            return
        session["cols"] = cols
        session["rows"] = rows
        self._set_terminal_size(session["master_fd"], cols, rows)

    async def _close_terminal(
        self,
        websocket: WebSocketConnection,
        session_id: str,
        notify: bool,
    ) -> None:
        session = self.sessions.get(session_id)
        if not session:
            return

        if session.get("closed"):
            self.sessions.pop(session_id, None)
            return

        session["closed"] = True
        monitor = session.get("execution_monitor")
        flush_handle = session.get("flush_handle")
        if flush_handle is not None:
            flush_handle.cancel()
            session["flush_handle"] = None
        tmux_refresh_handle = session.get("tmux_refresh_handle")
        if tmux_refresh_handle is not None:
            tmux_refresh_handle.cancel()
            session["tmux_refresh_handle"] = None

        if self.loop:
            try:
                self.loop.remove_reader(session["master_fd"])
            except Exception:
                pass

        await self._flush_terminal_output(session_id)

        exit_code: int | None = None
        try:
            os.close(session["master_fd"])
        except OSError:
            pass

        pid = session["pid"]
        try:
            waited_pid, status = os.waitpid(pid, os.WNOHANG)
            if waited_pid == 0:
                os.kill(pid, 15)
                await asyncio.sleep(0.1)
                waited_pid, status = os.waitpid(pid, os.WNOHANG)
            if waited_pid == 0:
                os.kill(pid, 9)
                waited_pid, status = os.waitpid(pid, 0)
            if os.WIFEXITED(status):
                exit_code = os.WEXITSTATUS(status)
            elif os.WIFSIGNALED(status):
                exit_code = 128 + os.WTERMSIG(status)
        except ChildProcessError:
            exit_code = 0
        except OSError:
            exit_code = None

        if monitor and not monitor.get("submitted"):
            monitor["submitted"] = True
            output = f"{monitor.get('captured_output', '')}{monitor.get('buffer', '')}"
            await self._submit_bootstrap_result(
                execution_id=monitor["execution_id"],
                started_at=monitor["started_at"],
                started_monotonic=float(monitor["started_monotonic"]),
                output=output,
                exit_code=exit_code if exit_code is not None else 1,
            )

        self.sessions.pop(session_id, None)
        if notify:
            await self._send_json(
                websocket,
                {"type": "terminal.closed", "sessionId": session_id, "exitCode": exit_code},
            )

