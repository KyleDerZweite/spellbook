"""Measure only this experiment's model startup and warm inference, locally."""

import json
import time
from urllib.request import Request, urlopen

from common import ARTIFACTS, MODEL, configure, write_json


def request(text, *, keep_alive="5m"):
    started = time.perf_counter()
    data = json.dumps(
        {"model": MODEL, "input": [text], "keep_alive": keep_alive, "truncate": False}
    ).encode()
    with urlopen(
        Request(
            "http://127.0.0.1:11434/api/embed",
            data,
            {"Content-Type": "application/json"},
        ),
        timeout=180,
    ) as response:
        result = json.load(response)
    return {
        "wall_ms": (time.perf_counter() - started) * 1000,
        "load_ms": result.get("load_duration", 0) / 1_000_000,
        "provider_total_ms": result.get("total_duration", 0) / 1_000_000,
        "tokens": result.get("prompt_eval_count"),
    }


if __name__ == "__main__":
    configure()
    request("Release only the experiment embedding model.", keep_alive=0)
    cold = request("A land that produces two colorless mana.")
    warm = [request("A land that produces two colorless mana.") for _ in range(5)]
    result = {"model": MODEL, "cold": cold, "warm": warm}
    write_json(ARTIFACTS / "model-probe.json", result)
    print(json.dumps(result))
