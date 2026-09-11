#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Wire.h>
#include "Adafruit_TCS34725.h"

// ==========================================
// NETWORK CONFIGURATION
// ==========================================
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";
const char* SERVER_URL    = "https://sih-smart-water-system.onrender.com/api/telemetry";
const char* NODE_ID       = "dhanbad_01"; // Target Station ID

// ==========================================
// PIN ALLOCATIONS
// ==========================================
#define PIN_PH          34
#define PIN_TURBIDITY   35
#define PIN_TDS         32
#define PIN_ONEWIRE     4
#define PIN_FLOW_SENSOR 27
#define PIN_PWM_DOSING  18
#define PIN_RELAY_UVC   19
#define PIN_RELAY_PURGE 23

// ==========================================
// PWM CONFIGURATION (ESP32 Core 3.x Native)
// ==========================================
#define PWM_FREQ        5000
#define PWM_RESOLUTION  8

// ==========================================
// GLOBAL OBJECTS & TIMERS
// ==========================================
OneWire oneWire(PIN_ONEWIRE);
DallasTemperature tempSensors(&oneWire);
Adafruit_TCS34725 tcs = Adafruit_TCS34725(TCS34725_INTEGRATIONTIME_50MS, TCS34725_GAIN_16X);

volatile unsigned long pulseCount = 0;
float flowRateLPM = 0.0;
unsigned long prevTelemetryTime = 0;

// Non-blocking auto-purge state tracker
bool isPurging = false;
unsigned long purgeStartTime = 0;
const unsigned long PURGE_DURATION_MS = 2500;

void IRAM_ATTR flowPulseCounter() {
  pulseCount++;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println(F("\n[INIT] JalDrishti(H2O) Hardware Node Booting..."));

  // 1. Actuator Configuration (Active-LOW Relays)
  pinMode(PIN_RELAY_UVC, OUTPUT);
  pinMode(PIN_RELAY_PURGE, OUTPUT);
  digitalWrite(PIN_RELAY_UVC, HIGH);   // Relays OFF
  digitalWrite(PIN_RELAY_PURGE, HIGH);

  // 2. Hardware PWM Setup for Reagent Dosing Pump
  ledcAttach(PIN_PWM_DOSING, PWM_FREQ, PWM_RESOLUTION);
  ledcWrite(PIN_PWM_DOSING, 0);

  // 3. Hardware Interrupt for Flow Measurement
  pinMode(PIN_FLOW_SENSOR, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(PIN_FLOW_SENSOR), flowPulseCounter, RISING);

  // 4. ADC Attenuation (Full 0 - 3.3V Dynamic Range)
  analogSetAttenuation(ADC_11db);

  // 5. Initialize Sensor Probes
  tempSensors.begin();
  if (tcs.begin()) {
    Serial.println(F("[OK] TCS34725 Colorimeter online on I2C (GPIO 21/22)"));
  } else {
    Serial.println(F("[WARN] TCS34725 Colorimeter not found. Fallback mode enabled."));
  }

  // 6. Connect to Wi-Fi Uplink
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print(F("[INFO] Connecting to Wi-Fi"));
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\n[OK] Connected. Local IP: %s\n", WiFi.localIP().toString().c_str());
}

void loop() {
  unsigned long currentMillis = millis();

  // Non-blocking maintenance purge timer
  if (isPurging && (currentMillis - purgeStartTime >= PURGE_DURATION_MS)) {
    digitalWrite(PIN_RELAY_PURGE, HIGH); // Shut off purge valve
    isPurging = false;
    Serial.println(F("  └─> [PURGE COMPLETE] Sensor wash cycle ended."));
  }

  // 3-Second Closed-Loop Telemetry & Control Cycle
  if (currentMillis - prevTelemetryTime >= 3000) {
    float intervalSec = (currentMillis - prevTelemetryTime) / 1000.0;

    // A. Calculate Dynamic Flow Rate: (Pulses / (7.5 * seconds)) = L/min
    detachInterrupt(digitalPinToInterrupt(PIN_FLOW_SENSOR));
    flowRateLPM = ((float)pulseCount / (7.5 * intervalSec));
    pulseCount = 0;
    attachInterrupt(digitalPinToInterrupt(PIN_FLOW_SENSOR), flowPulseCounter, RISING);
    prevTelemetryTime = currentMillis;

    // B. Read Analog Voltage Signals (0 - 3.3V)
    float rawPhVolt = (analogRead(PIN_PH) / 4095.0) * 3.3;
    float currentPh = 7.0 - ((rawPhVolt - 1.65) * 3.5);

    float rawTurbVolt = (analogRead(PIN_TURBIDITY) / 4095.0) * 3.3;
    float currentTurb = max(0.0, (2.5 - rawTurbVolt) * 20.0);

    float rawTdsVolt = (analogRead(PIN_TDS) / 4095.0) * 3.3;
    float currentTds = (rawTdsVolt / 2.3) * 500.0;

    // C. Read DS18B20 Water Temperature
    tempSensors.requestTemperatures();
    float currentTemp = tempSensors.getTempCByIndex(0);
    if (currentTemp < -10.0 || currentTemp > 80.0) currentTemp = 25.0; // Clamp noise

    // D. Measure Photometric Dissolved Iron
    float currentIron = 0.08;
    uint16_t r, g, b, c;
    tcs.getRawData(&r, &g, &b, &c);
    if (c > 0) {
      float redRatio = (float)r / (float)c;
      currentIron = max(0.02, (redRatio - 0.28) * 4.5);
    }

    // E. Uplink Packet to Server and Execute Downlink Directives
    transmitAndExecute(currentPh, currentIron, currentTurb, currentTds, currentTemp, flowRateLPM);
  }
}

// ==========================================
// BIDIRECTIONAL TELEMETRY & ACTUATION ENGINE
// ==========================================
void transmitAndExecute(float ph, float fe, float turb, float tds, float temp, float flow) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println(F("[ERROR] Wi-Fi link interrupted. Skipping transaction."));
    return;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  // Construct Outgoing Telemetry Payload
  StaticJsonDocument<256> docOut;
  docOut["node_id"]     = NODE_ID;
  docOut["ph"]          = ph;
  docOut["iron"]        = fe;
  docOut["turbidity"]   = turb;
  docOut["tds"]         = tds;
  docOut["temperature"] = temp;
  docOut["flow_rate"]   = flow;

  String requestBody;
  serializeJson(docOut, requestBody);

  int httpResponseCode = http.POST(requestBody);

  if (httpResponseCode == 200 || httpResponseCode == 201) {
    String responseString = http.getString();

    // Parse Cloud Intelligence Directives
    StaticJsonDocument<512> docIn;
    DeserializationError err = deserializeJson(docIn, responseString);

    if (!err) {
      float limeDosingReq = docIn["lime_dosing_g_m3"] | 0.0;
      int   pumpPwm       = docIn["pump_pwm"] | 0;
      int   uvState       = docIn["uv_state"] | 0;
      const char* mode    = docIn["mode"] | "Low Purification";
      const char* diag    = docIn["diagnostics"]["overall"] | "HEALTHY";

      Serial.printf("[DOWNLINK] Mode: %s | Lime: %.1f g/m3 | PWM: %d | UV: %d | Diag: %s\n",
                    mode, limeDosingReq, pumpPwm, uvState, diag);

      // Actuator 1: Stoichiometric Dosing Pump (Hardware PWM Modulation)
      if (limeDosingReq > 0.0 && pumpPwm > 0) {
        ledcWrite(PIN_PWM_DOSING, constrain(pumpPwm, 0, 255));
        Serial.printf("  └─> [ACTUATED] Dosing Pump Active at PWM: %d\n", pumpPwm);
      } else {
        ledcWrite(PIN_PWM_DOSING, 0);
      }

      // Actuator 2: Inline UV-C Disinfection Stage
      if (uvState == 1) {
        digitalWrite(PIN_RELAY_UVC, LOW);  // Turn Relay ON (Active LOW)
        Serial.println(F("  └─> [ACTUATED] UV-C Relay Disinfection Engaged"));
      } else {
        digitalWrite(PIN_RELAY_UVC, HIGH); // Standby
      }

      // Actuator 3: Anti-Fouling Self-Cleaning Jet Purge (Non-Blocking)
      if (strcmp(diag, "MAINTENANCE REQUIRED") == 0 && !isPurging) {
        Serial.println(F("  └─> [DIAGNOSTIC TRIGGER] Optical/Glass scaling detected! Firing purge jet..."));
        digitalWrite(PIN_RELAY_PURGE, LOW); // Open jet valve
        isPurging = true;
        purgeStartTime = millis();
      }
    }
  } else {
    Serial.printf("[ERROR] Telemetry POST rejected. HTTP Code: %d\n", httpResponseCode);
  }

  http.end();
}