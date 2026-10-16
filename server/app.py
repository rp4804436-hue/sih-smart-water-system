import os
import csv
import math
import datetime
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# -------------------------------------------------------------
# 1. Multi-Node Registry & Data Storage Configuration
# -------------------------------------------------------------
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
os.makedirs(DATA_DIR, exist_ok=True)

VALID_NODES = {
    "lucknow_tank_1": "Lucknow Tank-1",
    "lucknow_tank_2": "Lucknow Tank-2",
    "lucknow_tank_3": "Lucknow Tank-3",
    "lucknow_tank_4": "Lucknow Tank-4"
}

DEFAULT_NODE_ID = "lucknow_tank_1"

CSV_HEADERS = [
    "Timestamp", "WQI", "Iron_mgL", "pH", 
    "Turbidity_NTU", "TDS_PPM", "Temperature_C", 
    "FlowRate_Lmin", "Lime_Dosing_gm3", "Status", "Mode"
]

def get_node_csv_path(node_id):
    safe_node = node_id if node_id in VALID_NODES else DEFAULT_NODE_ID
    return os.path.join(DATA_DIR, f"telemetry_{safe_node}.csv")

# -------------------------------------------------------------
# 2. Stoichiometric Calculations & Environmental Models
# -------------------------------------------------------------
def compute_stoichiometric_lime(ph_val, iron_val):
    """
    Computes required Ca(OH)2 lime mass (g/m^3) to neutralize acidity
    and precipitate soluble iron Fe3+ + 3OH- -> Fe(OH)3.
    """
    lime_ph = 0.0
    if ph_val < 7.0:
        h_deficit = (10 ** (-ph_val)) - (10 ** (-7.0))
        lime_ph = max(0.0, h_deficit * 0.5 * 74.09 * 1000.0)

    lime_fe = 0.0
    if iron_val > 0.30:
        lime_fe = (iron_val - 0.30) * 1.987

    total_lime = lime_ph + lime_fe
    return round(total_lime, 2)

def compute_wqi(fe, ph, turb, tds):
    """
    Weighted arithmetic Water Quality Index based on IS 10500:2012 standards.
    """
    # Iron sub-index (Limit 0.30 mg/L)
    if fe <= 0.30:
        q_fe = max(0.0, 100.0 - (fe / 0.30) * 100.0)
    else:
        q_fe = max(0.0, 50.0 - ((fe - 0.30) / 1.0) * 50.0)

    # pH sub-index (Neutral target 7.0, band 6.5 - 8.5)
    q_ph = max(0.0, 100.0 - (abs(ph - 7.0) / 1.5) * 100.0)

    # Turbidity sub-index (Limit 5.0 NTU)
    if turb <= 5.0:
        q_turb = max(0.0, 100.0 - (turb / 5.0) * 100.0)
    else:
        q_turb = max(0.0, 50.0 - ((turb - 5.0) / 15.0) * 50.0)

    # TDS sub-index (Limit 500 PPM)
    if tds <= 500.0:
        q_tds = max(0.0, 100.0 - (tds / 500.0) * 100.0)
    else:
        q_tds = max(0.0, 50.0 - ((tds - 500.0) / 500.0) * 50.0)

    wqi = (q_fe * 0.35) + (q_ph * 0.25) + (q_turb * 0.20) + (q_tds * 0.20)
    return int(round(wqi))

def compute_metal_proxies(fe, ph, tds):
    """
    Machine Learning surrogate proxies for Manganese (Mn) and Sulfate (SO4).
    """
    est_mn = round(fe * 0.18, 3)
    est_so4 = round((tds * 0.42) + max(0.0, (6.5 - ph) * 28.5), 1)
    
    return {
        "manganese_mgL": est_mn,
        "manganese_safe": est_mn <= 0.10,
        "sulfate_mgL": est_so4,
        "sulfate_safe": est_so4 <= 200.0
    }

# -------------------------------------------------------------
# 3. Automatic Seeding for Fresh / Ephemeral Deployments
# -------------------------------------------------------------
def initialize_node_storage():
    """
    Seeds historical baseline records if no telemetry CSV exists.
    Prevents blank UI states on Render restarts.
    """
    tank_baselines = {
        "lucknow_tank_1": {"iron": 0.48, "ph": 6.2, "turb": 6.8, "tds": 380, "temp": 25.2, "mode": "Heavy Purification", "status": "Contaminated"},
        "lucknow_tank_2": {"iron": 0.28, "ph": 6.7, "turb": 4.1, "tds": 310, "temp": 24.8, "mode": "Optimal Active", "status": "Safe"},
        "lucknow_tank_3": {"iron": 0.18, "ph": 7.1, "turb": 3.4, "tds": 420, "temp": 25.0, "mode": "Optimal Active", "status": "Safe"},
        "lucknow_tank_4": {"iron": 0.08, "ph": 7.3, "turb": 1.2, "tds": 210, "temp": 24.1, "mode": "Optimal Active", "status": "Safe"}
    }

    base_time = datetime.datetime.now()

    for node_id, profile in tank_baselines.items():
        csv_file = get_node_csv_path(node_id)
        if not os.path.exists(csv_file) or os.path.getsize(csv_file) == 0:
            with open(csv_file, mode="w", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(CSV_HEADERS)
                
                # Seed 20 historical intervals
                for i in range(20, -1, -1):
                    t_stamp = (base_time - datetime.timedelta(seconds=i * 3)).strftime("%Y-%m-%d %H:%M:%S")
                    fe = round(max(0.05, profile["iron"] + math.sin(i) * 0.04), 2)
                    ph = round(max(5.5, profile["ph"] + math.cos(i) * 0.1), 2)
                    turb = round(max(0.5, profile["turb"] + math.sin(i * 0.5) * 0.3), 1)
                    tds = int(profile["tds"] + math.cos(i * 0.8) * 15)
                    temp = profile["temp"]
                    flow = 12.0
                    wqi = compute_wqi(fe, ph, turb, tds)
                    lime = compute_stoichiometric_lime(ph, fe)
                    status = "Safe" if (wqi >= 70 and fe <= 0.30 and 6.5 <= ph <= 8.5) else "Contaminated"

                    writer.writerow([
                        t_stamp, wqi, fe, ph, turb, tds, temp, flow, lime, status, profile["mode"]
                    ])

initialize_node_storage()

# -------------------------------------------------------------
# 4. API Endpoints
# -------------------------------------------------------------
@app.route("/api/telemetry", methods=["POST"])
def receive_telemetry():
    """
    Ingests live telemetry from ESP32 edge nodes.
    Calculates remediation values and returns actuation downlink payload.
    """
    try:
        data = request.get_json(force=True)
        node_id = data.get("node_id", DEFAULT_NODE_ID)
        if node_id not in VALID_NODES:
            node_id = DEFAULT_NODE_ID

        fe = float(data.get("iron", 0.0))
        ph = float(data.get("ph", 7.0))
        turb = float(data.get("turbidity", 0.0))
        tds = float(data.get("tds", 0.0))
        temp = float(data.get("temperature", 25.0))
        flow = float(data.get("flow_rate", 10.0))

        # Core calculations
        wqi = compute_wqi(fe, ph, turb, tds)
        lime_dosing = compute_stoichiometric_lime(ph, fe)
        proxies = compute_metal_proxies(fe, ph, tds)

        is_safe = (wqi >= 70 and fe <= 0.30 and 6.5 <= ph <= 8.5 and turb <= 5.0 and tds <= 500)
        status_str = "Safe" if is_safe else "Contaminated"
        mode_str = "Optimal Active" if is_safe else "Heavy Purification"

        timestamp_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # Append to node CSV
        csv_path = get_node_csv_path(node_id)
        file_exists = os.path.exists(csv_path) and os.path.getsize(csv_path) > 0
        with open(csv_path, mode="a", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            if not file_exists:
                writer.writerow(CSV_HEADERS)
            writer.writerow([
                timestamp_str, wqi, fe, ph, turb, round(tds, 1), 
                round(temp, 1), round(flow, 1), lime_dosing, status_str, mode_str
            ])

        # Return actuation downlink payload to ESP32
        # PWM speed between 90-255 if dosing required
        pwm_val = int(min(255, max(90, lime_dosing * 12))) if lime_dosing > 0 else 0
        uv_relay = True  # Always energized during active water delivery
        purge_val = turb > 15.0 or fe > 3.0  # Trigger anti-fouling flush if excessive solids

        return jsonify({
            "status": "success",
            "node_id": node_id,
            "wqi": wqi,
            "lime_dosing_g_m3": lime_dosing,
            "actuation": {
                "dosing_pwm": pwm_val,
                "uv_relay": uv_relay,
                "purge_valve": purge_val
            },
            "proxies": proxies
        }), 200

    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route("/api/latest", methods=["GET"])
def get_latest_telemetry():
    """
    Returns the single latest reading for a specific tank node.
    """
    node_id = request.args.get("node_id", DEFAULT_NODE_ID)
    if node_id not in VALID_NODES:
        node_id = DEFAULT_NODE_ID

    csv_path = get_node_csv_path(node_id)
    if not os.path.exists(csv_path):
        initialize_node_storage()

    rows = []
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            rows.append(r)

    if not rows:
        return jsonify({"empty": True}), 200

    latest = rows[-1]
    fe = float(latest["Iron_mgL"])
    ph = float(latest["pH"])
    turb = float(latest["Turbidity_NTU"])
    tds = float(latest["TDS_PPM"])

    return jsonify({
        "empty": False,
        "node_id": node_id,
        "node_name": VALID_NODES[node_id],
        "timestamp": latest["Timestamp"],
        "wqi": int(latest["WQI"]),
        "iron": fe,
        "ph": ph,
        "turbidity": turb,
        "tds": tds,
        "temperature": float(latest["Temperature_C"]),
        "flow_rate": float(latest.get("FlowRate_Lmin", 12.0)),
        "lime_dosing_g_m3": float(latest.get("Lime_Dosing_gm3", 0.0)),
        "status": latest["Status"],
        "mode": latest["Mode"],
        "proxies": compute_metal_proxies(fe, ph, tds)
    })

@app.route("/api/history", methods=["GET"])
def get_telemetry_history():
    """
    Returns history of records for chart traces and tables.
    """
    node_id = request.args.get("node_id", DEFAULT_NODE_ID)
    if node_id not in VALID_NODES:
        node_id = DEFAULT_NODE_ID

    csv_path = get_node_csv_path(node_id)
    if not os.path.exists(csv_path):
        initialize_node_storage()

    history = []
    with open(csv_path, mode="r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            history.append(r)

    # Return up to last 100 entries
    return jsonify(history[-100:]), 200

@app.route("/api/download-csv", methods=["GET"])
def download_csv():
    """
    Downloads node-specific telemetry log as CSV file.
    """
    node_id = request.args.get("node_id", DEFAULT_NODE_ID)
    if node_id not in VALID_NODES:
        node_id = DEFAULT_NODE_ID

    csv_path = get_node_csv_path(node_id)
    if not os.path.exists(csv_path):
        initialize_node_storage()

    return send_file(
        csv_path,
        mimetype="text/csv",
        as_attachment=True,
        download_name=f"JalDrishti_Telemetry_{node_id}.csv"
    )

@app.route("/api/nodes", methods=["GET"])
def list_nodes():
    """
    Returns all registered Jal Nigam tank nodes.
    """
    return jsonify([
        {"node_key": k, "name": v} for k, v in VALID_NODES.items()
    ])

@app.route("/")
def index():
    return send_file(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "dashboard", "index.html"))

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)