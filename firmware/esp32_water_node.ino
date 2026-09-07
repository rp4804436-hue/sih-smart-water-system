#include <WiFi.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_TCS34725.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ArduinoJson.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// Initialize Optical Colorimeter (Integration 50ms, Gain 4X)
Adafruit_TCS34725 tcs = Adafruit_TCS34725(TCS34725_INTEGRATIONTIME_50MS, TCS34725_GAIN_4X);

// Pin Mappings
#define PH_PIN 34
#define TURBIDITY_PIN 35
#define TDS_PIN 32
#define ONE_WIRE_BUS 4
#define FLOW_PIN 14

// Actuator Pins (Relay Module)
#define RELAY_RO_PUMP 18
#define RELAY_DOSING 19
#define RELAY_UVC 23
#define BUZZER_PIN 25
#define LED_SAFE 26
#define LED_UNSAFE 27

OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature tempSensor(&oneWire);

// Network Credentials & Local Server URL
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";
const char* serverUrl = "http://10.199.152.130:5000/api/telemetry"; // Update with host machine IP

// Optical Baseline for Clean Water (Calibrated Blue Channel Value)
const float BLUE_BLANK = 2800.0;

volatile int flowPulses = 0;
void IRAM_ATTR countPulses() {
  flowPulses++;
}

void setup() {
  Serial.begin(115200);

  pinMode(PH_PIN, INPUT);
  pinMode(TURBIDITY_PIN, INPUT);
  pinMode(TDS_PIN, INPUT);
  pinMode(FLOW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), countPulses, FALLING);

  pinMode(RELAY_RO_PUMP, OUTPUT);
  pinMode(RELAY_DOSING, OUTPUT);
  pinMode(RELAY_UVC, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_SAFE, OUTPUT);
  pinMode(LED_UNSAFE, OUTPUT);

  // Default active-low relays to OFF (HIGH)
  digitalWrite(RELAY_RO_PUMP, HIGH);
  digitalWrite(RELAY_DOSING, HIGH);
  digitalWrite(RELAY_UVC, HIGH);

  // Initialize I2C Devices
  display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);

  if (tcs.begin()) {
    Serial.println("[TCS34725] Colorimeter Initialized Successfully");
  } else {
    Serial.println("[TCS34725] Check wiring at SDA 21 / SCL 22");
  }

  tempSensor.begin();

  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(400);
    Serial.print(".");
  }
  Serial.println("\n[Wi-Fi] Connected to Local Network");
}

void loop() {
  // 1. Water Temperature Acquisition for Offset Calculations
  tempSensor.requestTemperatures();
  float temperature = tempSensor.getTempCByIndex(0);
  if (temperature <= 0.0 || temperature > 75.0) temperature = 25.0;

  // 2. Oversampled Analog Readout (20 samples)
  long rawPh = 0, rawTurb = 0, rawTds = 0;
  for (int i = 0; i < 20; i++) {
    rawPh += analogRead(PH_PIN);
    rawTurb += analogRead(TURBIDITY_PIN);
    rawTds += analogRead(TDS_PIN);
    delay(10);
  }
  float avgPh = rawPh / 20.0;
  float avgTurb = rawTurb / 20.0;
  float avgTds = rawTds / 20.0;

  // 3. Mathematical Conversions
  float phVoltage = avgPh * (3.3 / 4095.0);
  float ph = 3.5 * phVoltage; // Calibrate multiplier with pH 4.0 / 7.0 solutions

  float turbVoltage = avgTurb * (3.3 / 4095.0);
  float turbidity = -1120.4 * (turbVoltage * turbVoltage) + 5742.3 * turbVoltage - 4352.9;
  if (turbidity < 0.0) turbidity = 0.0;

  float tdsVoltage = avgTds * (3.3 / 4095.0);
  float tempFactor = 1.0 + 0.02 * (temperature - 25.0);
  float compVoltage = tdsVoltage / tempFactor;
  float tds = (133.42 * pow(compVoltage, 3) - 255.86 * pow(compVoltage, 2) + 857.39 * compVoltage) * 0.5;
  if (tds < 0.0) tds = 0.0;

  // 4. Optical Iron (Fe3+) Colorimetric Calculation
  uint16_t r, g, b, c;
  tcs.getRawData(&r, &g, &b, &c);

  float ironConcentration = 0.02; // Default clear baseline
  if (b > 50 && b <= BLUE_BLANK) {
    float absorbanceBlue = log10(BLUE_BLANK / (float)b);
    ironConcentration = absorbanceBlue * 4.2; // Calibrated curve slope for ferric complexes
  }

  // 5. Potability Evaluation (IS 10500 Limits: Fe <= 0.3, pH 6.5-8.5, Turb <= 5, TDS <= 500)[cite: 1]
  bool isSafe = (ph >= 6.5 && ph <= 8.5) && (turbidity <= 5.0) && (tds <= 500.0) && (ironConcentration <= 0.3);
  String mode = (ironConcentration > 0.3 || tds > 500.0 || turbidity > 20.0) ? "Heavy Purification" : "Low Purification";

  // 6. Closed-Loop Hardware Interlocks
  // Stage 3: Acid Mine Drainage Neutralization[cite: 1]
  if (ph < 6.5) {
    digitalWrite(RELAY_DOSING, LOW);  // Turn ON alkaline dosing pump
  } else {
    digitalWrite(RELAY_DOSING, HIGH); // Turn OFF pump
  }

  // Stage 4: RO Booster Pump Control (Engage if Iron or TDS exceed thresholds)[cite: 1]
  if (ironConcentration > 0.3 || tds > 300.0 || mode == "Heavy Purification") {
    digitalWrite(RELAY_RO_PUMP, LOW);  // Turn ON RO Pump
  } else {
    digitalWrite(RELAY_RO_PUMP, HIGH); // Bypass RO
  }

  // Stage 5: UV-C Chamber Protection (Disable if suspended silt prevents optical penetration)
  if (turbidity <= 10.0) {
    digitalWrite(RELAY_UVC, LOW);      // Turn ON UV-C Chamber
  } else {
    digitalWrite(RELAY_UVC, HIGH);     // Inhibit UV-C
  }

  // 7. Local Alert Outputs
  if (isSafe) {
    digitalWrite(LED_SAFE, HIGH);
    digitalWrite(LED_UNSAFE, LOW);
    digitalWrite(BUZZER_PIN, LOW);
  } else {
    digitalWrite(LED_SAFE, LOW);
    digitalWrite(LED_UNSAFE, HIGH);
    digitalWrite(BUZZER_PIN, HIGH);
    delay(80);
    digitalWrite(BUZZER_PIN, LOW);
  }

  // 8. Field OLED Update
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.printf("Fe: %.2f mg/L\n", ironConcentration);
  display.printf("pH: %.2f | TDS: %.0f\n", ph, tds);
  display.printf("Turb: %.1f NTU\n", turbidity);
  display.printf("State: %s\n", isSafe ? "DRINKABLE" : "UNDRINKABLE");
  display.printf("Mode: %s\n", mode.c_str());
  display.display();

  // 9. Telemetry Streaming to Flask Server
  if (WiFi.status() == WL_CONNECTED) {
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");

    StaticJsonDocument<300> doc;
    doc["iron"] = round(ironConcentration * 100.0) / 100.0;
    doc["ph"] = round(ph * 100.0) / 100.0;
    doc["turbidity"] = round(turbidity * 10.0) / 10.0;
    doc["tds"] = round(tds);
    doc["temperature"] = round(temperature * 10.0) / 10.0;
    doc["status"] = isSafe ? "Safe" : "Unsafe";
    doc["mode"] = mode;

    String payload;
    serializeJson(doc, payload);
    http.POST(payload);
    http.end();
  }

  delay(3000);
}