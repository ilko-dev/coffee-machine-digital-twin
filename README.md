# Digital Twin Platform for Automatic Coffee Machine

Лабораторна робота №1  
**«Архітектурний опис та моделе-орієнтована модель платформи цифрового двійника»**

## Об'єкт

Об'єктом цифрового двійника є автоматична кавомашина.

Платформа забезпечує:

- отримання телеметрії від фізичного об'єкта або емулятора;
- синхронізацію стану цифрового двійника;
- зберігання історичних даних;
- виявлення аномальних режимів;
- відображення поточного стану;
- передачу команд керування до фізичного об'єкта.

Платформа класифікується:

- за призначенням: спостереження та діагностування;
- за зв'язністю: цифровий двійник;
- за сферою застосування: виробництво й обладнання.

## Архітектура

Архітектура побудована з урахуванням ISO 23247.

Основний маршрут телеметрії:

Coffee Machine  
→ MQTT Publisher  
→ Eclipse Mosquitto  
→ Telemetry Consumer  
→ Data Quality Validation  
→ Twin State Manager  
→ WebSocket API  
→ Web UI

Також передбачено зворотний канал передачі команд
від платформи до фізичного об'єкта.

Архітектурні подання розміщено в:

`docs/diagrams/`

## Сигнали

Модель містить 8 сигналів:

- Temperature;
- Pressure;
- FlowRate;
- WaterLevel;
- HeaterPower;
- PumpVibrationRms;
- BrewingActive;
- WaterTankPresent.

Розрахований обсяг необроблених значень телеметрії:

**≈ 22.3 МБ/добу.**

## Основні нефункційні цілі

- p95 затримки синхронізації стану: ≤ 250 мс;
- p95 наскрізної затримки «датчик — подання»: ≤ 500 мс;
- продуктивність: ≥ 100 повідомлень/с;
- втрата повідомлень MQTT QoS 1: ≤ 0.1 %;
- повторне підключення після відновлення Broker: ≤ 5 с.

## Архітектурна гіпотеза

**Г-01.** Використання WebSocket push замість REST polling
зменшить медіанну наскрізну затримку «датчик — подання»
щонайменше на 30 %.

Архітектурна модель:

- REST polling: 340 мс;
- WebSocket push: 210 мс;
- очікуване зменшення: 38.2 %.

Розрахунок наведено в:

`docs/latency.md`

Виконувана модель:

`docs/latency.py`

## Модель системи

Модель побудована мовою **SysML v2**
у середовищі **SysML v2 Pilot Implementation / JupyterLab**.

Основний файл моделі:

`model/model.ipynb`

Модель містить:

- функційні та нефункційні вимоги;
- структурні елементи платформи;
- порти та зв'язки;
- сценарій оброблення телеметрії;
- зв'язки satisfy;
- verification definitions.

Для перегляду інтерактивної моделі необхідно відкрити
`model/model.ipynb` у JupyterLab з ядром SysML.

Експортована версія, яка не потребує SysML-середовища:

`model/export/model.html`

## Трасовність

Матриця трасовності розміщена в:

`docs/traceability.md`

Покриття:

- Ct = 100 %;
- Cv = 100 %.

## Структура репозиторію

```text
coffee-machine-digital-twin/
├── README.md
├── model/
│   ├── model.ipynb
│   └── export/
│       └── model.html
└── docs/
    ├── requirements.md
    ├── sources.md
    ├── iso23247-mapping.md
    ├── latency.md
    ├── latency.py
    ├── traceability.md
    ├── adr/
    │   ├── 0001-mqtt-transport.md
    │   ├── 0002-telemetry-storage.md
    │   └── 0003-computation-placement.md
    └── diagrams/
        ├── context.mmd
        ├── context.svg
        ├── components.mmd
        ├── components.svg
        ├── deployment.mmd
        ├── deployment.svg
        ├── dataflow.mmd
        └── dataflow.svg