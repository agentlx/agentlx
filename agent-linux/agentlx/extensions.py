from __future__ import annotations

import importlib
import sys
from typing import Any, Protocol


class AgentExtension(Protocol):
    def start(self) -> None:
        ...

    def stop(self) -> None:
        ...


class ExtensionManager:
    def __init__(self, extensions: list[AgentExtension]) -> None:
        self.extensions = extensions

    def start(self) -> None:
        for extension in self.extensions:
            try:
                extension.start()
            except Exception as exc:
                print(f"[agent][extension] erro ao iniciar extensao: {exc}", file=sys.stderr)

    def stop(self) -> None:
        for extension in reversed(self.extensions):
            try:
                extension.stop()
            except Exception as exc:
                print(f"[agent][extension] erro ao parar extensao: {exc}", file=sys.stderr)


def load_enterprise_extensions(config: dict[str, Any]) -> ExtensionManager:
    try:
        module = importlib.import_module("agentlx_enterprise")
    except ImportError:
        return ExtensionManager([])

    factory = getattr(module, "create_agent_extensions", None)
    if not callable(factory):
        return ExtensionManager([])

    try:
        extensions = factory(config)
    except Exception as exc:
        print(f"[agent][extension] erro ao carregar extensoes enterprise: {exc}", file=sys.stderr)
        return ExtensionManager([])

    if not isinstance(extensions, list):
        return ExtensionManager([])

    return ExtensionManager(extensions)

