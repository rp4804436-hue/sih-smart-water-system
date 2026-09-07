import matplotlib.pyplot as plt
import matplotlib.patches as patches

def draw_container(ax, xy, w, h, title, subtitle, items, bg_color, border_color, title_color="#38bdf8"):
    box = patches.FancyBboxPatch(
        xy, w, h,
        boxstyle="round,pad=0.015,rounding_size=0.02",
        linewidth=1.8,
        edgecolor=border_color,
        facecolor=bg_color,
        zorder=2
    )
    ax.add_patch(box)
    ax.text(xy[0] + 0.015, xy[1] + h - 0.032, title, fontsize=10.5, fontweight='bold', color=title_color, zorder=3)
    if subtitle:
        ax.text(xy[0] + 0.015, xy[1] + h - 0.058, subtitle, fontsize=8, style='italic', color='#94a3b8', zorder=3)
    start_y = xy[1] + h - (0.092 if subtitle else 0.065)
    for i, item in enumerate(items):
        ax.text(xy[0] + 0.015, start_y - (i * 0.026), item, fontsize=7.8, color='#f1f5f9', zorder=3)

fig, ax = plt.subplots(figsize=(16, 9), dpi=300)
fig.patch.set_facecolor('#0b1120')
ax.set_facecolor('#0b1120')
ax.set_xlim(0, 1.6)
ax.set_ylim(0, 0.9)
ax.axis('off')

# Title Header
plt.text(0.06, 0.84, "SMART WATER PURIFICATION & QUALITY MONITORING SYSTEM", 
         fontsize=16, fontweight='heavy', color='#ffffff')
plt.text(0.06, 0.81, "SIH Problem Statement ID: 26040 | Physical Hardware, Multi-Parameter Telemetry & 3-Tier Usability Node", 
         fontsize=10, color='#38bdf8')

# Stage 0: Contaminated Source
draw_container(
    ax, (0.06, 0.46), 0.23, 0.28,
    "SOURCE: ACID MINE DRAINAGE", "Inlet Pit / Mining Run-Off",
    ["• Raw Water Inlet Pipe",
     "• Elevated Heavy Metals (Fe2+/Fe3+)",
     "• High Turbidity (> 40 NTU)",
     "• Acidic pH Profile (< 4.5)",
     "• Unusable / Untreated Effluent"],
    "#1e293b", "#475569", "#94a3b8"
)

# Stage 1: Physical & Catalytic Media
draw_container(
    ax, (0.33, 0.46), 0.26, 0.28,
    "STAGE 1: PHYSICAL FILTRATION", "Mechanical & Catalytic Train",
    ["• Washable Mesh (100 Micron)",
     "• Venturi Eductor (Aeration: Fe2+->Fe3+)",
     "• Coarse Sand & Graded Gravel",
     "• Manganese Greensand (Strips Fe/Mn)",
     "• Granular Activated Carbon (GAC)"],
    "#0f172a", "#0284c7", "#38bdf8"
)

# Stage 2: Sensing & Multi-Parameter Manifold
draw_container(
    ax, (0.63, 0.46), 0.28, 0.28,
    "STAGE 2: SENSING MANIFOLD", "Real-Time Acquisition Chamber",
    ["• TCS34725 Optical Colorimeter (Fe)",
     "• Analog pH Sensor Probe",
     "• TS-300B Turbidity Optical Sensor",
     "• Analog TDS Sensor (PPM)",
     "• DS18B20 Temp Probe (Dynamic Offset)",
     "• YF-S201 Hall-Effect Flow Turbine"],
    "#172554", "#3b82f6", "#60a5fa"
)

# Stage 3: Closed-Loop Remediation
draw_container(
    ax, (0.95, 0.46), 0.28, 0.28,
    "STAGE 3: CLOSED-LOOP PURIFICATION", "Automated Remediation Train",
    ["• 4-Ch Optocoupled Relay Interlocks",
     "• Auto-Dosing Pump (Alkaline pH Fix)",
     "• 300 GPD Booster Pump (RO Desal)",
     "• Inline UV-C Reactor (254nm Disinfection)",
     "• Fail-Safe: UV Cuts if Turb > 10 NTU"],
    "#311042", "#c026d3", "#e879f9"
)

# Core Edge Controller (ESP32)
draw_container(
    ax, (0.40, 0.10), 0.38, 0.30,
    "🧠 COMPUTE & DECISION CORE", "ESP32 Dual-Core MCU (240 MHz)",
    ["• Real-Time IS 10500 Weighted Arithmetic WQI",
     "• 20x Analog Oversampling & Noise Filtering",
     "• Local Actuator Closed-Loop PWM Feedback",
     "• Local OLED Display & Dual Status LEDs",
     "• Active Buzzer Alert on Contamination",
     "• 2.4 GHz Wi-Fi / ESP-NOW Telemetry Sync"],
    "#032e3a", "#0d9488", "#2dd4bf"
)

# Remote PWA & 3-Tier Usability Engine
draw_container(
    ax, (0.83, 0.10), 0.40, 0.30,
    "📲 JalDrishti(H₂O) MOBILE PWA", "Cloud Analytics & Governance Engine",
    ["• Cloudflare HTTPS Secure Tunnel",
     "• Real-Time WQI Longitudinal Trend (7D / 14D / 1M)",
     "• 3-Tier Water Usability Distribution Donut:",
     "    🟢 Household Use (Potable: WQI >= 70)",
     "    🟡 Agriculture Purpose (Irrigation: WQI 45-69)",
     "    🔴 Unusable / Undrinkable (WQI < 45)",
     "• One-Click Historical CSV Audit Exporter"],
    "#371b05", "#d97706", "#fbbf24"
)

# Safe Potable Outlet
draw_container(
    ax, (1.27, 0.46), 0.27, 0.28,
    "OUTPUT: VERIFIED CLEAN WATER", "IS 10500 Regulatory Compliance",
    ["• Dissolved Iron (Fe): <= 0.3 mg/L",
     "• pH Level: 6.5 - 8.5",
     "• Turbidity: <= 5.0 NTU",
     "• TDS: <= 500 PPM",
     "• Pathogen & Bacteria Inactivated"],
    "#064e3b", "#059669", "#34d399"
)

# Flow Arrows
def draw_arrow(p1, p2, c="#38bdf8", lw=2.0):
    ax.annotate("", xy=p2, xytext=p1,
        arrowprops=dict(arrowstyle="-|>", color=c, lw=lw, shrinkA=3, shrinkB=3), zorder=4)

draw_arrow((0.29, 0.60), (0.33, 0.60), "#64748b", 2.2)
draw_arrow((0.59, 0.60), (0.63, 0.60), "#0284c7", 2.2)
draw_arrow((0.91, 0.60), (0.95, 0.60), "#3b82f6", 2.2)
draw_arrow((1.23, 0.60), (1.27, 0.60), "#059669", 2.5)

# Control/Telemetry Feedback Arrows
draw_arrow((0.77, 0.46), (0.68, 0.40), "#2dd4bf", 1.8)
draw_arrow((0.70, 0.40), (0.95, 0.52), "#c026d3", 1.8)
draw_arrow((0.78, 0.25), (0.83, 0.25), "#fbbf24", 2.0)

plt.tight_layout()
output_path = "sih_system_setup_updated.png"
plt.savefig(output_path, dpi=300, facecolor=fig.get_facecolor(), edgecolor='none')
plt.close()
print(f"Generated updated PPT setup visual: {output_path}")