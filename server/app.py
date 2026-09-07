import os
import csv
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS

# Resolve paths dynamically whether executing locally or inside Render containers
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
DASHBOARD_DIR = os.path.join(BASE_DIR, 'dashboard')
DATA_DIR = os.path.dirname(__file__)

app = Flask(__name__, static_folder=DASHBOARD_DIR, static_url_path='')
CORS(app)

NODE_FILES = {
    'dhanbad_01': os.path.join(DATA_DIR, 'telemetry_dhanbad_01.csv'),
    'bokaro_02': os.path.join(DATA_DIR, 'telemetry_bokaro_02.csv'),
    'ramgarh_03': os.path.join(DATA_DIR, 'telemetry_ramgarh_03.csv'),
    'ranchi_04': os.path.join(DATA_DIR, 'telemetry_ranchi_04.csv')
}

CSV_FIELDNAMES = ['Timestamp', 'Node_ID', 'Iron_mgL', 'pH', 'Turbidity_NTU', 'TDS_PPM', 'Temperature_C', 'WQI', 'Status', 'Mode']

# 20 Realistic Telemetry Progression Samples per Mining Station Profile
SEED_PROFILES_20 = {
    'dhanbad_01': [
        # Heavy Acid Mine Drainage & Suspended Slurry Breakthrough -> Gradual Sedimentation
        {'iron': 7.60, 'ph': 4.10, 'turbidity': 44.0, 'tds': 790, 'temp': 28.2, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.45, 'ph': 4.15, 'turbidity': 43.5, 'tds': 780, 'temp': 28.2, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.20, 'ph': 4.25, 'turbidity': 42.0, 'tds': 770, 'temp': 28.1, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.05, 'ph': 4.30, 'turbidity': 41.2, 'tds': 760, 'temp': 28.0, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 6.90, 'ph': 4.40, 'turbidity': 40.0, 'tds': 750, 'temp': 28.0, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 6.80, 'ph': 4.45, 'turbidity': 39.0, 'tds': 740, 'temp': 27.9, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 6.65, 'ph': 4.55, 'turbidity': 38.0, 'tds': 730, 'temp': 27.9, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 6.50, 'ph': 4.60, 'turbidity': 37.0, 'tds': 720, 'temp': 27.8, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 6.35, 'ph': 4.70, 'turbidity': 36.2, 'tds': 710, 'temp': 27.8, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 6.20, 'ph': 4.75, 'turbidity': 35.0, 'tds': 700, 'temp': 27.7, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 6.00, 'ph': 4.85, 'turbidity': 34.0, 'tds': 690, 'temp': 27.7, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 5.85, 'ph': 4.90, 'turbidity': 33.1, 'tds': 680, 'temp': 27.6, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 5.70, 'ph': 5.00, 'turbidity': 32.0, 'tds': 670, 'temp': 27.6, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 5.55, 'ph': 5.10, 'turbidity': 31.0, 'tds': 660, 'temp': 27.5, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 5.40, 'ph': 5.15, 'turbidity': 30.2, 'tds': 650, 'temp': 27.5, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 5.25, 'ph': 5.25, 'turbidity': 29.0, 'tds': 640, 'temp': 27.4, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 5.10, 'ph': 5.30, 'turbidity': 28.0, 'tds': 630, 'temp': 27.4, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 4.95, 'ph': 5.40, 'turbidity': 27.0, 'tds': 620, 'temp': 27.3, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 4.80, 'ph': 5.45, 'turbidity': 26.2, 'tds': 610, 'temp': 27.3, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 4.70, 'ph': 5.50, 'turbidity': 25.0, 'tds': 600, 'temp': 27.2, 'status': 'Unsafe', 'mode': 'Heavy Purification'}
    ],
    'bokaro_02': [
        # Moderate Acidity transitioning through alkaline dosing -> Irrigation Grade
        {'iron': 3.40, 'ph': 5.40, 'turbidity': 18.0, 'tds': 540, 'temp': 27.4, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 3.25, 'ph': 5.50, 'turbidity': 17.2, 'tds': 530, 'temp': 27.3, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 3.10, 'ph': 5.55, 'turbidity': 16.5, 'tds': 515, 'temp': 27.3, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 2.95, 'ph': 5.65, 'turbidity': 15.8, 'tds': 500, 'temp': 27.2, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 2.80, 'ph': 5.75, 'turbidity': 15.0, 'tds': 490, 'temp': 27.1, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 2.65, 'ph': 5.85, 'turbidity': 14.2, 'tds': 475, 'temp': 27.1, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 2.50, 'ph': 5.95, 'turbidity': 13.5, 'tds': 460, 'temp': 27.0, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 2.35, 'ph': 6.05, 'turbidity': 12.8, 'tds': 450, 'temp': 27.0, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 2.20, 'ph': 6.10, 'turbidity': 12.0, 'tds': 440, 'temp': 26.9, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 2.05, 'ph': 6.18, 'turbidity': 11.2, 'tds': 425, 'temp': 26.9, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.90, 'ph': 6.25, 'turbidity': 10.5, 'tds': 410, 'temp': 26.8, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.80, 'ph': 6.30, 'turbidity': 9.8,  'tds': 400, 'temp': 26.8, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.70, 'ph': 6.38, 'turbidity': 9.2,  'tds': 390, 'temp': 26.7, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.60, 'ph': 6.42, 'turbidity': 8.6,  'tds': 380, 'temp': 26.7, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.50, 'ph': 6.48, 'turbidity': 8.0,  'tds': 370, 'temp': 26.6, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.40, 'ph': 6.52, 'turbidity': 7.5,  'tds': 360, 'temp': 26.6, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.30, 'ph': 6.58, 'turbidity': 7.0,  'tds': 350, 'temp': 26.5, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.20, 'ph': 6.62, 'turbidity': 6.5,  'tds': 345, 'temp': 26.5, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.10, 'ph': 6.68, 'turbidity': 6.0,  'tds': 335, 'temp': 26.4, 'status': 'Unsafe', 'mode': 'Low Purification'},
        {'iron': 1.00, 'ph': 6.72, 'turbidity': 5.5,  'tds': 330, 'temp': 26.4, 'status': 'Unsafe', 'mode': 'Low Purification'}
    ],
    'ramgarh_03': [
        # Severe Pit Tailings AMD (Hyper-acidic pH < 4.0, Extreme Heavy Metal Loading)
        {'iron': 9.80, 'ph': 3.30, 'turbidity': 58.0, 'tds': 940, 'temp': 29.1, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 9.60, 'ph': 3.35, 'turbidity': 56.5, 'tds': 920, 'temp': 29.0, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 9.40, 'ph': 3.42, 'turbidity': 55.0, 'tds': 905, 'temp': 28.9, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 9.20, 'ph': 3.50, 'turbidity': 53.5, 'tds': 890, 'temp': 28.8, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 9.05, 'ph': 3.58, 'turbidity': 52.0, 'tds': 875, 'temp': 28.7, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 8.90, 'ph': 3.65, 'turbidity': 50.0, 'tds': 860, 'temp': 28.5, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 8.75, 'ph': 3.72, 'turbidity': 48.5, 'tds': 850, 'temp': 28.5, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 8.60, 'ph': 3.78, 'turbidity': 47.0, 'tds': 840, 'temp': 28.4, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 8.45, 'ph': 3.82, 'turbidity': 46.0, 'tds': 830, 'temp': 28.3, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 8.30, 'ph': 3.88, 'turbidity': 45.0, 'tds': 820, 'temp': 28.3, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 8.10, 'ph': 3.95, 'turbidity': 44.0, 'tds': 810, 'temp': 28.2, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.95, 'ph': 4.02, 'turbidity': 43.0, 'tds': 800, 'temp': 28.2, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.80, 'ph': 4.08, 'turbidity': 42.0, 'tds': 790, 'temp': 28.1, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.65, 'ph': 4.14, 'turbidity': 41.0, 'tds': 780, 'temp': 28.1, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.50, 'ph': 4.20, 'turbidity': 40.0, 'tds': 770, 'temp': 28.0, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.35, 'ph': 4.25, 'turbidity': 39.0, 'tds': 760, 'temp': 28.0, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.20, 'ph': 4.30, 'turbidity': 38.0, 'tds': 750, 'temp': 27.9, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 7.05, 'ph': 4.35, 'turbidity': 37.0, 'tds': 740, 'temp': 27.9, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 6.90, 'ph': 4.40, 'turbidity': 36.2, 'tds': 735, 'temp': 27.8, 'status': 'Unsafe', 'mode': 'Heavy Purification'},
        {'iron': 6.80, 'ph': 4.45, 'turbidity': 35.0, 'tds': 725, 'temp': 27.8, 'status': 'Unsafe', 'mode': 'Heavy Purification'}
    ],
    'ranchi_04': [
        # IS 10500 Potable Baseline (Post-Greensand & UV Polish Safe Tap)
        {'iron': 0.28, 'ph': 7.12, 'turbidity': 3.8, 'tds': 210, 'temp': 26.2, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.25, 'ph': 7.16, 'turbidity': 3.4, 'tds': 205, 'temp': 26.1, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.22, 'ph': 7.20, 'turbidity': 3.1, 'tds': 198, 'temp': 26.1, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.19, 'ph': 7.24, 'turbidity': 2.8, 'tds': 192, 'temp': 26.0, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.16, 'ph': 7.28, 'turbidity': 2.5, 'tds': 188, 'temp': 26.0, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.14, 'ph': 7.30, 'turbidity': 2.3, 'tds': 185, 'temp': 25.9, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.12, 'ph': 7.32, 'turbidity': 2.0, 'tds': 180, 'temp': 25.9, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.10, 'ph': 7.35, 'turbidity': 1.8, 'tds': 174, 'temp': 25.8, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.08, 'ph': 7.38, 'turbidity': 1.6, 'tds': 168, 'temp': 25.8, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.07, 'ph': 7.40, 'turbidity': 1.4, 'tds': 164, 'temp': 25.7, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.06, 'ph': 7.41, 'turbidity': 1.3, 'tds': 160, 'temp': 25.7, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.05, 'ph': 7.42, 'turbidity': 1.1, 'tds': 155, 'temp': 25.7, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.04, 'ph': 7.43, 'turbidity': 1.0, 'tds': 152, 'temp': 25.6, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.04, 'ph': 7.44, 'turbidity': 0.9, 'tds': 150, 'temp': 25.6, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.03, 'ph': 7.45, 'turbidity': 0.8, 'tds': 146, 'temp': 25.6, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.03, 'ph': 7.45, 'turbidity': 0.8, 'tds': 145, 'temp': 25.5, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.02, 'ph': 7.46, 'turbidity': 0.7, 'tds': 142, 'temp': 25.5, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.02, 'ph': 7.47, 'turbidity': 0.6, 'tds': 140, 'temp': 25.5, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.02, 'ph': 7.47, 'turbidity': 0.6, 'tds': 138, 'temp': 25.4, 'status': 'Safe', 'mode': 'Low Purification'},
        {'iron': 0.01, 'ph': 7.48, 'turbidity': 0.5, 'tds': 135, 'temp': 25.4, 'status': 'Safe', 'mode': 'Low Purification'}
    ]
}

def compute_wqi(fe, ph, turb, tds):
    q_fe = max(0, 100 - (fe / 0.3) * 100) if fe <= 0.3 else max(0, 50 - ((fe - 0.3) / 1.0) * 50)
    q_ph = max(0, 100 - (abs(ph - 7.0) / 1.5) * 100)
    q_turb = max(0, 100 - (turb / 5.0) * 100) if turb <= 5.0 else max(0, 50 - ((turb - 5.0) / 15.0) * 50)
    q_tds = max(0, 100 - (tds / 500.0) * 100) if tds <= 500 else max(0, 50 - ((tds - 500) / 500.0) * 50)
    return round((q_fe * 0.35) + (q_ph * 0.25) + (q_turb * 0.20) + (q_tds * 0.20))

# Pre-populate CSV logs with 20 chronologically staggered entries per node if missing
now = datetime.now()
for node_id, file_path in NODE_FILES.items():
    if not os.path.exists(file_path):
        with open(file_path, mode='w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
            writer.writeheader()
            samples = SEED_PROFILES_20[node_id]
            for idx, sample in enumerate(samples):
                # Stagger records backward (oldest first: 60 mins ago -> newest: now)
                timestamp = (now - timedelta(minutes=(len(samples) - 1 - idx) * 3)).strftime('%Y-%m-%d %H:%M:%S')
                wqi = compute_wqi(sample['iron'], sample['ph'], sample['turbidity'], sample['tds'])
                writer.writerow({
                    'Timestamp': timestamp,
                    'Node_ID': node_id,
                    'Iron_mgL': sample['iron'],
                    'pH': sample['ph'],
                    'Turbidity_NTU': sample['turbidity'],
                    'TDS_PPM': sample['tds'],
                    'Temperature_C': sample['temp'],
                    'WQI': wqi,
                    'Status': sample['status'],
                    'Mode': sample['mode']
                })

def resolve_node(req):
    node_id = req.args.get('node_id') or req.args.get('node') or 'dhanbad_01'
    if node_id not in NODE_FILES:
        node_id = 'dhanbad_01'
    return NODE_FILES[node_id], node_id

# Serve PWA Frontend Assets
@app.route('/')
def index():
    return send_from_directory(DASHBOARD_DIR, 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    return send_from_directory(DASHBOARD_DIR, filename)

# Ingest Live Telemetry (ESP32 or REST tests)
@app.route('/api/telemetry', methods=['POST'])
def receive_telemetry():
    data = request.get_json() or {}
    node_id = data.get('node_id') or request.args.get('node_id', 'dhanbad_01')
    if node_id not in NODE_FILES:
        node_id = 'dhanbad_01'
    file_path = NODE_FILES[node_id]

    fe = float(data.get('iron', 0.0))
    ph = float(data.get('ph', 7.0))
    turb = float(data.get('turbidity', 0.0))
    tds = float(data.get('tds', 0.0))
    temp = float(data.get('temperature', 25.0))
    status = data.get('status', 'Unsafe')
    mode = data.get('mode', 'Low Purification')
    wqi = compute_wqi(fe, ph, turb, tds)

    row = {
        'Timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'Node_ID': node_id,
        'Iron_mgL': fe,
        'pH': ph,
        'Turbidity_NTU': turb,
        'TDS_PPM': tds,
        'Temperature_C': temp,
        'WQI': wqi,
        'Status': status,
        'Mode': mode
    }

    with open(file_path, mode='a', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDNAMES)
        writer.writerow(row)

    return jsonify({"success": True, "node_id": node_id, "wqi": wqi}), 201

# Fetch Latest Ingested Record for Specified Station
@app.route('/api/latest', methods=['GET'])
def get_latest():
    file_path, node_id = resolve_node(request)
    if not os.path.exists(file_path):
        return jsonify({"empty": True, "node_id": node_id})

    with open(file_path, mode='r', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
        if not rows:
            return jsonify({"empty": True, "node_id": node_id})
        last = rows[-1]
        return jsonify({
            "empty": False,
            "node_id": node_id,
            "timestamp": last['Timestamp'],
            "iron": float(last['Iron_mgL']),
            "ph": float(last['pH']),
            "turbidity": float(last['Turbidity_NTU']),
            "tds": float(last['TDS_PPM']),
            "temperature": float(last['Temperature_C']),
            "wqi": int(last['WQI']),
            "status": last['Status'],
            "mode": last['Mode']
        })

# Retrieve Historical Log Sequence for Trend Analysis
@app.route('/api/history', methods=['GET'])
def get_history():
    file_path, node_id = resolve_node(request)
    if not os.path.exists(file_path):
        return jsonify([])

    with open(file_path, mode='r', encoding='utf-8') as f:
        rows = list(csv.DictReader(f))
        return jsonify(rows)

# Download CSV Register for Active Node
@app.route('/api/download-csv', methods=['GET'])
def download_csv():
    file_path, node_id = resolve_node(request)
    return send_file(file_path, as_attachment=True, download_name=f'telemetry_{node_id}.csv')

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)