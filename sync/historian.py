"""Запис станів Ditto з SSE у InfluxDB."""

from collections import deque
import json
import os
import time

import requests
from influxdb_client import InfluxDBClient, Point, WriteOptions

THING = os.getenv("DITTO_THING", "org.pzks:cm-001")
SSE_URL = os.getenv("DITTO_SSE_URL", "http://localhost:8090/api/2/things")
INFLUX = {
    "url": os.getenv("INFLUX_URL", "http://localhost:8086"),
    "token": os.getenv("INFLUX_TOKEN", "dt-lab-token"),
    "org": os.getenv("INFLUX_ORG", "pzks"),
}
BUCKET = os.getenv("INFLUX_BUCKET", "twin")

FIELDS = {
    "thermal": ("temperature", "heaterPower"),
    "hydraulics": ("pressure", "flowRate", "waterLevel", "pumpVibrationRms"),
    "operation": ("brewingActive", "waterTankPresent"),
}


def sse_events():
    """Потік (JSON, час отримання, мс); перепідключається після обриву."""
    params = {"ids": THING, "fields": "thingId,features,_revision"}
    headers = {"Accept": "text/event-stream", "Cache-Control": "no-cache"}
    while True:
        try:
            with requests.get(
                SSE_URL, params=params, headers=headers, stream=True, timeout=(5, None)
            ) as response:
                response.raise_for_status()
                response.encoding = "utf-8"
                print(f"Підключено до SSE: {THING}. Ctrl+C — зупинка", flush=True)
                # SSE-події відокремлені порожнім рядком; data може бути в кількох рядках.
                data_lines = []
                for line in response.iter_lines(chunk_size=128, decode_unicode=True):
                    if not line:
                        if data_lines:
                            # Порожні SSE-пакети підтримують з’єднання.
                            payload = "\n".join(data_lines).strip()
                            data_lines.clear()
                            if not payload:
                                continue
                            received_ms = time.time_ns() / 1_000_000
                            try:
                                obj = json.loads(payload)
                            except json.JSONDecodeError as exc:
                                print(
                                    f"SSE: неприпустимий JSON ({exc.msg}); "
                                    f"початок повідомлення: {payload[:160]!r}",
                                    flush=True,
                                )
                                continue
                            if isinstance(obj, dict):
                                yield obj, received_ms
                    elif line.startswith("data:"):
                        data_lines.append(line[5:].lstrip(" "))
                print("SSE розірвано, повторне підключення...", flush=True)
        except requests.RequestException as exc:
            print(f"SSE недоступний: {exc}; повтор через 2 с", flush=True)
        time.sleep(2)


def to_point(thing: dict, received_ms: float):
    """Створити точку InfluxDB для повного знімка, або None."""
    features = thing.get("features") or {}
    sync = features.get("sync", {}).get("properties", {})
    seq, ts = sync.get("seq"), sync.get("ts")
    if not isinstance(seq, int) or not isinstance(ts, int) or ts <= 0:
        return None

    for block, keys in FIELDS.items():
        values = features.get(block, {}).get("properties", {})
        if any(key not in values for key in keys):
            return None

    # Різні повідомлення в одній мілісекунді: унікальність точки за seq.
    time_ns = ts * 1_000_000 + (seq % 1_000_000)
    point = Point("twin_state").tag("thing", thing.get("thingId", THING))
    point = point.time(time_ns, write_precision="ns")
    for block, keys in FIELDS.items():
        values = features[block]["properties"]
        for key in keys:
            value = values[key]
            if isinstance(value, bool):
                point.field(key, value)
            elif isinstance(value, (int, float)):
                point.field(key, float(value))
            else:
                return None
    point.field("seq", seq).field("sync_ms", float(received_ms - ts))
    revision = thing.get("_revision")
    if isinstance(revision, int):
        point.field("revision", revision)
    return point


def main():
    count = 0
    seen = set()
    order = deque()
    options = WriteOptions(batch_size=200, flush_interval=1000)
    print("Історик розпочато; запустіть емулятор в іншому терміналі.", flush=True)
    try:
        with InfluxDBClient(**INFLUX) as client:
            with client.write_api(write_options=options) as writer:
                try:
                    for thing, received_ms in sse_events():
                        sync = (thing.get("features") or {}).get("sync", {}).get("properties", {})
                        key = (sync.get("seq"), sync.get("ts"))
                        if key in seen:
                            continue  # Можлива повторна подія при SSE reconnect.
                        point = to_point(thing, received_ms)
                        if point is None:
                            continue
                        seen.add(key)
                        order.append(key)
                        if len(order) > 4096:
                            seen.discard(order.popleft())
                        writer.write(bucket=BUCKET, record=point)
                        count += 1
                        if count % 50 == 0:
                            print(f"Записано знімків: {count}; останній seq={key[0]}", flush=True)
                except KeyboardInterrupt:
                    pass
    except KeyboardInterrupt:
        pass
    print(f"Історик зупинено. Записано станів: {count}", flush=True)


if __name__ == "__main__":
    main()
