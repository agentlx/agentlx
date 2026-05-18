from __future__ import annotations

import time


def iso_now(timestamp: float | None = None) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(timestamp or time.time()))


def clamp(value: float, lower: float, upper: float) -> float:
    return max(lower, min(upper, value))
