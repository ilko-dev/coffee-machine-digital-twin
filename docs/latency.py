"""Модель затримки платформи цифрового двійника кавомашини."""

BASE = {
    "Sensor -> Publisher": 10,
    "Publisher -> Broker": 20,
    "Broker -> Consumer": 40,
    "Consumer -> Validation": 10,
    "Validation -> Twin State": 10,
    "Twin State -> REST API": 50,
    "REST polling -> Web UI": 200,
}

WEBSOCKET = {
    "Sensor -> Publisher": 10,
    "Publisher -> Broker": 20,
    "Broker -> Consumer": 40,
    "Consumer -> Validation": 10,
    "Validation -> Twin State": 10,
    "Twin State -> WebSocket API": 50,
    "WebSocket -> Web UI": 70,
}

SYNC_SEGMENTS = [
    "Sensor -> Publisher",
    "Publisher -> Broker",
    "Broker -> Consumer",
    "Consumer -> Validation",
    "Validation -> Twin State",
]

TARGET_SYNC = 250
TARGET_E2E = 500
TARGET_IMPROVEMENT = 0.30


def status(value, target):
    return "ВИКОНАНО" if value <= target else "НЕ ВИКОНАНО"


def calculate_sync(route):
    return sum(route[name] for name in SYNC_SEGMENTS)


def report(title, route):
    total = sum(route.values())
    sync = calculate_sync(route)

    print()
    print(title)
    print("-" * 60)

    for name, latency in route.items():
        share = latency / total * 100

        print(
            f"{name:<35}"
            f"{latency:>5} ms "
            f"{share:>6.1f}%"
        )

    print("-" * 60)

    print(
        f"{'Synchronization (NFR-01)':<35}"
        f"{sync:>5} ms "
        f"target <= {TARGET_SYNC}: "
        f"{status(sync, TARGET_SYNC)}"
    )

    print(
        f"{'End-to-end (NFR-02)':<35}"
        f"{total:>5} ms "
        f"target <= {TARGET_E2E}: "
        f"{status(total, TARGET_E2E)}"
    )

    return total


base_total = report(
    "BASE: REST polling",
    BASE
)

websocket_total = report(
    "HYPOTHESIS G-01: WebSocket push",
    WEBSOCKET
)

improvement = 1 - websocket_total / base_total

print()
print("=" * 60)
print(
    f"Latency reduction: "
    f"{improvement * 100:.1f}%"
)

if improvement >= TARGET_IMPROVEMENT:
    print(
        "G-01: SUPPORTED by the architectural model"
    )
else:
    print(
        "G-01: NOT SUPPORTED by the architectural model"
    )