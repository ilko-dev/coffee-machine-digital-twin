# Матриця трасовності

| Вимога | Елемент архітектури | Перевірка |
|---|---|---|
| FR-01 | DataCollection | Передати всі 8 типів сигналів і перевірити їх отримання |
| FR-02 | TwinStateManager | Передати новий відлік і перевірити оновлення стану |
| FR-03 | TelemetryRepository | Записати телеметрію та прочитати історію за часовий інтервал |
| FR-04 | AnomalyAnalyzer | Змоделювати Clog, HeaterFailure і PumpFailure |
| FR-05 | DeviceControl | Надіслати Start, Stop та зміну температурної уставки |
| FR-06 | UserInterface | Змінити стан двійника та перевірити його відображення |
| FR-07 | TwinManagement | Відключити Publisher та перевірити стан offline |
| NFR-01 | TwinStateManager | Виміряти p95 synchronization latency, ціль ≤ 250 мс |
| NFR-02 | ResourceAccess, UserInterface | Виміряти p95 sensor-to-presentation latency, ціль ≤ 500 мс |
| NFR-03 | DigitalTwinPlatform | Порівняти 8 і 80 сигналів, зростання p95 ≤ 30 % |
| NFR-04 | DataCollection | MQTT QoS 1: втрати за sequence number ≤ 0.1 % |
| NFR-05 | DataCollection | Відновити Broker і перевірити reconnect ≤ 5 с |
| NFR-06 | DigitalTwinPlatform | Навантаження 100 повідомлень/с без порушення NFR-01 |

## Покриття трасовності

Загальна кількість вимог:

N = 13

Кількість вимог, пов'язаних щонайменше з одним архітектурним елементом:

Ntraced = 13

Ct = Ntraced / N × 100 %

Ct = 13 / 13 × 100 % = 100 %

## Покриття верифікації

Кількість вимог, для яких визначено перевірку:

Nverified = 13

Cv = Nverified / N × 100 %

Cv = 13 / 13 × 100 % = 100 %

Отже:

Ct = 100 %

Cv = 100 %

Усі вимоги мають архітектурний елемент, що їх задовольняє,
та визначений спосіб перевірки.