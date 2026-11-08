// Домен DCE: повідомлення сенсора -> підмоделі Ditto.
// Тема: coffee-machine/<name>/telemetry (напр. coffee-machine/cm-001/telemetry).
function mapToDittoProtocolMsg(headers, textPayload, bytePayload, contentType) {
  var data = JSON.parse(textPayload);
  var parts = String(headers["mqtt.topic"]).split("/");
  if (parts.length !== 3 || parts[0] !== "coffee-machine" || parts[2] !== "telemetry") {
    throw new Error("Невідома MQTT-тема: " + headers["mqtt.topic"]);
  }

  var features = {
    thermal: {
      properties: {
        temperature: data.temp,
        heaterPower: data.hp
      }
    },
    hydraulics: {
      properties: {
        pressure: data.p,
        flowRate: data.flow,
        waterLevel: data.level,
        pumpVibrationRms: data.vib
      }
    },
    operation: {
      properties: {
        brewingActive: data.brew,
        waterTankPresent: data.tank
      }
    },
    sync: {
      properties: {
        seq: data.seq,
        ts: data.ts
      }
    }
  };

  return Ditto.buildDittoProtocolMsg(
    "org.pzks", parts[1], "things", "twin", "commands", "merge", "/features",
    { "content-type": "application/merge-patch+json" }, features
  );
}
