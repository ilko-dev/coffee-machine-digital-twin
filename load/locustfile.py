"""Ступінчастий тест MQTT: 5–400 повідомлень/с, один процес Locust."""

import atexit
import csv
import itertools
import json
import os
from pathlib import Path
import time

import paho.mqtt.client as mqtt
from locust import LoadTestShape, User, constant_throughput, events, task
from locust.runners import LocalRunner

ROOT = Path(__file__).resolve().parents[1]
RESULTS = Path(os.getenv("LAB2_RESULTS_DIR", ROOT / "results"))
TOPIC = os.getenv("MQTT_TOPIC", "coffee-machine/cm-001/telemetry")
BROKER = os.getenv("MQTT_HOST", "127.0.0.1")
RATE = 5
STEPS = [1, 2, 5, 10, 20, 40, 80]
STEP_TIME = int(os.getenv("STEP_TIME", "60"))
if STEP_TIME < 5:
    raise ValueError("STEP_TIME має бути >= 5 с")

SEQUENCE = itertools.count(1_000_000)


@events.init.add_listener
def prepare_log(environment, **kwargs):
    path = RESULTS / "sent.csv"
    if not isinstance(environment.runner, LocalRunner) or path.exists():
        raise SystemExit("Потрібен один локальний процес Locust і новий файл sent.csv")
    RESULTS.mkdir(parents=True, exist_ok=True)
    log_file = path.open("x", encoding="utf-8", newline="")
    atexit.register(log_file.close)
    environment.telemetry_log = csv.writer(log_file)
    environment.telemetry_log.writerow(["seq", "ts", "rate", "step_seconds", "puback"])


class Gateway(User):
    """Один Locust-user — один MQTT-шлюз із власним клієнтом."""

    wait_time = constant_throughput(RATE)

    def on_start(self):
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
        self.client.connect(BROKER, 1883, keepalive=60)
        self.client.loop_start()

    def on_stop(self):
        self.client.disconnect()
        self.client.loop_stop()

    @task
    def publish(self):
        step = int(self.environment.shape_class.get_run_time() // STEP_TIME)
        if step >= len(STEPS):
            return
        target_rate = STEPS[step] * RATE
        seq = next(SEQUENCE)
        ts = int(time.time() * 1000)
        message = {
            "seq": seq, "ts": ts,
            "temp": 90.0, "hp": 350.0,
            "p": 9.0, "flow": 2.5, "level": 80.0, "vib": 1.15,
            "brew": True, "tank": True,
        }
        started = time.perf_counter()
        error = None
        try:
            info = self.client.publish(TOPIC, json.dumps(message), qos=1)
            info.wait_for_publish(timeout=5)
            if not info.is_published():
                raise TimeoutError("Не отримано MQTT PUBACK за 5 секунд")
        except Exception as exc:
            error = exc
        finally:
            self.environment.telemetry_log.writerow(
                [seq, ts, target_rate, STEP_TIME, int(error is None)]
            )
            # Locust вимірює час до MQTT PUBACK.
            self.environment.events.request.fire(
                request_type="MQTT", name="publish QoS 1",
                response_time=(time.perf_counter() - started) * 1000,
                response_length=0, exception=error,
            )


class Steps(LoadTestShape):
    """Покрокове нарощування шлюзів; завершення після останньої сходинки."""

    def tick(self):
        index = int(self.get_run_time() // STEP_TIME)
        if index >= len(STEPS):
            return None
        return STEPS[index], 100  # користувачів, швидкість запуску/с
