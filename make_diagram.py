import matplotlib.pyplot as plt
import matplotlib.patches as patches

def draw_card(ax, xy, w, h, title, subtitle, items, bg_color, border_color, title_color="#38bdf8"):
    card = patches.FancyBboxPatch(
        xy, w, h,
        boxstyle="round,pad=0.015,rounding_size=0.025",
        linewidth=1.8,
        edgecolor=border_color,
        facecolor=bg_color,
        zorder=2
    )
    ax.add_patch(card)
    ax.text(xy[0] + 0.018, xy[1] + h - 0.032, title, fontsize=11, fontweight='bold', color=title_color, zorder=3)
    if subtitle:
        ax.text(xy[0] + 0.018, xy[1] + h - 0.058, subtitle, fontsize=8.5, style='italic', color='#94a3b8', zorder=3)
    start_y = xy[1] + h - (0.095 if subtitle else 0.065)
    for i, item in enumerate(items):
        ax.text(xy[0] + 0.018, start_y - (i * 0.028), item, fontsize=8, color='#f1f5f9', zorder=3)

fig, ax = plt.subplots(figsize=(16, 9), dpi=300)
fig.patch.set_facecolor('#0b0f19')
ax.set_facecolor('#0b0f19')
ax.set_xlim(0, 1.6)
ax.set_ylim(0, 0.9)
ax.axis('off')

# Title Header
plt.text(0.08, 0.84, "SMART WATER PURIFICATION & QUALITY MONITORING SYSTEM", 
         fontsize=17, fontweight='heavy', color='#ffffff')
plt.text(0.08, 0.81, "SIH Problem Statement ID: 26040 | Complete Hardware, Optical Sensing & Edge IoT Pipeline", 
         fontsize=10.5, color='#38bdf8')

# Stage 1: Pre-Sedimentation & Aeration
draw_card(
    ax, (0.08, 0.44), 0.32, 0.30,
    "STAGE 1: PRE-FILTRATION", "Mechanical & Aeration Train",
    ["• Raw Acid Mine Drainage (Low pH, Turbid)",
     "• Venturi Air Eductor: Aerates Fe2+ -> Fe3+",
     "• 100μm Stainless Mesh: Coal Grit Trap",
     "• Settling Basin: High Gravity Solids Out"],
    "#0f172a", "#0284c7", "#38bdf8"
)

# Stage 2: Catalytic Media Bed
draw_card(
    ax, (0.08, 0.10), 0.32, 0.28,
    "STAGE 2: CATALYTIC MEDIA", "Heavy Metal & Organics Stripping",
    ["• 10\" Jumbo Pressure Column",
     "• Manganese Greensand (Strips Fe/Mn)",
     "• Granular Activated Carbon (Adsorbs VOCs)",
     "• Graded Silica Sand (Particulate Floc)"],
    "#0f172a", "#0284c7", "#38bdf8"
)

# Central Compute Hub & Sensing Node
draw_card(
    ax, (0.45, 0.22), 0.36, 0.52,
    "🧠 COMPUTE CORE & SENSING NODE", "ESP32 Dual-Core (240 MHz)",
    ["[PHYSICAL ELECTROCHEMICAL ARRAY]",
     "• TCS34725 Colorimeter: Fe3+ Absorbance",
     "• Glass pH Electrode: Acidity Guard (Pin 34)",
     "• TS-300B Turbidity: Silt Density (Pin 35)",
     "• Analog TDS Sensor: Salinity/Sulfates (Pin 32)",
     "• DS18B20 Temp Probe: Dynamic Offset (Pin 04)",
     "• YF-S201 Flow Turbine: Hall Interrupt (Pin 14)",
     "",
     "[EMBEDDED EDGE ALGORITHMS]",
     "• Beer-Lambert Fe3+ Optical Quantifier",
     "• 20x Analog Oversampling Engine",
     "• Real-Time IS 10500 Potability Logic",
     "• Closed-Loop Actuator Safety Interlocks"],
    "#172554", "#3b82f6", "#60a5fa"
)

# Field HMI & Alerts
draw_card(
    ax, (0.45, 0.04), 0.36, 0.14,
    "🚨 FIELD HMI & LOCAL ALERTS", "Operator Interface",
    ["• 0.96\" I2C OLED: Metric & State Readout",
     "• Status LEDs: Green (Safe) | Red (Unsafe)",
     "• Active Buzzer: Emergency Audio Alert"],
    "#064e3b", "#10b981", "#34d399"
)

# Closed-Loop Actuation & Purification
draw_card(
    ax, (0.86, 0.44), 0.34, 0.30,
    "⚙️ CLOSED-LOOP ACTUATION", "Physical Remediation & Desalination",
    ["• 4-Channel Optocoupled Relays (Active-LOW)",
     "• Relay 1: 300 GPD Booster Pump (RO Desal)",
     "• Relay 2: 12V Alkaline Dosing Pump (pH Fix)",
     "• Relay 3: Inline 12V UV-C Reactor (254nm)",
     "• Auto-Interlock: Inhibits UV-C if Turb > 10"],
    "#431407", "#ea580c", "#fb923c"
)

# IoT Platform & Telemetry
draw_card(
    ax, (0.86, 0.10), 0.34, 0.28,
    "🌐 IoT PLATFORM & MOBILE APP", "Cloud Governance & PWA",
    ["• 2.4 GHz Wi-Fi HTTP POST (/api/telemetry)",
     "• Flask REST Telemetry Engine (Port 5000)",
     "• JalDrishti(H2O) Installable PWA App",
     "• Dual-Axis Target vs Actual Visuals",
     "• Tabular Audit Log with One-Click CSV Export"],
    "#3b0764", "#a855f7", "#c084fc"
)

# Potable Output Standards
draw_card(
    ax, (1.24, 0.32), 0.28, 0.22,
    "✅ POTABLE OUTPUT", "IS 10500 Compliant Drinking Water",
    ["• Iron (Fe): <= 0.3 mg/L",
     "• pH Level: 6.5 - 8.5",
     "• Turbidity: <= 5.0 NTU",
     "• TDS: <= 500 PPM",
     "• Microbially Disinfected"],
    "#064e3b", "#10b981", "#34d399"
)

# Flow Arrows
def arrow(p1, p2, c="#38bdf8", w=2.0):
    ax.annotate("", xy=p2, xytext=p1,
        arrowprops=dict(arrowstyle="-|>", color=c, lw=w, shrinkA=4, shrinkB=4), zorder=4)

arrow((0.24, 0.44), (0.24, 0.38), "#0284c7")
arrow((0.40, 0.24), (0.45, 0.35), "#0284c7")
arrow((0.81, 0.58), (0.86, 0.58), "#fb923c", 2.2)
arrow((0.81, 0.30), (0.86, 0.24), "#c084fc", 2.2)
arrow((0.63, 0.22), (0.63, 0.18), "#34d399")
arrow((1.20, 0.55), (1.24, 0.44), "#10b981", 2.2)

plt.tight_layout()
output = "sih_system_architecture_4k.png"
plt.savefig(output, dpi=300, facecolor=fig.get_facecolor(), edgecolor='none')
plt.close()
print(f"Success! Generated: {output}")