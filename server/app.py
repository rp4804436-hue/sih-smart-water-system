import os
import csv
from datetime import datetime
from flask import Flask, request, jsonify, send_file, render_template

app = Flask(__name__, template_folder="../dashboard", static_folder="../dashboard")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
LOG_DIR = os.path.join(BASE_DIR, "logs")
os.makedirs(LOG_DIR, exist_ok=True)

VALID_NODES = {
    "lucknow_tank_01": "Lucknow (Main Tank-1)",
    "lucknow_tank_02": "Lucknow (Main Tank-2)",
    "lucknow_tank_03": "Lucknow (Main Tank-3)",
    "lucknow_tank_04": "Lucknow (Main Tank-4)"
}

DEFAULT_NODE_ID = "lucknow_tank_01"

CSV_HEADERS = [
    "Timestamp", "Node_ID", "Station_Name", "Iron_mgL", "pH", 
    "Turbidity_NTU", "TDS_PPM", "Temperature_C", "Flow_LPM", 
    "WQI", "Status", "Mode"
]

def get_node_csv_path(node_id):
    if node_id not in VALID_NODES:
        node_id = DEFAULT_NODE_ID
    return os.path.join(LOG_DIR, f"telemetry_{node_id}.csv")

def calculate_wqi(fe, ph, turb, tds):
    q_fe = max(0, 100 - (fe / 0.3) * 100) if fe <= 0.3 else max(0, 50 - ((fe - 0.3) / 1.0) * 50)
    q_ph = max(0, 100 - (abs(ph - 7.0) / 1.5) * 100)
    q_turb = max(0, 100 - (turb / 5.0) * 100) if turb <= 5.0 else max(0, 50 - ((turb - 5.0) / 15.0) * 50)
    q_tds = max(0, 100 - (tds / 500.0) * 100) if tds <= 500 else max(0, 50 - ((tds - 500) / 500.0) * 50)
    return round((q_fe * 0.35) + (q_ph * 0.25) + (q_turb * 0.20) + (q_tds * 0.20))

def compute_lime_dosing(ph, fe):
    lime_ph = max(0.0, (10**(-ph) - 10**(-7.0)) * 0.5 * 74.09 * 1000) if ph < 7.0 else 0.0
    lime_fe = max(0.0, (fe - 0.30) * 1.987) if fe > 0.30 else 0.0
    return round(lime_ph + lime_fe, 2)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/telemetry", methods=["POST"])
def receive_telemetry():
    data = request.get_json(force=True)
    node_id = data.get("node_id", DEFAULT_NODE_ID)
    if node_id not in VALID_NODES:
        node_id = DEFAULT_NODE_ID

    fe = float(data.get("iron", 0.0))
    ph = float(data.get("ph", 7.0))
    turb = float(data.get("turbidity", 0.0))
    tds = float(data.get("tds", 0.0))
    temp = float(data.get("temperature", 25.0))
    flow = float(data.get("flow_lpm", 15.0))

    wqi = calculate_wqi(fe, ph, turb, tds)
    status = "Safe" if (wqi >= 70 and fe <= 0.3 and 6.5 <= ph <= 8.5 and tds <= 500 and turb <= 5.0) else "Unsafe"
    mode = "Heavy Purification" if wqi < 50 else ("Standard Treatment" if wqi < 70 else "Polish & Flow")

    lime_dosing = compute_lime_dosing(ph, fe)
    uv_state = True if (turb > 3.0 or wqi < 70) else False

    # Append to node CSV
    csv_path = get_node_csv_path(node_id)
    is_new = not os.path.exists(csv_path) or os.stat(csv_path).st_size == 0
    with open(csv_path, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(CSV_HEADERS)
        writer.writerow([
            datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            node_id,
            VALID_NODES[node_id],
            f"{fe:.2f}",
            f"{ph:.2f}",
            f"{turb:.1f}",
            round(tds),
            f"{temp:.1f}",
            f"{flow:.1f}",
            wqi,
            status,
            mode
        ])

    return jsonify({
        "status": "success",
        "node_id": node_id,
        "wqi": wqi,
        "lime_dosing_g_m3": lime_dosing,
        "uv_state": uv_state,
        "pump_pwm": min(255, int(90 + (lime_dosing * 8))) if lime_dosing > 0 else 0
    }), 200

@app.route("/api/latest", methods=["GET"])
def get_latest():
    node_id = request.args.get("node_id", DEFAULT_NODE_ID)
    csv_path = get_node_csv_path(node_id)
    
    if not os.path.exists(csv_path):
        # Default mock baseline if node is newly selected
        return jsonify({
            "empty": False,
            "node_id": node_id,
            "iron": 4.70 if "01" in node_id else (0.45 if "02" in node_id else 0.15),
            "ph": 5.50 if "01" in node_id else (6.20 if "02" in node_id else 7.20),
            "turbidity": 25.0 if "01" in node_id else (8.0 if "02" in node_id else 2.1),
            "tds": 600 if "01" in node_id else (420 if "02" in node_id else 210),
            "temperature": 27.2,
            "wqi": 8 if "01" in node_id else (48 if "02" in node_id else 88),
            "mode": "Heavy Purification" if "01" in node_id else ("Standard Treatment" if "02" in node_id else "Polish & Flow"),
            "lime_dosing_g_m3": 8.9 if "01" in node_id else 0.0,
            "proxies": {
                "manganese_mgL": 0.90 if "01" in node_id else 0.08,
                "manganese_safe": False if "01" in node_id else True,
                "sulfate_mgL": 295 if "01" in node_id else 145,
                "sulfate_safe": False if "01" in node_id else True
            }
        })

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = list(csv.DictReader(f))
        if not reader:
            return jsonify({"empty": True})
        row = reader[-1]

    fe = float(row.get("Iron_mgL", 0.0))
    ph = float(row.get("pH", 7.0))
    tds = float(row.get("TDS_PPM", 0.0))
    lime = compute_lime_dosing(ph, fe)

    mn_val = round(fe * 0.18, 2)
    so4_val = round((tds * 0.42) + max(0.0, (6.5 - ph) * 28.5), 1)

    return jsonify({
        "empty": False,
        "node_id": node_id,
        "iron": fe,
        "ph": ph,
        "turbidity": float(row.get("Turbidity_NTU", 0.0)),
        "tds": tds,
        "temperature": float(row.get("Temperature_C", 25.0)),
        "wqi": int(row.get("WQI", 70)),
        "mode": row.get("Mode", "Standard Treatment"),
        "lime_dosing_g_m3": lime,
        "proxies": {
            "manganese_mgL": mn_val,
            "manganese_safe": mn_val <= 0.10,
            "sulfate_mgL": so4_val,
            "sulfate_safe": so4_val <= 200.0
        }
    })

@app.route("/api/history", methods=["GET"])
def get_history():
    node_id = request.args.get("node_id", DEFAULT_NODE_ID)
    csv_path = get_node_csv_path(node_id)
    if not os.path.exists(csv_path):
        return jsonify([])

    with open(csv_path, "r", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
        return jsonify(rows[-50:])

@app.route("/api/download-csv", methods=["GET"])
def download_csv():
    node_id = request.args.get("node_id", DEFAULT_NODE_ID)
    csv_path = get_node_csv_path(node_id)
    if not os.path.exists(csv_path):
        return jsonify({"error": "No records found for node"}), 404
    return send_file(csv_path, as_attachment=True, download_name=f"telemetry_{node_id}.csv")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)