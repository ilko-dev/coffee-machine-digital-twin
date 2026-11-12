"""Перевірка відповідності джерела, історії та поточного стану Ditto."""

import csv
import os
from pathlib import Path
import statistics

import requests
from influxdb_client import InfluxDBClient

ROOT = Path(__file__).resolve().parents[1]
RESULTS = Path(os.getenv("LAB2_RESULTS_DIR", ROOT / "results"))
SOURCE_CSV = RESULTS / "source.csv"
REPORT = RESULTS / "consistency.md"
THING = os.getenv("DITTO_THING", "org.pzks:cm-001")
API = os.getenv("DITTO_READ_API", f"http://localhost:8090/api/2/things/{THING}")
INFLUX = {
    "url": os.getenv("INFLUX_URL", "http://localhost:8086"),
    "token": os.getenv("INFLUX_TOKEN", "dt-lab-token"),
    "org": os.getenv("INFLUX_ORG", "pzks"),
}
BUCKET = os.getenv("INFLUX_BUCKET", "twin")
TARGET_MS = 250  # NFR-01; для строгої перевірки потрібна вибірка 30 хв за ЛР1.

# CSV-поле джерела -> ім'я властивості InfluxDB і блок/поле Ditto.
NUMERIC = {
    "temp": ("temperature", "thermal"),
    "hp": ("heaterPower", "thermal"),
    "p": ("pressure", "hydraulics"),
    "flow": ("flowRate", "hydraulics"),
    "level": ("waterLevel", "hydraulics"),
    "vib": ("pumpVibrationRms", "hydraulics"),
}
BOOLEAN = {
    "brew": ("brewingActive", "operation"),
    "tank": ("waterTankPresent", "operation"),
}


def quantile(values, fraction):
    if not values:
        return None
    values = sorted(values)
    return values[max(0, min(len(values) - 1, (int((len(values) * fraction + 0.999999)) - 1)))]


def parse_bool(value):
    if isinstance(value, bool):
        return value
    if str(value).strip().lower() in ("true", "1"):
        return True
    if str(value).strip().lower() in ("false", "0"):
        return False
    raise ValueError(f"Некоректне булеве значення: {value!r}")


def load_source():
    with SOURCE_CSV.open(newline="", encoding="utf-8") as fh:
        rows = list(csv.DictReader(fh))
    if not rows:
        raise RuntimeError(f"Файл {SOURCE_CSV} не має записів")
    return {int(row["seq"]): row for row in rows}


def load_history(min_ms, max_ms):
    start_ns = min_ms * 1_000_000
    stop_ns = (max_ms + 1) * 1_000_000
    query = f'''from(bucket: "{BUCKET}")
      |> range(start: time(v: {start_ns}), stop: time(v: {stop_ns}))
      |> filter(fn: (r) => r._measurement == "twin_state" and r.thing == "{THING}")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> map(fn: (r) => ({{r with source_ts: int(v: r._time) / 1000000}}))'''
    with InfluxDBClient(**INFLUX) as client:
        tables = client.query_api().query(query)
    result = {}
    for table in tables:
        for record in table.records:
            values = record.values
            if values.get("seq") is not None:
                result[int(values["seq"]), int(values["source_ts"])] = values
    return result


def matches(src: dict, values: dict) -> bool:
    for key, (name, _) in NUMERIC.items():
        if values.get(name) is None or abs(float(src[key]) - float(values[name])) > 1e-5:
            return False
    for key, (name, _) in BOOLEAN.items():
        if values.get(name) is None or parse_bool(src[key]) != parse_bool(values[name]):
            return False
    return True


def main():
    src = load_source()
    timestamps = [int(row["ts"]) for row in src.values()]
    # Потрібно дати асинхронному запису історика завершити batch (~1 с).
    history = load_history(min(timestamps), max(timestamps))
    hist = {
        seq: history[seq, int(row["ts"])]
        for seq, row in src.items()
        if (seq, int(row["ts"])) in history
    }
    shared = set(src) & set(hist)
    missing = sorted(set(src) - set(hist))
    wrong = sorted(seq for seq in shared if not matches(src[seq], hist[seq]))
    ordered = sorted(
        (row for row in hist.values() if isinstance(row.get("revision"), int)),
        key=lambda row: int(row["revision"]),
    )
    reordered = sum(
        int(b["seq"] < a["seq"])
        for a, b in zip(ordered, ordered[1:])
        if int(a["seq"]) in shared and int(b["seq"]) in shared
    )
    revs = sorted({int(row["revision"]) for row in ordered})
    gaps = revs[-1] - revs[0] + 1 - len(revs) if len(revs) >= 2 else 0

    response = requests.get(API, timeout=10)
    response.raise_for_status()
    twin = response.json()
    features = twin["features"]
    last = src[max(src)]
    final_values = {
        name: features.get(block, {}).get("properties", {}).get(name)
        for _, (name, block) in {**NUMERIC, **BOOLEAN}.items()
    }
    final_ok = matches(last, final_values)
    sync = features.get("sync", {}).get("properties", {})
    final_ok = final_ok and sync.get("seq") == int(last["seq"]) and sync.get("ts") == int(last["ts"])

    delays = [float(hist[s]["sync_ms"]) for s in shared if "sync_ms" in hist[s]]
    p50 = statistics.median(delays) if delays else None
    p95 = quantile(delays, 0.95)
    verdict = "виконано (короткий прогін)" if p95 is not None and p95 <= TARGET_MS else "не підтверджено"
    report = "\n".join([
        "# Перевірка узгодженості стану (ЛР2)",
        "",
        "| Перевірка | Результат |",
        "|---|---|",
        f"| Надіслано джерелом (QoS 1, PUBACK) | {len(src)} |",
        f"| Є в історії (ідентифікатори з цього сеансу) | {len(shared)} ({len(shared) / len(src):.1%}) |",
        f"| Відсутні seq | {len(missing)}; приклади: {missing[:12]} |",
        f"| Розбіжності серед отриманих значень | {len(wrong)}; приклади: {wrong[:12]} |",
        f"| Зменшення seq у порядку ревізій | {reordered if revs else 'немає revision'} |",
        f"| Проміжні ревізії, не зафіксовані істориком | {gaps if revs else 'немає revision'} |",
        f"| Кінцевий Ditto-стан = останній відлік | {'так' if final_ok else 'НІ'} |",
        f"| Затримка sync_ms, p50 / p95 | {f'{p50:.1f} / {p95:.1f} мс' if p95 is not None else 'немає даних'} |",
        f"| Ціль NFR-01: p95 ≤ {TARGET_MS} мс | {verdict} |",
        "",
        "> Увага: запис в InfluxDB через SSE асинхронний; пропущена ревізія може",
        "> означати втрату події на шляху спостереження, а не втрату MQTT або Ditto.",
        "> Порівняння p95 за коротким прогоном не замінює 30-хв перевірку NFR-01.",
    ]) + "\n"
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(report, encoding="utf-8")
    print(report)
    print(f"Збережено: {REPORT}")


if __name__ == "__main__":
    main()
