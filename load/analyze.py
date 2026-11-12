"""Розрахунок затримок і повноти історії за журналом публікацій."""

import csv
import os
from pathlib import Path
import statistics
from collections import defaultdict
from math import ceil

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from influxdb_client import InfluxDBClient

ROOT = Path(__file__).resolve().parents[1]
RESULTS = Path(os.getenv("LAB2_RESULTS_DIR", ROOT / "results"))
THING = os.getenv("DITTO_THING", "org.pzks:cm-001")
INFLUX = {
    "url": os.getenv("INFLUX_URL", "http://localhost:8086"),
    "token": os.getenv("INFLUX_TOKEN", "dt-lab-token"),
    "org": os.getenv("INFLUX_ORG", "pzks"),
}
BUCKET = os.getenv("INFLUX_BUCKET", "twin")
TARGET_MS = 250


def quantile(values, q):
    if not values:
        return None
    values = sorted(values)
    return values[max(0, min(len(values) - 1, ceil(q * len(values)) - 1))]


def main():
    out_csv = RESULTS / "load.csv"
    out_png = RESULTS / "latency_vs_load.png"
    if out_csv.exists() or out_png.exists():
        raise FileExistsError("Виберіть каталог без наявних load.csv і latency_vs_load.png")

    with (RESULTS / "sent.csv").open(newline="", encoding="utf-8") as fh:
        sent = {
            (int(row["seq"]), int(row["ts"])): row
            for row in csv.DictReader(fh)
        }
    if not sent:
        raise RuntimeError("results/sent.csv порожній; виконайте Locust після запуску історика")

    stamps = [ts for _, ts in sent]
    start_ns, stop_ns = min(stamps) * 1_000_000, (max(stamps) + 1) * 1_000_000
    query = f'''from(bucket: "{BUCKET}")
      |> range(start: time(v: {start_ns}), stop: time(v: {stop_ns}))
      |> filter(fn: (r) => r._measurement == "twin_state" and r.thing == "{THING}")
      |> filter(fn: (r) => r._field == "seq" or r._field == "sync_ms" or r._field == "revision")
      |> pivot(rowKey: ["_time"], columnKey: ["_field"], valueColumn: "_value")
      |> map(fn: (r) => ({{r with source_ts: int(v: r._time) / 1000000}}))'''
    with InfluxDBClient(**INFLUX) as client:
        tables = client.query_api().query(query)
    received = {}
    revisions = []
    for table in tables:
        for rec in table.records:
            row = rec.values
            if row.get("seq") is None or row.get("sync_ms") is None:
                continue
            key = (int(row["seq"]), int(row["source_ts"]))
            if key not in sent:
                continue
            received[key] = float(row["sync_ms"])
            if "revision" in row and isinstance(row["revision"], int):
                revisions.append(int(row["revision"]))
    unique_revisions = sorted(set(revisions))
    gaps = (
        unique_revisions[-1] - unique_revisions[0] + 1 - len(unique_revisions)
        if len(unique_revisions) > 1 else 0
    )

    steps = defaultdict(list)
    for key, row in sent.items():
        steps[int(row["rate"])].append(key)

    rows = []
    for target_rate, keys in sorted(steps.items()):
        observed = [received[key] for key in keys if key in received]
        span_sec = int(sent[keys[0]].get("step_seconds") or 0)
        if not span_sec:
            timestamps = [ts for _, ts in keys]
            span_sec = max((max(timestamps) - min(timestamps)) / 1000, 1)
        ack = [sent[key].get("puback") for key in keys]
        rows.append({
            "rate": target_rate,
            "actual_rate": round(len(keys) / span_sec, 2),
            "sent": len(keys),
            "received": len(observed),
            "loss_pct": round(100 * (1 - len(observed) / len(keys)), 2),
            "without_puback": ack.count("0") if all(value in ("0", "1") for value in ack) else "",
            "p50_ms": round(statistics.median(observed), 2) if observed else "",
            "p95_ms": round(quantile(observed, 0.95), 2) if observed else "",
        })

    with out_csv.open("x", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    print("Очікувана/фактична частота, sent, received, втрати, p50/p95:")
    for row in rows:
        print(row)
    print(f"Непокриті ревізії у вибірці: {gaps if len(unique_revisions) > 1 else 'недостатньо даних'}")
    print("Зважайте: пропуски SSE не доводять втрату повідомлень у Ditto.")

    plotted = [r for r in rows if r["p95_ms"] != ""]
    if plotted:
        fig, ax = plt.subplots(figsize=(8, 4.8))
        x = [r["rate"] for r in plotted]
        ax.plot(x, [r["p50_ms"] for r in plotted], "o-", label="p50")
        ax.plot(x, [r["p95_ms"] for r in plotted], "s-", label="p95")
        ax.axhline(TARGET_MS, linestyle="--", label=f"NFR-01: {TARGET_MS} мс")
        ax.set_xscale("log")
        delays = [r["p50_ms"] for r in plotted] + [r["p95_ms"] for r in plotted]
        if all(v > 0 for v in delays):
            ax.set_yscale("log")
        ax.set_xlabel("Цільова частота телеметрії, повідомлень/с")
        ax.set_ylabel("Затримка від джерела до SSE, мс")
        ax.set_title("Кавомашина cm-001: затримка за навантаженням")
        ax.grid(True, which="both", alpha=0.25)
        ax.legend()
        fig.tight_layout()
        fig.savefig(out_png, dpi=160)
        plt.close(fig)
        print("Графік:", out_png)
    else:
        print("Немає отриманих повідомлень; графік не побудовано")
    print("CSV:", out_csv)


if __name__ == "__main__":
    main()
