let rawTelemetryHistory = [];
let currentRangeDays = 7;
let currentLanguage = 'EN';
let isHpiMode = false;

let drinkableCount = 0;
let agricultureCount = 0;
let unusableCount = 0;

let modalChartInstance = null;
let detailModal = null;
let recordsModal = null;
let gisModal = null;

// Initialize Modals safely after DOM loads
document.addEventListener('DOMContentLoaded', () => {
  const m1 = document.getElementById('metricDetailModal');
  const m2 = document.getElementById('recordsModal');
  const m3 = document.getElementById('gisModal');
  if (m1) detailModal = new bootstrap.Modal(m1);
  if (m2) recordsModal = new bootstrap.Modal(m2);
  if (m3) gisModal = new bootstrap.Modal(m3);
});

// -------------------------------------------------------------
// 1. Lucknow Over-Head Tank Multi-Node Registry
// -------------------------------------------------------------
const clusterNodes = [
  { id: 0, node_key: "lucknow_tank_01", name: "Lucknow (Main Tank-1)", lat: 26.8467, lng: 80.9462, status: "High Iron / Silt Runoff", color: "#ef4444" },
  { id: 1, node_key: "lucknow_tank_02", name: "Lucknow (Main Tank-2)", lat: 26.8650, lng: 80.9650, status: "Moderate Acidity / Turbid", color: "#f59e0b" },
  { id: 2, node_key: "lucknow_tank_03", name: "Lucknow (Main Tank-3)", lat: 26.8350, lng: 80.9350, status: "Elevated TDS & Mineral Load", color: "#f59e0b" },
  { id: 3, node_key: "lucknow_tank_04", name: "Lucknow (Main Tank-4)", lat: 26.8500, lng: 80.9800, status: "IS 10500 Potable", color: "#10b981" }
];

let selectedNodeIndex = 0;
let map = null;
const markers = [];

function initMap() {
  if (map) return;
  const mapEl = document.getElementById('gisMap');
  if (!mapEl) return;

  map = L.map('gisMap', { zoomControl: true }).setView([26.85, 80.95], 12);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  clusterNodes.forEach((node, idx) => {
    const marker = L.circleMarker([node.lat, node.lng], {
      radius: 8,
      fillColor: node.color,
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(map).bindPopup(`<b>${node.name}</b><br>Status: ${node.status}`);
    
    marker.on('click', () => selectClusterNode(idx));
    markers.push(marker);
  });
}

function openGisModal() {
  if (gisModal) gisModal.show();
  setTimeout(() => {
    initMap();
    if (map) {
      map.invalidateSize();
      map.panTo([clusterNodes[selectedNodeIndex].lat, clusterNodes[selectedNodeIndex].lng]);
    }
  }, 300);
}

function selectClusterNode(index) {
  selectedNodeIndex = parseInt(index);
  const node = clusterNodes[selectedNodeIndex];
  
  const selectMenu = document.getElementById('nodeSelectMenu');
  if (selectMenu) selectMenu.value = selectedNodeIndex;

  const recordsSub = document.getElementById('txtRecordsSubtitle');
  if (recordsSub) recordsSub.innerText = `Telemetry ingested at 3-second intervals | Station: ${node.name}`;

  for (let i = 0; i < 4; i++) {
    const pill = document.getElementById(`pillNode${i}`);
    if (pill) {
      if (i === selectedNodeIndex) {
        pill.className = "btn btn-sm btn-primary text-nowrap py-1 px-3 rounded-pill shadow-xs";
      } else {
        pill.className = "btn btn-sm btn-outline-secondary text-nowrap py-1 px-3 rounded-pill shadow-xs";
      }
    }
  }

  const csvLink = document.getElementById('linkDownloadCsv');
  if (csvLink) csvLink.href = `/api/download-csv?node_id=${node.node_key}`;

  if (map) {
    map.panTo([node.lat, node.lng]);
    if (markers[selectedNodeIndex]) markers[selectedNodeIndex].openPopup();
  }

  fetchLiveTelemetry();
}

function openRecordsModal() { 
  if (recordsModal) recordsModal.show(); 
}

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  const label = document.getElementById('themeMenuLabel');
  if (label) {
    label.innerText = isDark ? (currentLanguage === 'HI' ? 'चालू' : 'On') : (currentLanguage === 'HI' ? 'बंद' : 'Off');
    label.className = isDark ? 'badge bg-success' : 'badge bg-secondary';
  }
}

function dispatchWhatsAppAlert() {
  if (!rawTelemetryHistory || rawTelemetryHistory.length === 0) {
    alert(currentLanguage === 'HI' ? "प्रसारित करने के लिए कोई लाइव डेटा उपलब्ध नहीं है।" : "No live telemetry to dispatch.");
    return;
  }
  const latest = rawTelemetryHistory[rawTelemetryHistory.length - 1];
  const wqi = latest.WQI !== undefined ? latest.WQI : 75;
  const node = clusterNodes[selectedNodeIndex].name;
  
  const msg = encodeURIComponent(
    `🚨 *JALDRISHTI WATER QUALITY ADVISORY*\n` +
    `📍 Tank Location: ${node}\n` +
    `📊 WQI Score: ${wqi}/100\n` +
    `🧪 Dissolved Fe: ${Number(latest.Iron_mgL || 0).toFixed(2)} mg/L (Limit: 0.30)\n` +
    `🌡️ pH: ${Number(latest.pH || 7.0).toFixed(2)} | Turbidity: ${Number(latest.Turbidity_NTU || 0).toFixed(1)} NTU\n` +
    `⚠️ Potability: ${latest.Status === 'Safe' ? 'Drinking Safe (पेयजल योग्य)' : 'CONTAMINATED - DO NOT DRINK (असुरक्षित जल)'}\n` +
    `ℹ️ Auto-Dispatched via JalDrishti Rural Edge Node.`
  );

  window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
}

// -------------------------------------------------------------
// 2. Localization Dictionary
// -------------------------------------------------------------
const i18n = {
  EN: {
    headerSub: "Rural Jal Nigam Tank Telemetry & Autonomous Remediation Node",
    schematicHeader: "Closed-Loop Hydraulic Remediation & Storage Stream",
    node1: "Borewell Intake",
    node2: "Greensand Bed",
    node2Sub: "Fe Stripping",
    node3: "Sensing Cell",
    node4: "UV-C Disinfection",
    pipeInlet: "Inlet Raw Groundwater",
    pipeMid: "Neutralization & Filtration",
    pipeOutlet: "Clean Tank Distribution",
    wqiTitle: "Water Quality Index",
    hpiTitle: "Heavy Metal Pollution Index",
    iron: "Dissolved Fe",
    ph: "pH Level",
    turb: "Turbidity",
    tds: "TDS Level",
    temp: "Temperature",
    active: "Active",
    limeCardTitle: "Water Neutralization (Lime Dosing)",
    limeUnit: "g/m³ intake",
    proxyTitle: "Surrogate Mineral & Heavy Metal Proxies (IS 10500)",
    proxyBadge: "ML Surrogate",
    proxyMnLabel: "Est. Manganese (Mn)",
    proxyMnLimit: "Limit: 0.10 mg/L",
    proxySo4Label: "Est. Sulfate (SO₄²⁻)",
    proxySo4Limit: "Limit: 200 mg/L",
    healthHeader: "Predictive Habitation Health Risk & Pathogen Warning",
    toxicRiskTitle: "Heavy Metal Exposure",
    pathogenRiskTitle: "Gastrointestinal Risk",
    trendHeader: "Water Quality Index (WQI) vs Time",
    trendSub: "Longitudinal quality trend derived via IS 10500 standards",
    traceHeader: "Live Parameter Traces vs Standards",
    donutHeader: "Water Usability Ratio",
    drinkable: "Drinkable / Household",
    agriculture: "Agriculture / Irrigation",
    unusable: "Unusable / Raw Discharge",
    optNode0: "Lucknow (Main Tank-1)",
    optNode1: "Lucknow (Main Tank-2)",
    optNode2: "Lucknow (Main Tank-3)",
    optNode3: "Lucknow (Main Tank-4)"
  },
  HI: {
    headerSub: "ग्रामीण जल निगम टंकी टेलीमेट्री एवं स्वचालित शुद्धिकरण एज नोड",
    schematicHeader: "स्वचालित जल शुद्धिकरण एवं टंकी वितरण प्रणाली",
    node1: "बोरवेल अंतर्वाह",
    node2: "ग्रीनसैंड बेड",
    node2Sub: "आयरन निष्कासन",
    node3: "सेंसर कक्ष",
    node4: "यूवी-सी शोधन",
    pipeInlet: "कच्चा भूजल अंतर्वाह",
    pipeMid: "उदासीनीकरण एवं निस्यंदन",
    pipeOutlet: "शुद्ध सुरक्षित टंकी जल निकासी",
    wqiTitle: "जल गुणवत्ता सूचकांक (WQI)",
    hpiTitle: "भारी धातु प्रदूषण सूचकांक (HPI)",
    iron: "घुलित लोहा (Fe)",
    ph: "पीएच स्तर (pH)",
    turb: "गंदलापन (Turbidity)",
    tds: "टीडीएस स्तर (TDS)",
    temp: "तापमान",
    active: "सक्रिय",
    limeCardTitle: "जल उदासीनीकरण (चूना खुराक)",
    limeUnit: "ग्राम/मी³ प्रवाह",
    proxyTitle: "सरोगेट खनिज एवं भारी धातु अनुमान (IS 10500)",
    proxyBadge: "एमएल मॉडल",
    proxyMnLabel: "अनुमानित मैंगनीज (Mn)",
    proxyMnLimit: "सीमा: 0.10 मिग्रा/ली",
    proxySo4Label: "अनुमानित सल्फेट (SO₄²⁻)",
    proxySo4Limit: "सीमा: 200 मिग्रा/ली",
    healthHeader: "संभावित ग्रामीण स्वास्थ्य जोखिम एवं महामारी चेतावनी",
    toxicRiskTitle: "भारी धातु जोखिम",
    pathogenRiskTitle: "उदर/संक्रमण रोग जोखिम",
    trendHeader: "जल गुणवत्ता सूचकांक (समय अनुसार)",
    trendSub: "IS 10500 मानकों पर आधारित प्रवृत्तियां",
    traceHeader: "लाइव मापदंड एवं मानक सीमा",
    donutHeader: "जल उपयोगिता अनुपात",
    drinkable: "पीने योग्य / घरेलू उपयोग",
    agriculture: "कृषि सिंचाई हेतु",
    unusable: "दूषित / अनुपयोगी",
    optNode0: "लखनऊ (मुख्य टंकी-1)",
    optNode1: "लखनऊ (मुख्य टंकी-2)",
    optNode2: "लखनऊ (मुख्य टंकी-3)",
    optNode3: "लखनऊ (मुख्य टंकी-4)"
  }
};

function setSafeText(elemId, textValue) {
  const el = document.getElementById(elemId);
  if (el) el.innerText = textValue;
}

function toggleLanguage() {
  currentLanguage = currentLanguage === 'EN' ? 'HI' : 'EN';
  const t = i18n[currentLanguage];

  const menuBadge = document.getElementById('langMenuBadge');
  const drawerBadge = document.getElementById('langMenuBadgeDrawer');
  if (menuBadge) menuBadge.innerText = currentLanguage === 'EN' ? 'Language' : 'भाषा';
  if (drawerBadge) drawerBadge.innerText = currentLanguage === 'EN' ? 'EN' : 'हिन्दी';

  setSafeText('txtHeaderSubtitle', t.headerSub);
  setSafeText('txtSchematicHeader', t.schematicHeader);
  setSafeText('txtNode1', t.node1);
  setSafeText('txtNode2', t.node2);
  setSafeText('txtNode2Sub', t.node2Sub);
  setSafeText('txtNode3', t.node3);
  setSafeText('txtNode4', t.node4);
  setSafeText('txtPipeInlet', t.pipeInlet);
  setSafeText('txtPipeMid', t.pipeMid);
  setSafeText('txtPipeOutlet', t.pipeOutlet);

  setSafeText('cardCompositeTitle', isHpiMode ? t.hpiTitle : t.wqiTitle);
  setSafeText('txtCardIron', t.iron);
  setSafeText('txtCardPh', t.ph);
  setSafeText('txtCardTurb', t.turb);
  setSafeText('txtCardTds', t.tds);
  setSafeText('txtCardTemp', t.temp);
  setSafeText('txtCardTempActive', t.active);

  setSafeText('txtLimeCardTitle', t.limeCardTitle);
  setSafeText('txtLimeUnit', t.limeUnit);
  setSafeText('txtProxyTitle', t.proxyTitle);
  setSafeText('txtProxyBadge', t.proxyBadge);
  setSafeText('txtProxyMnLabel', t.proxyMnLabel);
  setSafeText('txtProxyMnLimit', t.proxyMnLimit);
  setSafeText('txtProxySo4Label', t.proxySo4Label);
  setSafeText('txtProxySo4Limit', t.proxySo4Limit);

  setSafeText('txtHealthHeader', t.healthHeader);
  setSafeText('txtToxicRiskTitle', t.toxicRiskTitle);
  setSafeText('txtPathogenRiskTitle', t.pathogenRiskTitle);

  setSafeText('txtTrendHeader', t.trendHeader);
  setSafeText('txtTrendSubtitle', t.trendSub);
  setSafeText('txtTraceHeader', t.traceHeader);
  setSafeText('txtDonutHeader', t.donutHeader);

  setSafeText('optNode0', t.optNode0);
  setSafeText('optNode1', t.optNode1);
  setSafeText('optNode2', t.optNode2);
  setSafeText('optNode3', t.optNode3);

  if (statusPieChart) {
    statusPieChart.data.labels = [t.drinkable, t.agriculture, t.unusable];
    statusPieChart.update();
  }

  fetchLiveTelemetry();
}

function toggleHpiMode() {
  isHpiMode = !isHpiMode;
  const t = i18n[currentLanguage];
  const title = document.getElementById('cardCompositeTitle');
  const unit = document.getElementById('cardCompositeUnit');
  const benchmark = document.getElementById('cardCompositeBenchmark');
  const badge = document.getElementById('hpiToggleBadge');

  if (isHpiMode) {
    if (title) title.innerText = t.hpiTitle;
    if (unit) unit.innerText = " HPI";
    if (benchmark) benchmark.innerText = "≤ 100 Permissible";
    if (badge) badge.innerText = "WQI";
  } else {
    if (title) title.innerText = t.wqiTitle;
    if (unit) unit.innerText = "/100";
    if (benchmark) benchmark.innerText = "≥ 70 Safe";
    if (badge) badge.innerText = "HPI";
  }
  fetchLiveTelemetry();
}

function computeHpi(fe, tds) {
  const q_fe = (fe / 0.3) * 100;
  const q_tds = (tds / 500) * 100;
  return Math.round((q_fe * 0.7) + (q_tds * 0.3));
}

// -------------------------------------------------------------
// 3. Sparkline Factory
// -------------------------------------------------------------
function createSparkline(canvasId, strokeColor, fillColor) {
  const el = document.getElementById(canvasId);
  if (!el) return null;
  const ctx = el.getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array(15).fill(''),
      datasets: [{
        data: [20, 25, 22, 28, 30, 35, 40, 38, 42, 45, 48, 52, 50, 55, 60],
        borderColor: strokeColor,
        backgroundColor: fillColor,
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: { x: { display: false }, y: { display: false } },
      animation: { duration: 400 }
    }
  });
}

const sparkWqi = createSparkline('sparkWqi', '#0284c7', 'rgba(2, 132, 199, 0.18)');
const sparkIron = createSparkline('sparkIron', '#8b5cf6', 'rgba(139, 92, 246, 0.18)');
const sparkPh = createSparkline('sparkPh', '#10b981', 'rgba(16, 185, 129, 0.18)');
const sparkTurb = createSparkline('sparkTurb', '#f59e0b', 'rgba(245, 158, 11, 0.18)');
const sparkTds = createSparkline('sparkTds', '#ef4444', 'rgba(239, 68, 68, 0.18)');
const sparkTemp = createSparkline('sparkTemp', '#06b6d4', 'rgba(6, 182, 212, 0.18)');

// -------------------------------------------------------------
// 4. Analytics Charts
// -------------------------------------------------------------
let wqiTrendChart = null;
let lineComparisonChart = null;
let statusPieChart = null;

const elWqi = document.getElementById('wqiTrendChart');
if (elWqi) {
  wqiTrendChart = new Chart(elWqi.getContext('2d'), {
    type: 'line',
    data: {
      labels: ['10:00', '10:05', '10:10', '10:15', '10:20', '10:25'],
      datasets: [
        { label: 'WQI Score', data: [68, 70, 72, 75, 78, 82], borderColor: '#0284c7', backgroundColor: 'rgba(2, 132, 199, 0.12)', borderWidth: 2.5, fill: true, tension: 0.35, pointRadius: 2.5 },
        { label: 'Safety Threshold', data: [70, 70, 70, 70, 70, 70], borderColor: '#10b981', borderDash: [5, 5], borderWidth: 2, pointRadius: 0, fill: false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top', labels: { boxWidth: 12, padding: 8, font: { size: 10 } } } },
      scales: {
        y: { min: 0, max: 120, ticks: { stepSize: 20, font: { size: 9 } } },
        x: { ticks: { font: { size: 8 } } }
      }
    }
  });
}

const elLine = document.getElementById('lineComparisonChart');
if (elLine) {
  lineComparisonChart = new Chart(elLine.getContext('2d'), {
    type: 'line',
    data: {
      labels: ['10:00', '10:05', '10:10', '10:15', '10:20', '10:25'],
      datasets: [
        { label: 'TDS (PPM)', data: [450, 420, 390, 380, 350, 320], borderColor: '#ef4444', yAxisID: 'y', tension: 0.3, borderWidth: 2, fill: false, pointRadius: 2 },
        { label: 'TDS Target', data: [500, 500, 500, 500, 500, 500], borderColor: '#3b82f6', borderDash: [6, 4], pointRadius: 0, yAxisID: 'y', borderWidth: 1.5, fill: false },
        { label: 'Turbidity (NTU)', data: [12, 9, 6, 4, 3, 2], borderColor: '#f59e0b', yAxisID: 'y1', tension: 0.3, borderWidth: 2, fill: false, pointRadius: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: { type: 'linear', display: true, position: 'left', suggestedMin: 0, suggestedMax: 600 },
        y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, suggestedMin: 0, suggestedMax: 20 }
      }
    }
  });
}

const elPie = document.getElementById('statusPieChart');
if (elPie) {
  statusPieChart = new Chart(elPie.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: ['Drinkable (Household)', 'Agriculture Purpose', 'Unusable (Undrinkable)'],
      datasets: [{
        data: [15, 8, 3],
        backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
        offset: [0, 0, 0],
        hoverOffset: 10
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

// -------------------------------------------------------------
// 5. Dynamic Modals & PDF Compliance Export
// -------------------------------------------------------------
function openMetricModal(metricKey) {
  if (detailModal) detailModal.show();
}

function generateCompliancePDF() {
  if (!rawTelemetryHistory || rawTelemetryHistory.length === 0) {
    alert("Compiling current sample report...");
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.text("JalDrishti(H2O) | RURAL DRINKING WATER AUDIT CERTIFICATE", 14, 15);
  doc.text(`Tank Node: ${clusterNodes[selectedNodeIndex].name}`, 14, 25);
  doc.save(`JalDrishti_Audit_${clusterNodes[selectedNodeIndex].node_key}.pdf`);
}

function classifyWaterUsage(wqi, fe, ph, tds, turb) {
  const t = i18n[currentLanguage];
  if (wqi >= 70 && fe <= 0.3 && ph >= 6.5 && ph <= 8.5 && tds <= 500 && turb <= 5.0) {
    return { tier: 'Drinkable', label: t.drinkable, badge: 'bg-success' };
  } else if (wqi >= 45 && fe <= 5.0 && ph >= 5.5 && ph <= 8.5 && tds <= 1200) {
    return { tier: 'Agriculture', label: t.agriculture, badge: 'bg-warning text-dark' };
  } else {
    return { tier: 'Unusable', label: t.unusable, badge: 'bg-danger' };
  }
}

function computeFallbackWqi(item) {
  const fe = Number(item.iron || item.Iron_mgL || 0.2);
  const ph = Number(item.ph || item.pH || 7.2);
  const turb = Number(item.turbidity || item.Turbidity_NTU || 2.5);
  const tds = Number(item.tds || item.TDS_PPM || 320);

  const q_fe = fe <= 0.3 ? Math.max(0, 100 - (fe / 0.3) * 100) : Math.max(0, 50 - ((fe - 0.3) / 1.0) * 50);
  const q_ph = Math.max(0, 100 - (Math.abs(ph - 7.0) / 1.5) * 100);
  const q_turb = turb <= 5.0 ? Math.max(0, 100 - (turb / 5.0) * 100) : Math.max(0, 50 - ((turb - 5.0) / 15.0) * 50);
  const q_tds = tds <= 500 ? Math.max(0, 100 - (tds / 500.0) * 100) : Math.max(0, 50 - ((tds - 500) / 500.0) * 50);

  return Math.round((q_fe * 0.35) + (q_ph * 0.25) + (q_turb * 0.20) + (q_tds * 0.20));
}

function setWqiRange(days) {
  currentRangeDays = days;
  const buttons = document.querySelectorAll('[aria-label="WQI Time Range"] button');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('onclick').includes(days));
  });
}

// -------------------------------------------------------------
// 6. Node-Routed Telemetry Ingestion Loop
// -------------------------------------------------------------
async function fetchLiveTelemetry() {
  try {
    const activeNodeKey = clusterNodes[selectedNodeIndex].node_key;
    const isHindi = (currentLanguage === 'HI');
    
    const resLatest = await fetch(`/api/latest?node_id=${activeNodeKey}`);
    const latest = await resLatest.json();

    // Safe fallback values if endpoint returns empty
    const fe = parseFloat(latest.iron !== undefined ? latest.iron : 0.25);
    const ph = parseFloat(latest.ph !== undefined ? latest.ph : 7.2);
    const turb = parseFloat(latest.turbidity !== undefined ? latest.turbidity : 2.1);
    const tds = Math.round(latest.tds !== undefined ? latest.tds : 280);
    const temp = parseFloat(latest.temperature !== undefined ? latest.temperature : 26.5);

    const calculatedWqi = latest.wqi !== undefined ? latest.wqi : computeFallbackWqi({ iron: fe, ph: ph, turbidity: turb, tds: tds });
    const calculatedHpi = computeHpi(fe, tds);

    setSafeText('cardWqi', isHpiMode ? calculatedHpi : calculatedWqi);
    setSafeText('cardIron', fe.toFixed(2));
    setSafeText('cardPh', ph.toFixed(2));
    setSafeText('cardTurb', turb.toFixed(1));
    setSafeText('cardTds', tds);
    setSafeText('cardTemp', temp.toFixed(1));

    // Update Sparklines safely
    if (sparkWqi) {
      sparkWqi.data.datasets[0].data.shift();
      sparkWqi.data.datasets[0].data.push(isHpiMode ? calculatedHpi : calculatedWqi);
      sparkWqi.update();
    }
    if (sparkIron) {
      sparkIron.data.datasets[0].data.shift();
      sparkIron.data.datasets[0].data.push(fe * 100);
      sparkIron.update();
    }
    if (sparkPh) {
      sparkPh.data.datasets[0].data.shift();
      sparkPh.data.datasets[0].data.push(ph * 10);
      sparkPh.update();
    }
    if (sparkTurb) {
      sparkTurb.data.datasets[0].data.shift();
      sparkTurb.data.datasets[0].data.push(turb);
      sparkTurb.update();
    }
    if (sparkTds) {
      sparkTds.data.datasets[0].data.shift();
      sparkTds.data.datasets[0].data.push(tds);
      sparkTds.update();
    }
    if (sparkTemp) {
      sparkTemp.data.datasets[0].data.shift();
      sparkTemp.data.datasets[0].data.push(temp);
      sparkTemp.update();
    }

    // Lime Dispenser
    const limeVal = latest.lime_dosing_g_m3 !== undefined ? latest.lime_dosing_g_m3 : (ph < 6.5 ? 4.5 : 0.0);
    setSafeText('valLimeDosing', Number(limeVal).toFixed(1));

    const elLimeTxt = document.getElementById('txtLimeStatus');
    if (elLimeTxt) {
      elLimeTxt.innerText = limeVal > 0 
        ? (isHindi ? `जल अम्लीयता सुधार: खुराक ${Number(limeVal).toFixed(1)}g Ca(OH)₂ प्रति मी³` : `Buffer Feed: Dosing ${Number(limeVal).toFixed(1)}g Ca(OH)₂ per m³`)
        : (isHindi ? "तटस्थ बफर: किसी रासायनिक खुराक की आवश्यकता नहीं" : "Neutral buffer: Zero chemical dosing required");
    }

    // Heavy Metal Proxies
    const mn_val = (fe * 0.18).toFixed(2);
    const so4_val = Math.round((tds * 0.42) + Math.max(0, (6.5 - ph) * 28.5));
    setSafeText('valProxyMn', mn_val);
    setSafeText('valProxySo4', so4_val);

    const banner = document.getElementById('alertBanner');
    const statusText = document.getElementById('statusText');
    const modeBadge = document.getElementById('modeBadge');
    const classification = classifyWaterUsage(calculatedWqi, fe, ph, tds, turb);

    // Health Risk Meter
    const toxicPct = Math.min(100, Math.round((fe / 5.0) * 100));
    const pathogenPct = Math.min(100, Math.round((turb / 15.0) * 100));
    
    const barToxic = document.getElementById('riskBarToxic');
    const txtToxic = document.getElementById('riskTextToxic');
    if (barToxic && txtToxic) {
      barToxic.style.width = `${Math.max(10, toxicPct)}%`;
      barToxic.className = toxicPct > 50 ? "progress-bar bg-danger" : (toxicPct > 25 ? "progress-bar bg-warning" : "progress-bar bg-success");
      txtToxic.className = toxicPct > 50 ? "fw-bold text-danger" : (toxicPct > 25 ? "fw-bold text-warning" : "fw-bold text-success");
      txtToxic.innerText = toxicPct > 50 ? (isHindi ? "उच्च भारी धातु जोखिम" : "Elevated Metal Trace") : (isHindi ? "सुरक्षित (IS 10500 मानक)" : "Safe (IS 10500 Compliant)");
    }

    const barPathogen = document.getElementById('riskBarPathogen');
    const txtPathogen = document.getElementById('riskTextPathogen');
    if (barPathogen && txtPathogen) {
      barPathogen.style.width = `${Math.max(10, pathogenPct)}%`;
      barPathogen.className = pathogenPct > 40 ? "progress-bar bg-danger" : "progress-bar bg-success";
      txtPathogen.className = pathogenPct > 40 ? "fw-bold text-danger" : "fw-bold text-success";
      txtPathogen.innerText = pathogenPct > 40 ? (isHindi ? "उच्च गंदलापन" : "Turbidity Breakthrough") : (isHindi ? "यूवी-सी कीटाणुरहित (स्वच्छ)" : "UV-C Disinfected (Clean)");
    }

    // Animated Pipe Stream
    const fluidTube = document.getElementById('activeFlowFluid');
    const outletState = document.getElementById('flowOutletState');

    if (banner && outletState && fluidTube) {
      if (classification.tier === 'Drinkable') {
        banner.className = "alert alert-success d-flex justify-content-between align-items-center shadow-sm py-2 px-3 mb-3";
        outletState.className = "badge bg-success";
        outletState.innerText = isHindi ? "पीने योग्य" : "Potable";
        fluidTube.className = "pipe-fluid flow-cyan";
      } else if (classification.tier === 'Agriculture') {
        banner.className = "alert alert-warning d-flex justify-content-between align-items-center shadow-sm py-2 px-3 mb-3";
        outletState.className = "badge bg-warning text-dark";
        outletState.innerText = isHindi ? "सिंचाई योग्य" : "Irrigation";
        fluidTube.className = "pipe-fluid flow-amber";
      } else {
        banner.className = "alert alert-danger d-flex justify-content-between align-items-center shadow-sm py-2 px-3 mb-3";
        outletState.className = "badge bg-danger";
        outletState.innerText = isHindi ? "अनुपयोगी" : "Unusable";
        fluidTube.className = "pipe-fluid flow-red";
      }
    }
    
    if (statusText) {
      statusText.innerText = `${isHindi ? 'स्थिति' : 'Status'}: ${classification.label} (WQI: ${calculatedWqi})`;
    }
    if (modeBadge) {
      modeBadge.innerText = latest.mode || "Autonomous Control";
      modeBadge.className = "badge bg-success";
    }

  } catch (error) {
    console.error("Telemetry sync error:", error);
  }
}

// -------------------------------------------------------------
// 7. Voice Advisory
// -------------------------------------------------------------
function playPanchayatVoiceAdvisory() {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  const nodeName = clusterNodes[selectedNodeIndex].name;
  const wqiVal = Number(document.getElementById('cardWqi').innerText) || 75;
  const isSafe = wqiVal >= 70;
  
  let speechText = currentLanguage === 'HI'
    ? (isSafe ? `जलदृष्टि सूचना। ${nodeName} पर पानी का परीक्षण सफल रहा। जल सुरक्षित है।` : `चेतावनी! ${nodeName} पर पानी दूषित पाया गया है। कृपया यह पानी न पिएं।`)
    : (isSafe ? `JalDrishti Advisory. Water quality at ${nodeName} is certified safe and potable.` : `Warning! Water contamination detected at ${nodeName}. Do not consume this water.`);

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.lang = currentLanguage === 'HI' ? 'hi-IN' : 'en-US';
  utterance.rate = 0.95;
  window.speechSynthesis.speak(utterance);
}

function triggerMenuVoiceAdvisory() {
  playPanchayatVoiceAdvisory();
}

// Start auto-refresh cycle
setInterval(fetchLiveTelemetry, 3000);
fetchLiveTelemetry();