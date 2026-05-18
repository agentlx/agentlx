from __future__ import annotations

import platform
import socket
import time
from typing import Any

from .config import get_config_int
from .system import (
    compute_cpu_percent,
    detect_services,
    get_ip_address,
    read_cpu_times,
    read_disk_percent,
    read_distribution,
    read_memory,
    read_uptime_seconds,
)
from .utils import iso_now


class SnapshotCollector:
    def __init__(self, config: dict[str, Any]) -> None:
        self.config = config
        self.hostname = socket.gethostname()
        self.kernel = platform.release()
        self.arch = platform.machine()
        self.location = config.get("location", "")
        self.inventory_refresh_interval_sec = get_config_int(
            config,
            "inventory_refresh_interval_sec",
            int(config.get("service_refresh_interval_sec", 300) or 300),
            60,
        )
        self._distribution = read_distribution()
        self._cpu_times: tuple[int, int] | None = None
        self._inventory_cache: dict[str, Any] | None = None
        self._inventory_refreshed_at = 0.0

    def _refresh_inventory(self) -> dict[str, Any]:
        inventory = {
            "distribution": read_distribution(),
            "services": detect_services(),
            "kernel": platform.release(),
            "arch": platform.machine(),
        }
        self._distribution = inventory["distribution"]
        self.kernel = inventory["kernel"]
        self.arch = inventory["arch"]
        self._inventory_cache = inventory
        self._inventory_refreshed_at = time.time()
        return inventory

    def _get_inventory(self, force_refresh: bool = False) -> tuple[dict[str, Any], bool]:
        now = time.time()
        if (
            force_refresh
            or self._inventory_cache is None
            or now - self._inventory_refreshed_at >= self.inventory_refresh_interval_sec
        ):
            return self._refresh_inventory(), True
        return self._inventory_cache, False

    def _read_cpu_percent(self) -> float:
        current = read_cpu_times()
        if current is None:
            return 0.0

        previous = self._cpu_times
        self._cpu_times = current
        if previous is None:
            time.sleep(0.1)
            second = read_cpu_times()
            if second is None:
                return 0.0
            self._cpu_times = second
            return compute_cpu_percent(current, second)

        return compute_cpu_percent(previous, current)

    def collect_snapshot(self, force_inventory_refresh: bool = False) -> tuple[dict[str, Any], bool]:
        inventory, inventory_refreshed = self._get_inventory(force_refresh=force_inventory_refresh)
        ram_used_gb, ram_total_gb = read_memory()
        distribution = inventory["distribution"]
        snapshot = {
            "hostname": self.hostname,
            "ip": get_ip_address(),
            "os": distribution["prettyName"],
            "distribution": distribution,
            "kernel": inventory["kernel"],
            "arch": inventory["arch"],
            "location": self.location,
            "uptimeSec": read_uptime_seconds(),
            "cpuPercent": self._read_cpu_percent(),
            "ramUsedGb": ram_used_gb,
            "ramTotalGb": ram_total_gb if ram_total_gb > 0 else 1.0,
            "diskPercent": read_disk_percent(),
            "services": inventory["services"],
            "collectedAt": iso_now(),
        }
        return snapshot, inventory_refreshed
