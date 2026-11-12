"""Створення або оновлення MQTT-з’єднання Ditto."""

import json
import os
from pathlib import Path

import requests

HERE = Path(__file__).resolve().parent
API = os.getenv("DITTO_API", "http://localhost:8080/api/2")
CONNECTION_ID = "mqtt-telemetry"
AUTH = (os.getenv("DITTO_DEVOPS_USER", "devops"), os.getenv("DITTO_DEVOPS_PASSWORD", "foobar"))


def main() -> None:
    definition = json.loads((HERE / "connection.json").read_text(encoding="utf-8"))
    definition["mappingDefinitions"]["telemetry"]["options"]["incomingScript"] = (
        HERE / "mapping.js"
    ).read_text(encoding="utf-8")
    url = f"{API}/connections/{CONNECTION_ID}"
    response = requests.put(url, auth=AUTH, json=definition, timeout=30)
    print(f"PUT connection: HTTP {response.status_code}")
    if not response.ok:
        print(response.text[:1500])
        response.raise_for_status()
    status_response = requests.get(url + "/status", auth=AUTH, timeout=30)
    print(f"GET status: HTTP {status_response.status_code}")
    status_response.raise_for_status()
    status = status_response.json()
    print("Стан з'єднання:", status.get("connectionStatus", "unknown"))
    print("Відповідь:", json.dumps(status, ensure_ascii=False)[:750])


if __name__ == "__main__":
    main()
