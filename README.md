# JalDrishti (H₂O) — Autonomous Water Remediation & IoT Telemetry Node

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Hardware: ESP32](https://img.shields.io/badge/Hardware-ESP32-red.svg)](https://www.espressif.com/)
[![Backend: Flask](https://img.shields.io/badge/Backend-Python%2FFlask-green.svg)](https://flask.palletsprojects.com/)
[![Standards: IS 10500](https://img.shields.io/badge/Compliance-IS%2010500-orange.svg)]()

> A low-cost (<₹6.5k), decentralized cyber-physical water treatment system designed for Acid Mine Drainage (AMD) run-off in mining basins. Combines multi-parameter optical/electrochemical sensing, server-driven closed-loop chemical dosing, physical catalytic filtration, and a bilingual PWA dashboard.

---

## 📌 Problem Context
Acid Mine Drainage (AMD) in coal and metal mining clusters is characterized by high acidity (pH < 4.0), dissolved heavy metals ($\text{Fe}^{2+}/\text{Fe}^{3+} > 7\text{ mg/L}$), elevated sulfates, and toxic suspended solids. Conventional testing protocols rely on manual grab-sampling with a 4–6 day lab turnaround—by which time toxic runoff has already permeated local drinking aquifers.

**JalDrishti** closes this loop by sensing contaminants in real time, computing chemical neutralizer mass stoichiometrically, and dynamically driving dosing pumps and germicidal reactors directly at the edge.

---

## ⚡ System Architecture
[ Raw Effluent Inflow ]
│
▼
[ YF-S201 Flow ] ───► [ Multi-Sensor Array ] (pH, TDS, Turbidity, Fe Colorimeter, Temp)
│                         │
│                   (3s Telemetry)
│                         ▼
│               [ ESP32 Edge Node ]
│                         │
│                   (HTTP POST / JSON)
│                         ▼
│              [ Flask Cloud Analytics ]
│                         │
│               (Downlink Actuation Packet)
│                         ▼
├──◄── [ Peristaltic Dosing Pump ] (PWM: Ca(OH)₂ Lime Slurry)
│
▼
[ Static Mixer Chamber ] (Flocculation: Fe³⁺ + 3OH⁻ ──► Fe(OH)₃↓)
│
▼
[ Manganese Greensand Bed ] (Catalytic Oxidation of Fe/Mn)
│
▼
[ Granular Activated Carbon ] (Organic & Odor Adsorption)
│
▼
[ Inline UV-C Disinfection ] (Germicidal Chamber @ 254 nm)
│
▼
[ Potable Clean Water Outflow ] (IS 10500 Compliant)

## 🛠️ Hardware Specification & Pin Mapping

| Peripheral / Sensor | Controller Interface | Function / Role |
| :--- | :--- | :--- |
| **pH Electrode (E-201-C)** | GPIO 34 (ADC1) | Measures hydronium activity $[H^+]$ with active temperature compensation |
| **Turbidity (TS-300B)** | GPIO 35 (ADC1) | Infrared scattering for colloidal suspension measurement |
| **TDS Meter** | GPIO 32 (ADC1) | Dissolved mineral conductivity; surrogate sulfate modeling |
| **Colorimeter (TCS34725)** | GPIO 21 (SDA) / 22 (SCL) | Photometric absorbance ratio ($R/C$) for dissolved iron ($\text{Fe}$) |
| **Temperature (DS18B20)** | GPIO 4 (1-Wire) | Nernst slope compensation for glass pH probes |
| **Flow Meter (YF-S201)** | GPIO 27 (Hardware Interrupt) | Real-time volumetric throughput ($L/\min$) for mass dosing |
| **Lime Dosing Pump** | GPIO 18 (PWM, 5 kHz) | Modulates 12V peristaltic speed via IRF520 MOSFET |
| **UV-C Reactor Relay** | GPIO 19 (Active-LOW) | Controls germicidal ultraviolet inactivation stage |
| **Jet Purge Solenoid** | GPIO 23 (Active-LOW) | High-pressure wash pulse to eliminate sensor crusting |

---

## 🧠 Computational & Dosing Algorithms

### 1. Stoichiometric Neutralization
The cloud engine computes the required hydrated lime mass concentration ($\text{g/m}^3$) based on hydronium deficit and soluble iron precipitation:
$$\text{Lime}_{\text{pH}} = (10^{-\text{pH}} - 10^{-7.0}) \times 0.5 \times 74.09 \times 1000$$
$$\text{Lime}_{\text{Fe}} = \max(0, \text{Fe} - 0.30) \times 1.987$$
$$\text{Total Lime Dosing (g/m}^3) = \text{Lime}_{\text{pH}} + \text{Lime}_{\text{Fe}}$$

### 2. Heavy Metal Surrogates
* **Estimated Sulfate ($\text{SO}_4^{2-}$):** Derived from TDS ion density modulated by acidity:
  $$\text{SO}_4^{2-} \approx (\text{TDS} \times 0.42) + \max(0, (6.5 - \text{pH}) \times 28.5)$$
* **Estimated Manganese ($\text{Mn}$):** Modeled from dissolved iron loading under acid-leaching conditions:
  $$\text{Mn} \approx \text{Fe} \times 0.18$$

---

## 💻 Software Stack

* **Firmware:** C++ on ESP32 Core (Arduino framework) utilizing hardware ISRs, non-blocking timers, and `ArduinoJson`.
* **Backend:** Python 3.11 / Flask, computing real-time sub-indices for Water Quality Index (WQI) and Heavy Metal Pollution Index (HPI).
* **Frontend:** PWA (HTML5, Vanilla JS, Bootstrap 5, Chart.js, Leaflet.js).
* **Accessibility:** Full English/Hindi localization dictionary and on-device Web Speech API voice synthesis for rural panchayat advisories.
* **Audit & Compliance:** Client-side vector PDF generation (`jspdf`, `jspdf-autotable`) verifying against CPCB / IS 10500:2012 parameters.

---

## 🚀 Getting Started

### 1. Hardware Firmware Flash
1. Open `firmware/esp32_water_node.ino` in Arduino IDE.
2. Install required libraries: `ArduinoJson`, `OneWire`, `DallasTemperature`, `Adafruit TCS34725`.
3. Set your local Wi-Fi SSID, Password, and Server Endpoint.
4. Select target board **ESP32 Dev Module** and flash via USB.

### 2. Local Backend Server
```bash
# Clone the repository
git clone [https://github.com/your-username/sih-smart-water-system.git](https://github.com/your-username/sih-smart-water-system.git)
cd sih-smart-water-system

# Install dependencies
pip install -r server/requirements.txt

# Run server
python server/app.py
