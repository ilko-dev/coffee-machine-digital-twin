"""Емулятор сенсорів кавомашини з публікацією MQTT QoS 1."""

import argparse
import csv
import json
import math
import os
import random
import time
from pathlib import Path

import paho.mqtt.client as mqtt

BROKER = "127.0.0.1"
PORT = 1883
RESULTS = Path(os.getenv("LAB2_RESULTS_DIR", Path(__file__).resolve().parents[1] / "results"))
FIELDNAMES = ["seq", "ts", "temp", "hp", "p", "flow", "level", "vib", "brew", "tank"]


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def sample(elapsed: float, level: float, randomizer: random.Random) -> dict:
    """Знімок стану з 10 підвідліків швидких сенсорів.

    Перша 20-секундна фаза: прогрів; далі 15 с приготування,
    потім 15 с очікування, цикл повторюється.
    """
    phase = elapsed % 50.0
    brewing = 20 <= phase < 35
    heating = phase < 20
    target_temp = 25 + 67 * min(1.0, phase / 20) if heating else 92 if brewing else 88

    pressure_samples = []
    flow_samples = []
    vibration_samples = []
    for _ in range(10):
        pressure_samples.append(clamp(randomizer.gauss(9.0 if brewing else 0.05, 0.16 if brewing else 0.02), 0, 12))
        flow_samples.append(clamp(randomizer.gauss(2.5 if brewing else 0, 0.08 if brewing else 0.01), 0, 5))
        vibration_samples.append(clamp(randomizer.gauss(1.15 if brewing else 0.04, 0.08 if brewing else 0.01), 0, 3))

    return {
        "temp": round(clamp(target_temp + randomizer.gauss(0, 0.15), 20, 100), 2),
        "hp": round(clamp((1350 if heating else 400 if brewing else 0) + randomizer.gauss(0, 8), 0, 1500), 1) if heating or brewing else 0.0,
        "p": round(sum(pressure_samples) / len(pressure_samples), 3),
        "flow": round(sum(flow_samples) / len(flow_samples), 3),
        "level": round(clamp(level, 0, 100), 2),
        "vib": round(math.sqrt(sum(v * v for v in vibration_samples) / len(vibration_samples)), 3),
        "brew": brewing,
        "tank": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="MQTT-емулятор кавомашини для Eclipse Ditto")
    parser.add_argument("--name", default="cm-001", help="ID примірника без namespace")
    parser.add_argument("--rate", type=float, default=1.0, help="знімків стану за секунду")
    parser.add_argument("--count", type=int, default=0, help="кількість знімків (0 = без обмеження)")
    parser.add_argument("--seed", type=int, default=42, help="seed генератора шуму")
    args = parser.parse_args()
    if args.rate <= 0 or args.count < 0:
        parser.error("--rate має бути > 0; --count має бути >= 0")
    if "/" in args.name or ":" in args.name:
        parser.error("--name не повинен містити / або :")

    topic = f"coffee-machine/{args.name}/telemetry"
    RESULTS.mkdir(parents=True, exist_ok=True)
    randomizer = random.Random(args.seed)
    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.connect(BROKER, PORT, keepalive=60)
    client.loop_start()

    sent = 0
    water_level = 100.0
    last_level_sample = -10.0
    start = time.monotonic()
    next_tick = start
    period = 1.0 / args.rate
    try:
        with (RESULTS / "source.csv").open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=FIELDNAMES)
            writer.writeheader()
            print(f"MQTT {topic}, {args.rate:g} повідомл./с; Ctrl+C для зупинки", flush=True)
            while args.count == 0 or sent < args.count:
                elapsed = time.monotonic() - start
                if elapsed - last_level_sample >= 10:
                    # Між вимірюваннями раз на 10 с передаємо останній рівень води.
                    last_level_sample = elapsed
                    water_level = clamp(water_level - (0.8 if 20 <= elapsed % 50 < 35 else 0), 0, 100)
                payload = {"seq": sent + 1, "ts": int(time.time() * 1000), **sample(elapsed, water_level, randomizer)}
                info = client.publish(topic, json.dumps(payload, ensure_ascii=False), qos=1)
                info.wait_for_publish(timeout=5)
                if not info.is_published():
                    raise RuntimeError(f"Немає MQTT PUBACK для seq={payload['seq']}")
                writer.writerow(payload)
                fh.flush()
                sent += 1
                next_tick += period
                time.sleep(max(0.0, next_tick - time.monotonic()))
    except KeyboardInterrupt:
        pass
    finally:
        client.disconnect()
        client.loop_stop()
        print(f"Опубліковано й записано у {RESULTS / 'source.csv'}: {sent}", flush=True)


if __name__ == "__main__":
    main()
