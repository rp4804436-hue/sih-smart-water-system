let rawTelemetryHistory = [];
let currentRangeDays = 7;
let currentLanguage = 'EN';
let isHpiMode = false;

let drinkableCount = 0;
let agricultureCount = 0;
let unusableCount = 0;

let modalChartInstance = null;
const detailModal = new bootstrap.Modal(document.getElementById('metricDetailModal'));
const diagnosticsModal = new bootstrap.Modal(document.getElementById('diagnosticsModal'));
const recordsModal = new bootstrap.Modal(document.getElementById('recordsModal'));
const gisModal = new bootstrap.Modal(document.getElementById('gisModal'));
const roiModal = new bootstrap.Modal(document.getElementById('roiModal'));

// -------------------------------------------------------------
// 1. GIS Multi-Node Registry with Routing Keys
// -------------------------------------------------------------
const clusterNodes = [
  { id: 0, node_key: "dhanbad_01", name: "Node-01: Dhanbad Washery", lat: 23.7957, lng: 86.4304, status: "High Solids / AMD", color: "#ef4444" },
  { id: 1, node_key: "bokaro_02",  name: "Node-02: Bokaro Pit Drain", lat: 23.6693, lng: 86.1511, status: "Moderate Acidity", color: "#f59e0b" },
  { id: 2, node_key: "ramgarh_03", name: "Node-03: Ramgarh Tailings Pond", lat: 23.6334, lng: 85.5147, status: "Severe Acidic Run-off", color: "#ef4444" },
  { id: 3, node_key: "ranchi_04",  name: "Node-04: Ranchi Rural Borewell", lat: 23.3441, lng: 85.3096, status: "IS 10500 Potable", color: "#10b981" }
];

let selectedNodeIndex = 0;
let map = null;
const markers = [];

function initMap() {
  if (map) return;
  map = L.map('gisMap', { zoomControl: true }).setView([23.65, 85.85], 8);
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
  gisModal.show();
  setTimeout(() => {
    initMap();
    map.invalidateSize();
    map.panTo([clusterNodes[selectedNodeIndex].lat, clusterNodes[selectedNodeIndex].lng]);
  }, 300);
}

function selectClusterNode(index) {
  selectedNodeIndex = parseInt(index);
  const node = clusterNodes[selectedNodeIndex];
  
  const selectMenu = document.getElementById('nodeSelectMenu');
  if (selectMenu) selectMenu.value = selectedNodeIndex;
  
  const activeLabel = document.getElementById('txtGisActiveNode');
  if (activeLabel) activeLabel.innerText = `Active: ${node.name}`;

  const recordsSub = document.getElementById('txtRecordsSubtitle');
  if (recordsSub) recordsSub.innerText = `Telemetry ingested at 3-second intervals | Station: ${node.name}`;

  for (let i = 0; i < 4; i++) {
    const pill = document.getElementById(`pillNode${i}`);
    if (pill) {
      if (i === selectedNodeIndex) {
        pill.className = "btn btn-sm btn-primary text-nowrap py-1 px-2.5 rounded-pill shadow-xs";
      } else {
        pill.className = "btn btn-sm btn-outline-secondary text-nowrap py-1 px-2.5 rounded-pill shadow-xs";
      }
    }
  }

  const csvLink = document.getElementById('linkDownloadCsv');
  if (csvLink) csvLink.href = `/api/download-csv?node_id=${node.node_key}`;

  if (map) {
    map.panTo([node.lat, node.lng]);
    if (markers[selectedNodeIndex]) markers[selectedNodeIndex].openPopup();
  }

  [sparkWqi, sparkIron, sparkPh, sparkTurb, sparkTds, sparkTemp].forEach(s => {
    s.data.labels = [];
    s.data.datasets[0].data = [];
    s.update();
  });

  fetchLiveTelemetry();
}

function openRecordsModal() { recordsModal.show(); }
function openDiagnosticsModal() { diagnosticsModal.show(); }

function toggleTheme() {
  document.body.classList.toggle('dark-mode');
  const isDark = document.body.classList.contains('dark-mode');
  const label = document.getElementById('themeMenuLabel');
  if (label) {
    label.innerText = isDark ? (currentLanguage === 'HI' ? 'चालू' : 'On') : (currentLanguage === 'HI' ? 'बंद' : 'Off');
    label.className = isDark ? 'badge bg-success' : 'badge bg-secondary';
  }

  const textColor = isDark ? '#cbd5e1' : '#64748b';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

  [wqiTrendChart, lineComparisonChart, statusPieChart].forEach(chart => {
    if (!chart) return;
    if (chart.options.plugins && chart.options.plugins.legend) {
      chart.options.plugins.legend.labels.color = textColor;
    }
    if (chart.options.scales) {
      Object.keys(chart.options.scales).forEach(scaleKey => {
        const scale = chart.options.scales[scaleKey];
        if (scale.ticks) scale.ticks.color = textColor;
        if (scale.grid) scale.grid.color = gridColor;
        if (scale.title) scale.title.color = textColor;
      });
    }
    chart.update();
  });
}

function dispatchWhatsAppAlert() {
  if (!rawTelemetryHistory || rawTelemetryHistory.length === 0) {
    alert(currentLanguage === 'HI' ? "प्रसारित करने के लिए कोई लाइव डेटा उपलब्ध नहीं है।" : "No live telemetry to dispatch.");
    return;
  }
  const latest = rawTelemetryHistory[rawTelemetryHistory.length - 1];
  const wqi = latest.WQI !== undefined ? latest.WQI : computeFallbackWqi(latest);
  const node = clusterNodes[selectedNodeIndex].name;
  
  const msg = encodeURIComponent(
    `🚨 *JALDRISHTI WATER CONTAMINATION ADVISORY*\n` +
    `📍 Location: ${node}\n` +
    `📊 WQI Score: ${wqi}/100\n` +
    `🧪 Dissolved Fe: ${Number(latest.Iron_mgL).toFixed(2)} mg/L (Limit: 0.30)\n` +
    `🌡️ pH: ${Number(latest.pH).toFixed(2)} | Turbidity: ${Number(latest.Turbidity_NTU).toFixed(1)} NTU\n` +
    `⚠️ Usability: ${latest.Status === 'Safe' ? 'Drinking Safe (पेयजल योग्य)' : 'CONTAMINATED - DO NOT DRINK (असुरक्षित जल)'}\n` +
    `ℹ️ Auto-Dispatched via Team Circuit X Edge Node (SIH 26040).`
  );

  window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
}

// -------------------------------------------------------------
// 2. Comprehensive Localization Dictionary
// -------------------------------------------------------------
const i18n = {
  EN: {
    headerSub: "SIH 26040 | Mining & Rural Telemetry Edge Node",
    schematicHeader: "Closed-Loop Hydraulic Remediation Stream",
    node1: "Mining Pit",
    node2: "Greensand",
    node2Sub: "Fe Stripping",
    node3: "Sensing",
    node4: "UV-C Polish",
    pipeInlet: "Inlet Acidic Run-Off",
    pipeMid: "Neutralization & Filtration",
    pipeOutlet: "Treated Clean Output",
    wqiTitle: "Water Quality Index",
    hpiTitle: "Heavy Metal Pollution Index",
    iron: "Dissolved Fe",
    ph: "pH Level",
    turb: "Turbidity",
    tds: "TDS Level",
    temp: "Temperature",
    active: "Active",
    limeCardTitle: "AMD Neutralization (Lime Dosing)",
    limeUnit: "g/m³ intake",
    proxyTitle: "Surrogate Metal Proxies (IS 10500)",
    proxyBadge: "ML Surrogate",
    proxyMnLabel: "Est. Manganese (Mn)",
    proxyMnLimit: "Limit: 0.10 mg/L",
    proxySo4Label: "Est. Sulfate (SO₄²⁻)",
    proxySo4Limit: "Limit: 200 mg/L",
    filterHeader: "Predictive Filter & Consumable Life",
    filterBed: "Greensand & Activated Carbon Bed",
    filterUv: "Inline UV-C Disinfection Lamp",
    healthHeader: "Predictive Health Risk & Pathogen Warning",
    toxicRiskTitle: "Heavy Metal Toxicosis",
    pathogenRiskTitle: "Gastrointestinal Outbreak",
    roiHeader: "Unit Economics & Community ROI",
    costPerLitre: "Purification Cost",
    tankerBenchmark: "Tanker Supply",
    netSavings: "Net Savings",
    trendHeader: "Water Quality Index (WQI) vs Time",
    trendSub: "Longitudinal trend derived via IS 10500 weighted sub-indices",
    traceHeader: "Live Parameter Traces vs Thresholds",
    donutHeader: "Water Usability Ratio",
    drinkable: "Drinkable / Household",
    agriculture: "Agriculture Purpose",
    unusable: "Unusable / Undrinkable",
    menuClusterTitle: "Active Cluster Node",
    menuOpsHeader: "Operations & Preferences",
    menuLangTitle: "Language (भाषा)",
    menuVoiceTitle: "Panchayat IVRS Voice",
    menuVoiceSub: "Broadcast audio water advisory",
    menuVoiceBadge: "Broadcast",
    menuRoiTitle: "Unit Economics & ROI",
    menuRoiSub: "Treatment vs tanker cost metrics",
    menuRecords: "Operational Records Log",
    menuViewTable: "View Table",
    menuDarkMode: "Dark Mode",
    menuPdf: "Export Audit PDF",
    menuCsv: "Download Raw CSV",
    menuCsvBadge: "Records",
    menuGis: "GIS Mining Cluster Grid",
    menuGisBadge: "Map",
    menuDiag: "Sensor Diagnostics",
    menuDiagBadge: "Hardware",
    menuWa: "Alert Panchayat (WhatsApp)",
    menuWaBadge: "Broadcast",
    modalIngestedLabel: "Live Ingested Value",
    modalStandardLabel: "Standard Threshold",
    modalWaveform: "High-Resolution Temporal Waveform",
    modalCloseBtn: "Close",
    optNode0: "Node-01: Dhanbad Washery",
    optNode1: "Node-02: Bokaro Pit Drain",
    optNode2: "Node-03: Ramgarh Tailings Pond",
    optNode3: "Node-04: Ranchi Rural Borewell"
  },
  HI: {
    headerSub: "एसआईएच 26040 | खनन एवं ग्रामीण जल टेलीमेट्री एज नोड",
    schematicHeader: "स्वचालित जल शुद्धिकरण एवं प्रवाह प्रणाली",
    node1: "खनन गड्ढा",
    node2: "ग्रीनसैंड",
    node2Sub: "आयरन निष्कासन",
    node3: "सेंसर कक्ष",
    node4: "यूवी-सी शोधन",
    pipeInlet: "अम्लीय अपशिष्ट जल प्रवेश",
    pipeMid: "उदासीनीकरण एवं निस्यंदन",
    pipeOutlet: "शुद्ध सुरक्षित जल निकासी",
    wqiTitle: "जल गुणवत्ता सूचकांक (WQI)",
    hpiTitle: "भारी धातु प्रदूषण सूचकांक (HPI)",
    iron: "घुलित लोहा (Fe)",
    ph: "पीएच स्तर (pH)",
    turb: "गंदलापन (Turbidity)",
    tds: "टीडीएस स्तर (TDS)",
    temp: "तापमान",
    active: "सक्रिय",
    limeCardTitle: "अम्लीय जल उदासीनीकरण (चूना खुराक)",
    limeUnit: "ग्राम/मी³ प्रवाह",
    proxyTitle: "सरोगेट भारी धातु अनुमान (IS 10500)",
    proxyBadge: "एमएल मॉडल",
    proxyMnLabel: "अनुमानित मैंगनीज (Mn)",
    proxyMnLimit: "सीमा: 0.10 मिग्रा/ली",
    proxySo4Label: "अनुमानित सल्फेट (SO₄²⁻)",
    proxySo4Limit: "सीमा: 200 मिग्रा/ली",
    filterHeader: "फ़िल्टर आयु एवं पूर्वानुमान",
    filterBed: "ग्रीनसैंड व चारकोल बेड",
    filterUv: "यूवी-सी कीटाणुशोधन लैंप",
    healthHeader: "संभावित स्वास्थ्य जोखिम एवं महामारी चेतावनी",
    toxicRiskTitle: "भारी धातु विषाक्तता जोखिम",
    pathogenRiskTitle: "उदर/संक्रमण रोग जोखिम",
    roiHeader: "इकाई लागत एवं समुदाय बचत (ROI)",
    costPerLitre: "शुद्धिकरण लागत",
    tankerBenchmark: "टैंकर जल मानक",
    netSavings: "कुल शुद्ध बचत",
    trendHeader: "जल गुणवत्ता सूचकांक (समय अनुसार)",
    trendSub: "IS 10500 मानकों पर आधारित प्रवृत्तियां",
    traceHeader: "लाइव मापदंड एवं सीमा तुलना",
    donutHeader: "जल उपयोगिता अनुपात",
    drinkable: "पीने योग्य / घरेलू उपयोग",
    agriculture: "कृषि सिंचाई हेतु",
    unusable: "दूषित / अनुपयोगी",
    menuClusterTitle: "सक्रिय क्लस्टर नोड",
    menuOpsHeader: "संचालन एवं प्राथमिकताएं",
    menuLangTitle: "भाषा (Language)",
    menuVoiceTitle: "पंचायत IVRS ध्वनि संदेश",
    menuVoiceSub: "ऑडियो जल गुणवत्ता परामर्श प्रसारित करें",
    menuVoiceBadge: "प्रसारित करें",
    menuRoiTitle: "इकाई लागत एवं समुदाय बचत (ROI)",
    menuRoiSub: "शुद्धिकरण बनाम टैंकर आपूर्ति लागत",
    menuRecords: "परिचालन रिकॉर्ड लॉग",
    menuViewTable: "तालिका देखें",
    menuDarkMode: "डार्क मोड",
    menuPdf: "ऑडिट PDF डाउनलोड",
    menuCsv: "रॉ CSV डाउनलोड करें",
    menuCsvBadge: "रिकॉर्ड्स",
    menuGis: "GIS खनन क्लस्टर ग्रिड",
    menuGisBadge: "मानचित्र",
    menuDiag: "सेंसर निदान एवं स्थिति",
    menuDiagBadge: "हार्डवेयर",
    menuWa: "पंचायत को सूचित करें (WhatsApp)",
    menuWaBadge: "अलर्ट भेजें",
    modalIngestedLabel: "लाइव मापा गया मान",
    modalStandardLabel: "मानक सुरक्षा सीमा",
    modalWaveform: "उच्च-रिज़ॉल्यूशन समय तरंग (Waveform)",
    modalCloseBtn: "बंद करें",
    optNode0: "नोड-01: धनबाद वाशरी",
    optNode1: "नोड-02: बोकारो पिट ड्रेन",
    optNode2: "नोड-03: रामगढ़ टेलिंग्स पौंड",
    optNode3: "नोड-04: रांची ग्रामीण बोरवेल"
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
  if (menuBadge) {
    menuBadge.innerText = currentLanguage === 'EN' ? 'English' : 'हिन्दी';
    menuBadge.className = currentLanguage === 'EN' ? 'badge bg-primary' : 'badge bg-warning text-dark';
  }

  // Header & Pipe Flow
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

  // Cards
  setSafeText('cardCompositeTitle', isHpiMode ? t.hpiTitle : t.wqiTitle);
  setSafeText('txtCardIron', t.iron);
  setSafeText('txtCardPh', t.ph);
  setSafeText('txtCardTurb', t.turb);
  setSafeText('txtCardTds', t.tds);
  setSafeText('txtCardTemp', t.temp);
  setSafeText('txtCardTempActive', t.active);

  // Smart Feature Cards
  setSafeText('txtLimeCardTitle', t.limeCardTitle);
  setSafeText('txtLimeUnit', t.limeUnit);
  setSafeText('txtProxyTitle', t.proxyTitle);
  setSafeText('txtProxyBadge', t.proxyBadge);
  setSafeText('txtProxyMnLabel', t.proxyMnLabel);
  setSafeText('txtProxyMnLimit', t.proxyMnLimit);
  setSafeText('txtProxySo4Label', t.proxySo4Label);
  setSafeText('txtProxySo4Limit', t.proxySo4Limit);

  // ROI, Filter & Risk Modules
  setSafeText('txtRoiHeader', t.roiHeader);
  setSafeText('txtCostPerLitre', t.costPerLitre);
  setSafeText('txtTankerBenchmark', t.tankerBenchmark);
  setSafeText('txtNetSavings', t.netSavings);
  setSafeText('txtFilterHeader', t.filterHeader);
  setSafeText('txtFilterBed', t.filterBed);
  setSafeText('txtFilterUv', t.filterUv);
  setSafeText('txtHealthHeader', t.healthHeader);
  setSafeText('txtToxicRiskTitle', t.toxicRiskTitle);
  setSafeText('txtPathogenRiskTitle', t.pathogenRiskTitle);

  // Analytics Titles
  setSafeText('txtTrendHeader', t.trendHeader);
  setSafeText('txtTrendSubtitle', t.trendSub);
  setSafeText('txtTraceHeader', t.traceHeader);
  setSafeText('txtDonutHeader', t.donutHeader);

  // Offcanvas Menu Drawer Elements
  setSafeText('txtMenuClusterTitle', t.menuClusterTitle);
  setSafeText('txtMenuOpsHeader', t.menuOpsHeader);
  setSafeText('txtMenuLangTitle', t.menuLangTitle);
  setSafeText('txtMenuVoiceTitle', t.menuVoiceTitle);
  setSafeText('txtMenuVoiceSub', t.menuVoiceSub);
  setSafeText('menuVoiceBadge', t.menuVoiceBadge);
  setSafeText('txtMenuRoiTitle', t.menuRoiTitle);
  setSafeText('txtMenuRoiSub', t.menuRoiSub);
  setSafeText('txtMenuRecords', t.menuRecords);
  setSafeText('txtMenuViewTable', t.menuViewTable);
  setSafeText('txtMenuDarkMode', t.menuDarkMode);
  setSafeText('txtMenuPdf', t.menuPdf);
  setSafeText('txtMenuCsv', t.menuCsv);
  setSafeText('txtMenuCsvBadge', t.menuCsvBadge);
  setSafeText('txtMenuGis', t.menuGis);
  setSafeText('txtMenuGisBadge', t.menuGisBadge);
  setSafeText('txtMenuDiag', t.menuDiag);
  setSafeText('txtMenuDiagBadge', t.menuDiagBadge);
  setSafeText('txtMenuWa', t.menuWa);
  setSafeText('txtMenuWaBadge', t.menuWaBadge);

  // Dropdown Options
  setSafeText('optNode0', t.optNode0);
  setSafeText('optNode1', t.optNode1);
  setSafeText('optNode2', t.optNode2);
  setSafeText('optNode3', t.optNode3);

  // Modal Text
  setSafeText('txtModalIngestedLabel', t.modalIngestedLabel);
  setSafeText('txtModalStandardLabel', t.modalStandardLabel);
  setSafeText('txtModalWaveform', t.modalWaveform);
  setSafeText('txtModalCloseBtn', t.modalCloseBtn);

  // Chart Labels
  statusPieChart.data.labels = [t.drinkable, t.agriculture, t.unusable];
  statusPieChart.update();

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
    if (badge) badge.innerText = currentLanguage === 'HI' ? "WQI पर स्विच करें" : "Switch to WQI";
  } else {
    if (title) title.innerText = t.wqiTitle;
    if (unit) unit.innerText = "/100";
    if (benchmark) benchmark.innerText = "≥ 70 Safe";
    if (badge) badge.innerText = currentLanguage === 'HI' ? "HPI पर स्विच करें" : "Switch to HPI";
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
  const ctx = document.getElementById(canvasId).getContext('2d');
  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: Array(15).fill(''),
      datasets: [{
        data: [],
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
const ctxWqi = document.getElementById('wqiTrendChart').getContext('2d');
const wqiTrendChart = new Chart(ctxWqi, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      {
        label: 'Water Metric Score',
        data: [],
        borderColor: '#0284c7',
        backgroundColor: 'rgba(2, 132, 199, 0.12)',
        borderWidth: 2.5,
        fill: true,
        tension: 0.35,
        pointRadius: 2.5,
        pointBackgroundColor: '#0284c7'
      },
      {
        label: 'Safety Threshold',
        data: [],
        borderColor: '#10b981',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        fill: false
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'top', labels: { boxWidth: 12, padding: 8, font: { size: 10 } } } },
    scales: {
      y: { min: 0, max: 120, title: { display: true, text: 'Index Value', font: { size: 10 } }, ticks: { stepSize: 20, font: { size: 9 } } },
      x: { ticks: { maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 6, font: { size: 8 } } }
    }
  }
});

const ctxLine = document.getElementById('lineComparisonChart').getContext('2d');
const lineComparisonChart = new Chart(ctxLine, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'TDS (PPM)', data: [], borderColor: '#ef4444', yAxisID: 'y', tension: 0.3, borderWidth: 2, fill: false, pointRadius: 2 },
      { label: 'TDS Target', data: [], borderColor: '#3b82f6', borderDash: [6, 4], pointRadius: 0, yAxisID: 'y', borderWidth: 1.5, fill: false },
      { label: 'Turbidity (NTU)', data: [], borderColor: '#f59e0b', yAxisID: 'y1', tension: 0.3, borderWidth: 2, fill: false, pointRadius: 2 },
      { label: 'Turb Target', data: [], borderColor: '#10b981', borderDash: [6, 4], pointRadius: 0, yAxisID: 'y1', borderWidth: 1.5, fill: false },
      { label: 'Fe (x100)', data: [], borderColor: '#8b5cf6', yAxisID: 'y', tension: 0.3, borderWidth: 2, fill: false, pointRadius: 2 }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: { legend: { position: 'top', labels: { boxWidth: 10, padding: 6, font: { size: 9 } } } },
    scales: {
      y: { type: 'linear', display: true, position: 'left', ticks: { font: { size: 9 } }, suggestedMin: 0, suggestedMax: 600 },
      y1: { type: 'linear', display: true, position: 'right', grid: { drawOnChartArea: false }, ticks: { font: { size: 9 } }, suggestedMin: 0, suggestedMax: 25 },
      x: { ticks: { maxRotation: 45, minRotation: 45, autoSkip: true, maxTicksLimit: 6, font: { size: 8 } } }
    }
  }
});

let selectedPieSlice = null;
const ctxPie = document.getElementById('statusPieChart').getContext('2d');
const statusPieChart = new Chart(ctxPie, {
  type: 'doughnut',
  data: {
    labels: ['Drinkable (Household)', 'Agriculture Purpose', 'Unusable (Undrinkable)'],
    datasets: [{
      data: [0, 0, 0],
      backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
      hoverBackgroundColor: ['#059669', '#d97706', '#dc2626'],
      offset: [0, 0, 0],
      hoverOffset: 12
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: { animateRotate: true, animateScale: true, duration: 600 },
    plugins: {
      legend: {
        position: 'bottom',
        labels: { boxWidth: 12, padding: 8, font: { size: 10 } },
        onClick: (e, legendItem) => { handleSliceZoom(legendItem.index); }
      }
    },
    onClick: (event, elements) => {
      if (elements && elements.length > 0) handleSliceZoom(elements[0].index);
    }
  }
});

function handleSliceZoom(sliceIndex) {
  const dataset = statusPieChart.data.datasets[0];
  const total = dataset.data.reduce((a, b) => a + b, 0);

  if (selectedPieSlice === sliceIndex) {
    dataset.offset = [0, 0, 0];
    selectedPieSlice = null;
    const banner = document.getElementById('pieFocusBanner');
    if (banner) banner.classList.add('d-none');
  } else {
    selectedPieSlice = sliceIndex;
    dataset.offset = [0, 0, 0];
    dataset.offset[sliceIndex] = 20;

    const label = statusPieChart.data.labels[sliceIndex];
    const val = dataset.data[sliceIndex];
    const pct = total > 0 ? ((val / total) * 100).toFixed(1) : 0;

    const banner = document.getElementById('pieFocusBanner');
    const bannerText = document.getElementById('pieFocusText');

    let color = '#10b981';
    if (sliceIndex === 1) color = '#f59e0b';
    if (sliceIndex === 2) color = '#ef4444';

    if (banner && bannerText) {
      banner.className = `alert alert-light border text-center py-1 px-2 mb-2 shadow-sm`;
      banner.style.borderLeft = `5px solid ${color}`;
      bannerText.innerHTML = `<span style="color: ${color}; font-weight: bold;">${label}</span>: <strong>${val} ${currentLanguage === 'HI' ? 'लॉग' : 'logs'}</strong> (${pct}% ${currentLanguage === 'HI' ? 'कुल प्रवाह का' : 'of total run'})`;
      banner.classList.remove('d-none');
    }
  }
  statusPieChart.update();
}

// -------------------------------------------------------------
// 5. Dynamic Modals & PDF Compliance Export
// -------------------------------------------------------------
function openMetricModal(metricKey) {
  if (!rawTelemetryHistory || rawTelemetryHistory.length === 0) return;

  const isHindi = (currentLanguage === 'HI');
  const latest = rawTelemetryHistory[rawTelemetryHistory.length - 1];
  const labels = rawTelemetryHistory.slice(-20).map(item => item.Timestamp ? (item.Timestamp.includes(' ') ? item.Timestamp.split(' ')[1] : item.Timestamp) : '');
  
  let title = "", subtitle = "", valueStr = "", standardStr = "", isCompliant = true, chartData = [], thresholdLine = null, lineColor = "#0284c7", fillColor = "rgba(2, 132, 199, 0.15)";

  const feVal = Number(latest.Iron_mgL || 0);
  const phVal = Number(latest.pH || 7.0);
  const turbVal = Number(latest.Turbidity_NTU || 0);
  const tdsVal = Number(latest.TDS_PPM || 0);
  const tempVal = Number(latest.Temperature_C || 25);
  const wqiVal = latest.WQI !== undefined ? Number(latest.WQI) : computeFallbackWqi(latest);
  const hpiVal = computeHpi(feVal, tdsVal);

  if (metricKey === 'composite') {
    if (isHpiMode) {
      title = isHindi ? "भारी धातु प्रदूषण सूचकांक (HPI)" : "Heavy Metal Pollution Index (HPI)";
      subtitle = isHindi ? "एसिड माइन ड्रेनेज रन-ऑफ से विषाक्त भारी धातु भार का मूल्यांकन" : "Evaluates toxic heavy metal load from acid mine drainage run-off";
      valueStr = `${hpiVal} HPI`;
      standardStr = isHindi ? "HPI ≤ 100 (सुरक्षित सीमा)" : "HPI <= 100 (Safe Ceiling)";
      isCompliant = hpiVal <= 100;
      lineColor = "#ef4444"; fillColor = "rgba(239, 68, 68, 0.2)";
      chartData = rawTelemetryHistory.slice(-20).map(i => computeHpi(Number(i.Iron_mgL || 0), Number(i.TDS_PPM || 0)));
      thresholdLine = 100;
    } else {
      title = isHindi ? "जल गुणवत्ता सूचकांक (IS 10500 Composite)" : "Water Quality Index (IS 10500 Composite)";
      subtitle = isHindi ? "Fe, pH, गंदलापन और TDS उप-सूचकांकों पर आधारित पेयता संकेतक" : "Potability indicator based on Fe, pH, Turbidity, and TDS sub-indices";
      valueStr = `${wqiVal} / 100`;
      standardStr = isHindi ? "≥ 70 (पीने योग्य सुरक्षित)" : ">= 70 (Drinking Safe)";
      isCompliant = wqiVal >= 70;
      lineColor = "#0284c7"; fillColor = "rgba(2, 132, 199, 0.2)";
      chartData = rawTelemetryHistory.slice(-20).map(i => i.WQI !== undefined ? Number(i.WQI) : computeFallbackWqi(i));
      thresholdLine = 70;
    }
  } else if (metricKey === 'iron') {
    title = isHindi ? "घुलित लोहा (Fe²⁺ / Fe³⁺)" : "Dissolved Iron (Fe²⁺ / Fe³⁺)";
    subtitle = isHindi ? "TCS34725 ऑप्टिकल सेंसर द्वारा मापा गया अवशोषण" : "Absorbance measured via TCS34725 optical sensor";
    valueStr = `${feVal.toFixed(2)} mg/L`;
    standardStr = isHindi ? "≤ 0.30 mg/L (अनुमेय मानक)" : "<= 0.30 mg/L (Permissible Cutoff)";
    isCompliant = feVal <= 0.30;
    lineColor = "#8b5cf6"; fillColor = "rgba(139, 92, 246, 0.2)";
    chartData = rawTelemetryHistory.slice(-20).map(i => Number(i.Iron_mgL || 0));
    thresholdLine = 0.30;
  } else if (metricKey === 'ph') {
    title = isHindi ? "अम्लीयता / क्षारीयता (pH)" : "Acidity / Basicity (pH)";
    subtitle = isHindi ? "एनालॉग ग्लास प्रोब द्वारा मापी गई हाइड्रोजन-आयन गतिविधि" : "Hydrogen-ion activity acquired via analog glass probe";
    valueStr = `${phVal.toFixed(2)}`;
    standardStr = isHindi ? "6.5 - 8.5 (तटस्थ सीमा)" : "6.5 - 8.5 (Neutral Range)";
    isCompliant = phVal >= 6.5 && phVal <= 8.5;
    lineColor = "#10b981"; fillColor = "rgba(16, 185, 129, 0.2)";
    chartData = rawTelemetryHistory.slice(-20).map(i => Number(i.pH || 7.0));
    thresholdLine = 7.0;
  } else if (metricKey === 'turb') {
    title = isHindi ? "गंदलापन (Turbidity NTU)" : "Turbidity (Colloidal Suspensions)";
    subtitle = isHindi ? "नेफ्लोमेट्रिक टर्बिडिटी यूनिट्स (NTU) में मापा गया प्रकाश प्रकीर्णन" : "Scattering measured in Nephelometric Turbidity Units (NTU)";
    valueStr = `${turbVal.toFixed(1)} NTU`;
    standardStr = isHindi ? "≤ 5.0 NTU (स्पष्टता मानक)" : "<= 5.0 NTU (Clarity Standard)";
    isCompliant = turbVal <= 5.0;
    lineColor = "#f59e0b"; fillColor = "rgba(245, 158, 11, 0.2)";
    chartData = rawTelemetryHistory.slice(-20).map(i => Number(i.Turbidity_NTU || 0));
    thresholdLine = 5.0;
  } else if (metricKey === 'tds') {
    title = isHindi ? "कुल घुलित ठोस (TDS PPM)" : "Total Dissolved Solids (TDS)";
    subtitle = isHindi ? "पार्ट्स पर मिलियन में मापी गई खनिज चालकता" : "Conductivity of dissolved minerals in parts per million";
    valueStr = `${Math.round(tdsVal)} PPM`;
    standardStr = isHindi ? "≤ 500 PPM (वांछनीय सीमा)" : "<= 500 PPM (Desirable Drinking Cutoff)";
    isCompliant = tdsVal <= 500;
    lineColor = "#ef4444"; fillColor = "rgba(239, 68, 68, 0.2)";
    chartData = rawTelemetryHistory.slice(-20).map(i => Number(i.TDS_PPM || 0));
    thresholdLine = 300;
  } else if (metricKey === 'temp') {
    title = isHindi ? "जल तापमान (°C)" : "Water Temperature";
    subtitle = isHindi ? "DS18B20 1-वायर डिजिटल प्रोब द्वारा मापा गया" : "Acquired via DS18B20 digital 1-Wire probe";
    valueStr = `${tempVal.toFixed(1)} °C`;
    standardStr = isHindi ? "परिवेश तापमान" : "Ambient Temperature";
    isCompliant = true;
    lineColor = "#06b6d4"; fillColor = "rgba(6, 182, 212, 0.2)";
    chartData = rawTelemetryHistory.slice(-20).map(i => Number(i.Temperature_C || 25));
    thresholdLine = 25.0;
  }

  setSafeText('modalTitle', title);
  setSafeText('modalSubtitle', subtitle);
  setSafeText('modalValue', valueStr);
  setSafeText('modalStandard', standardStr);
  
  const badge = document.getElementById('modalStatusBadge');
  if (badge) {
    badge.className = isCompliant ? "badge bg-success mt-1" : "badge bg-danger mt-1";
    badge.innerText = isCompliant 
      ? (isHindi ? "मानकों के अनुरूप (Compliant)" : "Compliant with Standards") 
      : (isHindi ? "मानक सीमा से अधिक (Unsafe)" : "Exceeds Permissible Limit");
  }

  setSafeText('txtModalIngestedLabel', isHindi ? "लाइव मापा गया मान" : "Live Ingested Value");
  setSafeText('txtModalStandardLabel', isHindi ? "मानक सुरक्षा सीमा" : "Standard Threshold");
  setSafeText('txtModalWaveform', isHindi ? "उच्च-रिज़ॉल्यूशन समय तरंग (Waveform)" : "High-Resolution Temporal Waveform");
  setSafeText('txtModalCloseBtn', isHindi ? "बंद करें" : "Close");

  if (modalChartInstance) modalChartInstance.destroy();

  const ctxModal = document.getElementById('modalDetailedChart').getContext('2d');
  modalChartInstance = new Chart(ctxModal, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        { 
          label: isHindi ? 'लाइव टेलीमेट्री' : 'Live Telemetry', 
          data: chartData, 
          borderColor: lineColor, 
          backgroundColor: fillColor, 
          borderWidth: 3, 
          fill: true, 
          tension: 0.35, 
          pointRadius: 4, 
          pointBackgroundColor: lineColor 
        },
        { 
          label: isHindi ? 'मानक आधार रेखा' : 'Standard Baseline', 
          data: Array(chartData.length).fill(thresholdLine), 
          borderColor: '#475569', 
          borderDash: [6, 4], 
          borderWidth: 2, 
          pointRadius: 0, 
          fill: false 
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 800, easing: 'easeOutQuart' },
      scales: { x: { ticks: { maxRotation: 45, minRotation: 45, maxTicksLimit: 8 } } }
    }
  });

  detailModal.show();
}

function generateCompliancePDF() {
  if (!rawTelemetryHistory || rawTelemetryHistory.length === 0) {
    alert(currentLanguage === 'HI' ? "रिपोर्ट तैयार करने के लिए कोई टेलीमेट्री रिकॉर्ड उपलब्ध नहीं है।" : "No telemetry records available to compile report.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFillColor(2, 132, 199);
  doc.rect(0, 0, 210, 24, 'F');

  doc.setFontSize(15);
  doc.setTextColor(255, 255, 255);
  doc.text("JalDrishti(H2O) | WATER QUALITY AUDIT CERTIFICATE", 14, 15);

  doc.setFontSize(9);
  doc.setTextColor(51, 65, 85);
  doc.text("Regulatory Verification Standard: CPCB & IS 10500:2012 Drinking Water Specification", 14, 32);
  doc.text(`Node: ${clusterNodes[selectedNodeIndex].name} | Generated: ${new Date().toLocaleString()}`, 14, 37);

  const totalLogs = rawTelemetryHistory.length;
  const avgWqi = (rawTelemetryHistory.reduce((acc, row) => acc + (Number(row.WQI) || computeFallbackWqi(row)), 0) / totalLogs).toFixed(1);
  const maxFe = Math.max(...rawTelemetryHistory.map(r => Number(r.Iron_mgL || 0))).toFixed(2);
  const minPh = Math.min(...rawTelemetryHistory.map(r => Number(r.pH || 7))).toFixed(2);

  doc.setFillColor(241, 245, 249);
  doc.rect(14, 43, 182, 22, 'F');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(`Longitudinal Mean WQI: ${avgWqi}/100`, 20, 52);
  doc.text(`Peak Dissolved Iron: ${maxFe} mg/L (Limit: 0.30)`, 20, 60);
  doc.text(`Minimum pH Acquired: ${minPh}`, 110, 52);
  doc.text(`Audited Sample Count: ${totalLogs} Readings`, 110, 60);

  const tableRows = rawTelemetryHistory.slice(-25).map(r => [
    r.Timestamp,
    r.WQI || computeFallbackWqi(r),
    Number(r.Iron_mgL).toFixed(2),
    Number(r.pH).toFixed(2),
    Number(r.Turbidity_NTU).toFixed(1),
    Math.round(r.TDS_PPM),
    r.Status
  ]);

  doc.autoTable({
    startY: 72,
    head: [['Timestamp', 'WQI', 'Fe (mg/L)', 'pH', 'Turb (NTU)', 'TDS', 'Status']],
    body: tableRows,
    theme: 'striped',
    headStyles: { fillColor: [2, 132, 199] },
    styles: { fontSize: 8 }
  });

  const finalY = doc.lastAutoTable.finalY + 14;
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text("Approved by: Automated Telemetry Ingestion Engine | Team Circuit X | Smart India Hackathon (SIH 26040)", 14, finalY);

  doc.save(`JalDrishti_Audit_${clusterNodes[selectedNodeIndex].node_key}_${Date.now()}.pdf`);
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
  const fe = Number(item.Iron_mgL || 0);
  const ph = Number(item.pH || 7);
  const turb = Number(item.Turbidity_NTU || 0);
  const tds = Number(item.TDS_PPM || 0);

  const q_fe = fe <= 0.3 ? Math.max(0, 100 - (fe / 0.3) * 100) : Math.max(0, 50 - ((fe - 0.3) / 1.0) * 50);
  const q_ph = Math.max(0, 100 - (abs(ph - 7.0) / 1.5) * 100);
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
  updateWqiChart();
}

function updateWqiChart() {
  if (!rawTelemetryHistory || rawTelemetryHistory.length === 0) return;

  const now = new Date();
  const cutoff = new Date();
  cutoff.setDate(now.getDate() - currentRangeDays);

  const filtered = rawTelemetryHistory.filter(item => {
    if (!item.Timestamp) return true;
    const itemDate = new Date(item.Timestamp);
    return isNaN(itemDate.getTime()) ? true : itemDate >= cutoff;
  });

  const labels = [];
  const compositeValues = [];
  const thresholds = [];

  filtered.forEach((item, index) => {
    const timeLabel = item.Timestamp ? (item.Timestamp.includes(' ') ? item.Timestamp.split(' ')[1] : item.Timestamp) : `#${index + 1}`;
    labels.push(timeLabel);

    if (isHpiMode) {
      compositeValues.push(computeHpi(Number(item.Iron_mgL || 0), Number(item.TDS_PPM || 0)));
      thresholds.push(100);
    } else {
      const wqi = (item.WQI !== undefined && !isNaN(Number(item.WQI))) ? Number(item.WQI) : computeFallbackWqi(item);
      compositeValues.push(wqi);
      thresholds.push(70);
    }
  });

  wqiTrendChart.data.labels = labels;
  wqiTrendChart.data.datasets[0].data = compositeValues;
  wqiTrendChart.data.datasets[0].label = isHpiMode 
    ? (currentLanguage === 'HI' ? "HPI सूचकांक" : "HPI Index") 
    : (currentLanguage === 'HI' ? "WQI स्कोर" : "WQI Score");
  wqiTrendChart.data.datasets[1].data = thresholds;
  wqiTrendChart.data.datasets[1].label = isHpiMode 
    ? (currentLanguage === 'HI' ? "HPI अधिकतम सीमा (100)" : "HPI Ceiling (100)") 
    : (currentLanguage === 'HI' ? "WQI सुरक्षित आधार रेखा (70)" : "WQI Baseline (70)");
  wqiTrendChart.update();
}

// -------------------------------------------------------------
// 6. Node-Routed Telemetry Ingestion Loop
// -------------------------------------------------------------
async function fetchLiveTelemetry() {
  try {
    const activeNodeKey = clusterNodes[selectedNodeIndex].node_key;
    const isHindi = (currentLanguage === 'HI');
    
    // Request node-specific latest reading
    const resLatest = await fetch(`/api/latest?node_id=${activeNodeKey}`);
    const latest = await resLatest.json();

    if (latest && !latest.empty) {
      const fe = parseFloat(latest.iron || 0.0);
      const ph = parseFloat(latest.ph);
      const turb = parseFloat(latest.turbidity);
      const tds = Math.round(latest.tds);
      const temp = parseFloat(latest.temperature);

      const calculatedWqi = latest.wqi !== undefined ? latest.wqi : computeFallbackWqi({
        Iron_mgL: fe, pH: ph, Turbidity_NTU: turb, TDS_PPM: tds
      });
      const calculatedHpi = computeHpi(fe, tds);

      setSafeText('cardWqi', isHpiMode ? calculatedHpi : calculatedWqi);
      setSafeText('cardIron', fe.toFixed(2));
      setSafeText('cardPh', ph.toFixed(2));
      setSafeText('cardTurb', turb.toFixed(1));
      setSafeText('cardTds', tds);
      setSafeText('cardTemp', temp.toFixed(1));

      applyPeripheryThresholds({ wqi: calculatedWqi, iron: fe, ph: ph, turbidity: turb, tds: tds, temperature: temp });

      // Feature 1: Stoichiometric Lime Dispenser
      const limeVal = latest.lime_dosing_g_m3 !== undefined ? latest.lime_dosing_g_m3 : 0.0;
      setSafeText('valLimeDosing', Number(limeVal).toFixed(1));

      const elLimeTxt = document.getElementById('txtLimeStatus');
      if (elLimeTxt) {
        if (limeVal > 0) {
          elLimeTxt.innerText = isHindi 
            ? `अम्लीय अपवाह प्रवाह: खुराक ${Number(limeVal).toFixed(1)}g Ca(OH)₂ प्रति मी³`
            : `Acidic AMD surge: Dosing ${Number(limeVal).toFixed(1)}g Ca(OH)₂ per m³`;
        } else {
          elLimeTxt.innerText = isHindi 
            ? "तटस्थ बफर: किसी चूने की आवश्यकता नहीं"
            : "Neutral buffer: Zero lime required";
        }
      }

      // Feature 5: Multi-Heavy Metal Proxy Model (Mn & SO4)
      if (latest.proxies) {
        const elMn = document.getElementById('valProxyMn');
        const elSo4 = document.getElementById('valProxySo4');
        if (elMn) {
          elMn.innerText = Number(latest.proxies.manganese_mgL).toFixed(2);
          elMn.style.color = latest.proxies.manganese_safe ? '#10b981' : '#ef4444';
        }
        if (elSo4) {
          elSo4.innerText = Math.round(latest.proxies.sulfate_mgL);
          elSo4.style.color = latest.proxies.sulfate_safe ? '#10b981' : '#ef4444';
        }
      }

      // Feature 3: Sensor Health & Anti-Fouling Diagnostics
      if (latest.diagnostics && latest.diagnostics.alerts && latest.diagnostics.alerts.length > 0) {
        console.warn("JalDrishti Sensor Diagnostics Alert:", latest.diagnostics.alerts.join(" | "));
      }

      const banner = document.getElementById('alertBanner');
      const statusText = document.getElementById('statusText');
      const modeBadge = document.getElementById('modeBadge');

      const classification = classifyWaterUsage(calculatedWqi, fe, ph, tds, turb);

      // Epidemiological Health Risk Meter
      const toxicPct = Math.min(100, Math.round((fe / 5.0) * 100));
      const pathogenPct = Math.min(100, Math.round((turb / 15.0) * 100));
      
      const barToxic = document.getElementById('riskBarToxic');
      const txtToxic = document.getElementById('riskTextToxic');
      if (barToxic && txtToxic) {
        barToxic.style.width = `${toxicPct}%`;
        if (toxicPct > 60) {
          barToxic.className = "progress-bar bg-danger";
          txtToxic.className = "fw-bold text-danger";
          txtToxic.innerText = isHindi ? "गंभीर भारी धातु खतरा" : "Severe Heavy Metal Threat";
        } else if (toxicPct > 30) {
          barToxic.className = "progress-bar bg-warning";
          txtToxic.className = "fw-bold text-warning";
          txtToxic.innerText = isHindi ? "मध्यम अंतर्ग्रहण जोखिम" : "Moderate Ingestion Risk";
        } else {
          barToxic.className = "progress-bar bg-success";
          txtToxic.className = "fw-bold text-success";
          txtToxic.innerText = isHindi ? "सुरक्षित (IS 10500 मानक)" : "Safe (IS 10500 Compliant)";
        }
      }

      const barPathogen = document.getElementById('riskBarPathogen');
      const txtPathogen = document.getElementById('riskTextPathogen');
      if (barPathogen && txtPathogen) {
        barPathogen.style.width = `${pathogenPct}%`;
        if (pathogenPct > 50) {
          barPathogen.className = "progress-bar bg-danger";
          txtPathogen.className = "fw-bold text-danger";
          txtPathogen.innerText = isHindi ? "उच्च रोगजनक गंदलापन" : "High Pathogen Turbidity";
        } else {
          barPathogen.className = "progress-bar bg-success";
          txtPathogen.className = "fw-bold text-success";
          txtPathogen.innerText = isHindi ? "यूवी-सी कीटाणुरहित (स्वच्छ)" : "UV-C Disinfected (Clean)";
        }
      }

      const overallHealth = document.getElementById('healthOverallBadge');
      if (overallHealth) {
        if (toxicPct > 50 || pathogenPct > 50) {
          overallHealth.className = "badge bg-danger";
          overallHealth.innerText = isHindi ? "सामुदायिक जोखिम चेतावनी" : "Community Risk Alert";
        } else {
          overallHealth.className = "badge bg-success";
          overallHealth.innerText = isHindi ? "कम जनसंख्या जोखिम" : "Low Population Risk";
        }
      }

      // Hydraulic Fluid Line Flow
      const fluidTube = document.getElementById('activeFlowFluid');
      const outletState = document.getElementById('flowOutletState');

      if (banner && outletState && fluidTube) {
        if (classification.tier === 'Drinkable') {
          banner.className = "alert alert-success d-flex justify-content-between align-items-center shadow-sm py-2 px-3 mb-3";
          outletState.className = "badge bg-success mt-1";
          outletState.innerText = isHindi ? "पीने योग्य" : "Potable";
          fluidTube.className = "pipe-fluid flow-cyan";
        } else if (classification.tier === 'Agriculture') {
          banner.className = "alert alert-warning d-flex justify-content-between align-items-center shadow-sm py-2 px-3 mb-3";
          outletState.className = "badge bg-warning text-dark mt-1";
          outletState.innerText = isHindi ? "सिंचाई योग्य" : "Irrigation";
          fluidTube.className = "pipe-fluid flow-amber";
        } else {
          banner.className = "alert alert-danger d-flex justify-content-between align-items-center shadow-sm py-2 px-3 mb-3";
          outletState.className = "badge bg-danger mt-1";
          outletState.innerText = isHindi ? "अनुपयोगी" : "Unusable";
          fluidTube.className = "pipe-fluid flow-red";
        }
      }
      
      if (statusText) {
        statusText.innerText = `${isHindi ? 'स्थिति' : 'Status'}: ${classification.label} (WQI: ${calculatedWqi})`;
      }
      if (modeBadge) {
        modeBadge.innerText = latest.mode;
      }
    }

    // Request node-specific history
    const resHistory = await fetch(`/api/history?node_id=${activeNodeKey}`);
    const history = await resHistory.json();
    rawTelemetryHistory = history;

    if (history.length > 0) {
      const labels = [];
      const tdsCurrent = [], tdsTarget = [];
      const turbCurrent = [], turbTarget = [];
      const ironCurrent = [];

      const sparkWqiData = [], sparkFeData = [], sparkPhData = [];
      const sparkTurbData = [], sparkTdsData = [], sparkTempData = [];

      drinkableCount = 0; agricultureCount = 0; unusableCount = 0;
      let tableRows = '';

      history.forEach((item, index) => {
        const timeOnly = item.Timestamp ? (item.Timestamp.includes(' ') ? item.Timestamp.split(' ')[1] : item.Timestamp) : `#${index + 1}`;
        labels.push(timeOnly);
        tdsCurrent.push(Number(item.TDS_PPM));
        tdsTarget.push(300);
        turbCurrent.push(Number(item.Turbidity_NTU));
        turbTarget.push(5.0);
        ironCurrent.push(Number(item.Iron_mgL) * 100);

        const rowWqi = (item.WQI !== undefined && !isNaN(Number(item.WQI))) ? Number(item.WQI) : computeFallbackWqi(item);
        const feVal = Number(item.Iron_mgL || 0);
        const phVal = Number(item.pH || 7);
        const tdsVal = Number(item.TDS_PPM || 0);
        const turbVal = Number(item.Turbidity_NTU || 0);
        const tempVal = Number(item.Temperature_C || 25);

        sparkWqiData.push(rowWqi);
        sparkFeData.push(feVal);
        sparkPhData.push(phVal);
        sparkTurbData.push(turbVal);
        sparkTdsData.push(tdsVal);
        sparkTempData.push(tempVal);

        const classification = classifyWaterUsage(rowWqi, feVal, phVal, tdsVal, turbVal);

        if (classification.tier === 'Drinkable') drinkableCount++;
        else if (classification.tier === 'Agriculture') agricultureCount++;
        else unusableCount++;

        tableRows = `<tr>
          <td class="fw-semibold">${item.Timestamp}</td>
          <td><span class="badge ${classification.badge}">${rowWqi}/100</span></td>
          <td>${feVal.toFixed(2)}</td>
          <td>${phVal.toFixed(2)}</td>
          <td>${turbVal.toFixed(1)}</td>
          <td>${Math.round(tdsVal)}</td>
          <td>${tempVal.toFixed(1)}</td>
          <td><span class="badge ${classification.badge}">${classification.label}</span></td>
          <td><span class="badge ${item.Mode === 'Heavy Purification' ? 'bg-warning text-dark' : 'bg-secondary'}">${item.Mode}</span></td>
        </tr>` + tableRows;
      });

      const tableBody = document.getElementById('dataTableBody');
      if (tableBody) tableBody.innerHTML = tableRows;

      // Update Sparklines
      const sliceCount = -15;
      sparkWqi.data.labels = sparkWqiData.slice(sliceCount).map(() => '');
      sparkWqi.data.datasets[0].data = isHpiMode 
        ? sparkFeData.slice(sliceCount).map((fe, i) => computeHpi(fe, sparkTdsData.slice(sliceCount)[i]))
        : sparkWqiData.slice(sliceCount);
      sparkWqi.update();

      sparkIron.data.labels = sparkFeData.slice(sliceCount).map(() => '');
      sparkIron.data.datasets[0].data = sparkFeData.slice(sliceCount);
      sparkIron.update();

      sparkPh.data.labels = sparkPhData.slice(sliceCount).map(() => '');
      sparkPh.data.datasets[0].data = sparkPhData.slice(sliceCount);
      sparkPh.update();

      sparkTurb.data.labels = sparkTurbData.slice(sliceCount).map(() => '');
      sparkTurb.data.datasets[0].data = sparkTurbData.slice(sliceCount);
      sparkTurb.update();

      sparkTds.data.labels = sparkTdsData.slice(sliceCount).map(() => '');
      sparkTds.data.datasets[0].data = sparkTdsData.slice(sliceCount);
      sparkTds.update();

      sparkTemp.data.labels = sparkTempData.slice(sliceCount).map(() => '');
      sparkTemp.data.datasets[0].data = sparkTempData.slice(sliceCount);
      sparkTemp.update();

      // Update Line Comparison Chart
      lineComparisonChart.data.labels = labels.slice(-25);
      lineComparisonChart.data.datasets[0].data = tdsCurrent.slice(-25);
      lineComparisonChart.data.datasets[1].data = tdsTarget.slice(-25);
      lineComparisonChart.data.datasets[2].data = turbCurrent.slice(-25);
      lineComparisonChart.data.datasets[3].data = turbTarget.slice(-25);
      lineComparisonChart.data.datasets[4].data = ironCurrent.slice(-25);
      lineComparisonChart.update();

      // Update Usability Donut Chart
      statusPieChart.data.datasets[0].data = [drinkableCount, agricultureCount, unusableCount];
      statusPieChart.update();

      updateWqiChart();
    }
  } catch (error) {
    console.error("Telemetry sync error:", error);
  }
}

function applyPeripheryThresholds(data) {
  const getContainer = (elemId) => {
    const el = document.getElementById(elemId);
    return el ? (el.closest('.stat-card') || el.closest('.card') || el.parentElement) : null;
  };

  const cardWqi = getContainer('cardWqi');
  const cardFe = getContainer('cardIron');
  const cardPh = getContainer('cardPh');
  const cardTurb = getContainer('cardTurb');
  const cardTds = getContainer('cardTds');
  const cardTemp = getContainer('cardTemp');

  if (cardWqi) {
    if (data.wqi < 70) {
      cardWqi.classList.add('danger-periphery');
      cardWqi.classList.remove('safe-periphery');
    } else {
      cardWqi.classList.remove('danger-periphery');
      cardWqi.classList.add('safe-periphery');
    }
  }

  if (cardFe) {
    if (data.iron > 0.30) {
      cardFe.classList.add('danger-periphery');
      cardFe.classList.remove('safe-periphery');
    } else {
      cardFe.classList.remove('danger-periphery');
      cardFe.classList.add('safe-periphery');
    }
  }

  if (cardPh) {
    if (data.ph < 6.5 || data.ph > 8.5) {
      cardPh.classList.add('danger-periphery');
      cardPh.classList.remove('safe-periphery');
    } else {
      cardPh.classList.remove('danger-periphery');
      cardPh.classList.add('safe-periphery');
    }
  }

  if (cardTurb) {
    if (data.turbidity > 5.0) {
      cardTurb.classList.add('danger-periphery');
      cardTurb.classList.remove('safe-periphery');
    } else {
      cardTurb.classList.remove('danger-periphery');
      cardTurb.classList.add('safe-periphery');
    }
  }

  if (cardTds) {
    if (data.tds > 500) {
      cardTds.classList.add('danger-periphery');
      cardTds.classList.remove('safe-periphery');
    } else {
      cardTds.classList.remove('danger-periphery');
      cardTds.classList.add('safe-periphery');
    }
  }

  if (cardTemp) {
    if (data.temperature > 35.0) {
      cardTemp.classList.add('danger-periphery');
      cardTemp.classList.remove('safe-periphery');
    } else {
      cardTemp.classList.remove('danger-periphery');
      cardTemp.classList.add('safe-periphery');
    }
  }
}

// -------------------------------------------------------------
// 7. Interactive Panchayat Voice / IVRS Broadcast
// -------------------------------------------------------------
function playPanchayatVoiceAdvisory() {
  if (!('speechSynthesis' in window)) {
    alert(currentLanguage === 'HI' 
      ? "यह ब्राउज़र वेब वाक् संश्लेषण (Web Speech API) का समर्थन नहीं करता है।" 
      : "Web Speech synthesis is not supported in this browser.");
    return;
  }

  window.speechSynthesis.cancel();

  const nodeName = clusterNodes[selectedNodeIndex].name;
  const isSafe = Number(document.getElementById('cardWqi').innerText) >= 70;
  const fe = document.getElementById('cardIron').innerText;
  
  let speechText = "";

  if (currentLanguage === 'HI') {
    if (isSafe) {
      speechText = `जलदृष्टि सूचना। ${nodeName} पर पानी का परीक्षण सफल रहा। जल पीने योग्य और सुरक्षित है।`;
    } else {
      speechText = `चेतावनी! जलदृष्टि आपातकालीन सूचना। ${nodeName} पर पानी दूषित पाया गया है। घुलित आयरन की मात्रा ${fe} मिलीग्राम प्रति लीटर है। कृपया यह पानी न पिएं।`;
    }
  } else {
    if (isSafe) {
      speechText = `JalDrishti Advisory. Water quality at ${nodeName} is certified safe and potable according to IS 10500 standards.`;
    } else {
      speechText = `Warning! JalDrishti Emergency Advisory. Water contamination detected at ${nodeName}. Dissolved iron level is ${fe} milligrams per liter. Do not consume this water.`;
    }
  }

  const utterance = new SpeechSynthesisUtterance(speechText);
  utterance.lang = currentLanguage === 'HI' ? 'hi-IN' : 'en-US';
  utterance.rate = 0.95;
  utterance.pitch = 1.0;

  window.speechSynthesis.speak(utterance);
}

// -------------------------------------------------------------
// 8. Drawer Menu Triggers: ROI Modal & Voice Advisory
// -------------------------------------------------------------
function openRoiModal() {
  const drawerEl = document.getElementById('appMenuOffcanvas');
  if (drawerEl) {
    const bsOffcanvas = bootstrap.Offcanvas.getInstance(drawerEl);
    if (bsOffcanvas) bsOffcanvas.hide();
  }
  roiModal.show();
}

function triggerMenuVoiceAdvisory() {
  const badge = document.getElementById('menuVoiceBadge');
  if (badge) {
    badge.innerText = currentLanguage === 'HI' ? "प्रसारित हो रहा है..." : "Broadcasting...";
    badge.className = "badge bg-warning text-dark";
    setTimeout(() => {
      badge.innerText = currentLanguage === 'HI' ? "प्रसारित करें" : "Broadcast";
      badge.className = "badge bg-danger";
    }, 3500);
  }
  playPanchayatVoiceAdvisory();
}

// Start polling
setInterval(fetchLiveTelemetry, 3000);
fetchLiveTelemetry();