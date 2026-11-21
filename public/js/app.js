/**
 * TvMaster v1.0.0 - Client Application
 * Advanced Process Slicing, Sorting, APK Sideload & TV Management
 */

let ws = null;
let isConnected = false;
let currentProcesses = [];
let userInstalledPackages = new Set();
let disabledPackages = new Set();
let lastIp = localStorage.getItem('tvmaster_last_ip') || '';

// Slicing & Sorting State
let sortColumn = 'memMb';
let sortDirection = 'desc'; // 'asc' or 'desc'
let activeFilter = 'all'; // 'all', 'apps', 'system', 'hogs'
let selectedApkFile = null;

// DOM Elements
const connPill = document.getElementById('conn-pill');
const connDot = document.getElementById('conn-dot');
const connText = document.getElementById('conn-text');
const btnConnect = document.getElementById('btn-connect');
const inputIp = document.getElementById('input-ip');
const inputPort = document.getElementById('input-port');

const devModel = document.getElementById('dev-model');
const devIp = document.getElementById('dev-ip');
const devOs = document.getElementById('dev-os');
const devRes = document.getElementById('dev-res');

const ramBadge = document.getElementById('ram-badge');
const ramPercent = document.getElementById('ram-percent');
const ramStatus = document.getElementById('ram-status');
const barRamActive = document.getElementById('bar-ram-active');
const barRamCached = document.getElementById('bar-ram-cached');
const ramActiveVal = document.getElementById('ram-active-val');
const ramCachedVal = document.getElementById('ram-cached-val');
const ramFreeVal = document.getElementById('ram-free-val');

const cpuBadge = document.getElementById('cpu-badge');
const cpuPercent = document.getElementById('cpu-percent');
const cpuLoadavg = document.getElementById('cpu-loadavg');
const barCpu = document.getElementById('bar-cpu');

const storageBadge = document.getElementById('storage-badge');
const storagePercent = document.getElementById('storage-percent');
const storageFree = document.getElementById('storage-free');
const barStorage = document.getElementById('bar-storage');
const storageUsedVal = document.getElementById('storage-used-val');
const storageTotalVal = document.getElementById('storage-total-val');

const processTableBody = document.getElementById('process-table-body');
const processSearch = document.getElementById('process-search');
const processCountBadge = document.getElementById('process-count-badge');
const selectSortField = document.getElementById('select-sort-field');
const selectPageLimit = document.getElementById('select-page-limit');

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  if (lastIp) {
    inputIp.value = lastIp;
  }
  setupDragAndDrop();
  checkServerStatus();
  initWebSocket();
});

// --- Server Status & Initial Check ---
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      setConnectedState(true, data.deviceIp, data.deviceInfo);
      fetchPackagesList();
    } else {
      setConnectedState(false);
    }
  } catch (err) {
    setConnectedState(false);
  }
}

// Fetch installed packages from TV to distinguish 3rd-party apps
async function fetchPackagesList() {
  try {
    const res = await fetch('/api/packages');
    const data = await res.json();
    if (data.userPackages) {
      userInstalledPackages = new Set(data.userPackages);
    }
    if (data.disabledPackages) {
      disabledPackages = new Set(data.disabledPackages);
    }
  } catch (e) {}
}

// --- WebSocket Telemetry Hub ---
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[TvMaster WS] Connected to backend telemetry stream');
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'telemetry' && msg.data) {
        updateTelemetryUI(msg.data);
      }
    } catch (e) {}
  };

  ws.onclose = () => {
    setTimeout(initWebSocket, 3000);
  };
}

// Update UI with real-time telemetry data
function updateTelemetryUI(data) {
  if (!data) return;

  // Device Info
  if (data.device) {
    devModel.textContent = data.device.model || 'Android TV';
    devOs.textContent = `${data.device.androidVersion} (API ${data.device.apiLevel})`;
    devRes.textContent = data.device.screenResolution || '1920x1080';
  }

  // RAM
  if (data.memory) {
    const mem = data.memory;
    ramBadge.textContent = `${mem.usedMb} / ${mem.totalMb} MB`;
    ramPercent.textContent = `${mem.usedPercent}%`;

    const activeMb = Math.max(0, mem.usedMb - mem.cachedMb);
    const activePercent = mem.totalMb > 0 ? (activeMb / mem.totalMb) * 100 : 0;
    const cachedPercent = mem.totalMb > 0 ? (mem.cachedMb / mem.totalMb) * 100 : 0;

    barRamActive.style.width = `${activePercent}%`;
    barRamCached.style.width = `${cachedPercent}%`;

    ramActiveVal.textContent = `${activeMb} MB`;
    ramCachedVal.textContent = `${mem.cachedMb} MB`;
    ramFreeVal.textContent = `${mem.availableMb} MB`;

    if (mem.usedPercent > 85) {
      ramStatus.textContent = 'Critical Pressure';
      ramStatus.className = 'text-xs text-red-400 font-bold';
    } else if (mem.usedPercent > 70) {
      ramStatus.textContent = 'High Load';
      ramStatus.className = 'text-xs text-amber-400';
    } else {
      ramStatus.textContent = 'Optimal';
      ramStatus.className = 'text-xs text-emerald-400';
    }
  }

  // CPU
  if (data.cpu) {
    const cpu = data.cpu;
    cpuPercent.textContent = `${cpu.percent}%`;
    barCpu.style.width = `${cpu.percent}%`;

    if (cpu.percent > 75) {
      barCpu.className = 'bg-red-500 h-full rounded-full transition-all duration-300';
      cpuBadge.textContent = 'Heavy Load';
      cpuBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-red-500/20 text-red-400';
    } else if (cpu.percent > 40) {
      barCpu.className = 'bg-amber-500 h-full rounded-full transition-all duration-300';
      cpuBadge.textContent = 'Moderate';
      cpuBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-amber-500/20 text-amber-400';
    } else {
      barCpu.className = 'bg-emerald-500 h-full rounded-full transition-all duration-300';
      cpuBadge.textContent = 'Normal';
      cpuBadge.className = 'text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400';
    }

    cpuLoadavg.textContent = `Load: ${cpu.load1}, ${cpu.load5}, ${cpu.load15}`;
  }

  // Storage
  if (data.storage) {
    const st = data.storage;
    storageBadge.textContent = `${st.usedGb} / ${st.totalGb} GB`;
    storagePercent.textContent = `${st.usedPercent}%`;
    storageFree.textContent = `${st.freeGb} GB Free`;
    barStorage.style.width = `${st.usedPercent}%`;
    storageUsedVal.textContent = `${st.usedGb} GB`;
    storageTotalVal.textContent = `${st.totalGb} GB`;
  }

  // Processes
  if (data.processes) {
    currentProcesses = data.processes.map((proc) => {
      const isUserApp = userInstalledPackages.has(proc.package) || (proc.isPackage && !proc.package.startsWith('com.android.') && !proc.package.startsWith('com.google.android.inputmethod'));
      return {
        ...proc,
        isUserApp
      };
    });
    applyFiltersAndSort();
  }
}

// --- Multi-Column Sorting & Slicing/Dicing Engine ---

function setFilterType(type) {
  activeFilter = type;
  const chips = ['all', 'apps', 'system', 'hogs'];
  chips.forEach((c) => {
    const el = document.getElementById(`chip-${c}`);
    if (el) {
      if (c === type) {
        el.className = 'px-3 py-1 rounded-lg bg-blue-600 text-white font-semibold transition';
      } else {
        el.className = 'px-3 py-1 rounded-lg text-slate-400 hover:text-white transition';
      }
    }
  });
  applyFiltersAndSort();
}

function toggleSort(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = column === 'appName' || column === 'name' || column === 'package' ? 'asc' : 'desc';
  }
  updateSortIndicators();
  applyFiltersAndSort();
}

function onSortDropdownChange(val) {
  const parts = val.split('-');
  sortColumn = parts[0];
  sortDirection = parts[1] || 'desc';
  updateSortIndicators();
  applyFiltersAndSort();
}

function updateSortIndicators() {
  const columns = ['appName', 'package', 'pid', 'cpu', 'memMb'];
  columns.forEach((col) => {
    const th = document.getElementById(`th-${col}`);
    if (th) {
      const icon = th.querySelector('.sort-icon');
      if (col === sortColumn) {
        th.className = 'py-3 px-4 sortable sort-active';
        if (icon) icon.textContent = sortDirection === 'asc' ? '▲' : '▼';
      } else {
        th.className = 'py-3 px-4 sortable text-slate-400';
        if (icon) icon.textContent = '↕';
      }
    }
  });

  if (selectSortField) {
    selectSortField.value = `${sortColumn}-${sortDirection}`;
  }
}

function applyFiltersAndSort() {
  const query = (processSearch.value || '').toLowerCase().trim();
  const limit = parseInt(selectPageLimit.value, 10) || 50;

  // 1. Filter
  let filtered = currentProcesses.filter((proc) => {
    const appLabel = proc.appName || proc.name || '';
    const pkgId = proc.package || '';
    const matchesQuery =
      appLabel.toLowerCase().includes(query) ||
      pkgId.toLowerCase().includes(query) ||
      String(proc.pid).includes(query);
    if (!matchesQuery) return false;

    if (activeFilter === 'apps') return proc.isUserApp || proc.isPackage;
    if (activeFilter === 'system') return proc.isSystem;
    if (activeFilter === 'hogs') return proc.cpu > 5 || proc.memMb > 150;
    return true;
  });

  // 2. Sort
  filtered.sort((a, b) => {
    let valA = a[sortColumn];
    let valB = b[sortColumn];

    // Fallback for appName
    if (sortColumn === 'appName') {
      valA = a.appName || a.name || '';
      valB = b.appName || b.name || '';
    }

    if (typeof valA === 'string') {
      const comp = valA.localeCompare(valB, undefined, { sensitivity: 'base' });
      return sortDirection === 'asc' ? comp : -comp;
    }

    valA = valA || 0;
    valB = valB || 0;
    return sortDirection === 'asc' ? valA - valB : valB - valA;
  });

  // Update counter
  processCountBadge.textContent = `${filtered.length} active`;

  // 3. Slice
  const sliced = filtered.slice(0, limit);
  renderProcessTable(sliced);
}

function renderProcessTable(processes) {
  if (!processes || processes.length === 0) {
    processTableBody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-slate-500 font-sans">
          No matching running processes found with current filters.
        </td>
      </tr>
    `;
    return;
  }

  processTableBody.innerHTML = processes
    .map((proc) => {
      const isHog = proc.cpu > 10 || proc.memMb > 250;
      const cpuClass = proc.cpu > 15 ? 'text-red-400 font-black' : proc.cpu > 5 ? 'text-amber-400 font-bold' : 'text-slate-300';
      const isUser = userInstalledPackages.has(proc.package) || proc.isUserApp;
      const displayName = proc.appName || proc.name || proc.package;

      const typeBadge = isUser
        ? '<span class="px-2 py-0.5 rounded-full badge-user text-[10px] font-bold">User App</span>'
        : proc.isPackage
        ? '<span class="px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 text-[10px]">App</span>'
        : '<span class="px-2 py-0.5 rounded-full badge-sys text-[10px]">System</span>';

      return `
      <tr class="hover:bg-slate-800/40 transition group">
        <td class="py-2.5 px-4 font-sans font-medium text-white flex items-center gap-2">
          <span class="w-6 h-6 rounded bg-slate-800 text-slate-300 flex items-center justify-center font-bold text-xs uppercase">${displayName.slice(0, 2)}</span>
          <span class="truncate max-w-[140px] md:max-w-xs font-semibold text-slate-100" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>
          ${isHog ? '<span title="Resource Hog" class="text-amber-400 text-xs">🔥</span>' : ''}
        </td>
        <td class="py-2.5 px-4 text-slate-400 text-xs font-mono truncate max-w-[150px] md:max-w-sm" title="${escapeHtml(proc.package)}">
          ${escapeHtml(proc.package)}
        </td>
        <td class="py-2.5 px-4 text-slate-400">${proc.pid}</td>
        <td class="py-2.5 px-4 ${cpuClass}">${proc.cpu}%</td>
        <td class="py-2.5 px-4 font-bold text-white">${proc.memMb} MB</td>
        <td class="py-2.5 px-4">${typeBadge}</td>
        <td class="py-2.5 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5">
            ${proc.isPackage ? `
              <button onclick="launchApp('${escapeHtml(proc.package)}')" title="Open App on TV" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-xs transition">
                ▶ Open
              </button>
              <button onclick="killProcess('${escapeHtml(proc.package)}', '${escapeHtml(displayName)}')" title="Force Stop" class="px-2 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded text-xs transition">
                End Task
              </button>
              <button onclick="clearAppData('${escapeHtml(proc.package)}', '${escapeHtml(displayName)}')" title="Clear App Cache" class="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-400 rounded text-xs transition">
                Clear
              </button>
            ` : `
              <button onclick="killProcess('${escapeHtml(proc.package)}', '${escapeHtml(displayName)}')" title="Force Stop" class="px-2 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded text-xs transition">
                End Task
              </button>
            `}
            ${isUser ? `
              <button onclick="uninstallApp('${escapeHtml(proc.package)}', '${escapeHtml(displayName)}')" title="Uninstall from TV" class="px-2 py-1 bg-red-950 hover:bg-red-800 text-red-300 border border-red-700 rounded text-xs transition">
                🗑️ Uninstall
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
    })
    .join('');
}

// --- App Management Actions ---

// Kill Process
async function killProcess(pkg, name) {
  if (!confirm(`Force-stop ${name}? This will immediately release its RAM.`)) return;

  try {
    const res = await fetch('/api/process/kill', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg })
    });
    const data = await res.json();
    if (data.success) {
      requestManualSnapshot();
    } else {
      alert(`Failed to kill process: ${data.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Launch App
async function launchApp(pkg) {
  try {
    const res = await fetch('/api/package/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg })
    });
    const data = await res.json();
    if (!data.success) alert(`Failed to launch: ${data.error}`);
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Clear App Data
async function clearAppData(pkg, name) {
  if (!confirm(`Clear cache and data for ${name}?`)) return;

  try {
    const res = await fetch('/api/package/clear-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Data cleared for ${name}!`);
      requestManualSnapshot();
    } else {
      alert(`Failed to clear data: ${data.output || data.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// Uninstall App
async function uninstallApp(pkg, name) {
  if (!confirm(`Are you sure you want to completely UNINSTALL ${name} from your Android TV?`)) return;

  try {
    const res = await fetch('/api/package/uninstall', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Successfully uninstalled ${name}!`);
      userInstalledPackages.delete(pkg);
      requestManualSnapshot();
      fetchPackagesList();
    } else {
      alert(`Uninstall failed: ${data.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Drag & Drop APK Sideload & Installation ---

function setupDragAndDrop() {
  const dropzone = document.getElementById('apk-dropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files);
    }
  });
}

function handleFileSelected(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  if (!file.name.endsWith('.apk')) {
    alert('Please select a valid Android .apk file!');
    return;
  }

  selectedApkFile = file;
  document.getElementById('apk-filename-display').textContent = file.name;
  const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
  document.getElementById('apk-filesize-display').textContent = `${sizeMb} MB ready to install`;
  document.getElementById('btn-submit-install').disabled = false;
}

function openInstallModal() {
  if (!isConnected) return alert('Connect to Android TV first');
  document.getElementById('modal-install').classList.remove('hidden');
}

function closeInstallModal() {
  document.getElementById('modal-install').classList.add('hidden');
  document.getElementById('install-progress-box').classList.add('hidden');
  selectedApkFile = null;
  document.getElementById('apk-filename-display').textContent = 'Drag & Drop .APK file here';
  document.getElementById('apk-filesize-display').textContent = 'or click to browse from computer';
  document.getElementById('btn-submit-install').disabled = true;
}

async function uploadAndInstallApk() {
  if (!selectedApkFile) return;

  const btn = document.getElementById('btn-submit-install');
  btn.disabled = true;

  const progressBox = document.getElementById('install-progress-box');
  const progressBar = document.getElementById('install-progress-bar');
  const statusText = document.getElementById('install-status-text');
  const percentText = document.getElementById('install-percent-text');

  progressBox.classList.remove('hidden');
  progressBar.style.width = '15%';
  statusText.textContent = 'Uploading APK to home server...';
  percentText.textContent = '15%';

  const formData = new FormData();
  formData.append('apk', selectedApkFile);

  try {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/package/install');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 70); // 70% upload, 30% install
        progressBar.style.width = `${percent}%`;
        percentText.textContent = `${percent}%`;
      }
    };

    xhr.onload = () => {
      if (xhr.status === 200) {
        progressBar.style.width = '100%';
        percentText.textContent = '100%';
        statusText.textContent = 'Installed successfully!';
        setTimeout(() => {
          alert('APK installed successfully on your Android TV!');
          closeInstallModal();
          fetchPackagesList();
          requestManualSnapshot();
        }, 600);
      } else {
        const err = JSON.parse(xhr.responseText || '{}');
        alert(`Installation error: ${err.error || 'Installation failed'}`);
        btn.disabled = false;
      }
    };

    xhr.onerror = () => {
      alert('Upload failed due to network error.');
      btn.disabled = false;
    };

    progressBar.style.width = '75%';
    statusText.textContent = 'Installing on TV over ADB...';
    xhr.send(formData);
  } catch (err) {
    alert(`Error: ${err.message}`);
    btn.disabled = false;
  }
}

// --- Connection Toggle ---
async function toggleConnect() {
  if (isConnected) {
    try {
      await fetch('/api/disconnect', { method: 'POST' });
      setConnectedState(false);
    } catch (e) {}
  } else {
    const ip = inputIp.value.trim();
    const port = parseInt(inputPort.value.trim(), 10) || 5555;
    if (!ip) {
      alert('Please enter your Android TV IP address');
      return;
    }

    btnConnect.disabled = true;
    btnConnect.textContent = 'Connecting...';

    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('tvmaster_last_ip', ip);
        setConnectedState(true, ip, data.deviceInfo);
        fetchPackagesList();
      } else {
        alert(`Connection Failed: ${data.error || 'Check that Network Debugging is enabled on TV'}`);
        setConnectedState(false);
      }
    } catch (err) {
      alert(`Network Error: ${err.message}`);
      setConnectedState(false);
    } finally {
      btnConnect.disabled = false;
    }
  }
}

function setConnectedState(connected, ip = '', info = null) {
  isConnected = connected;
  if (connected) {
    connDot.className = 'w-2 h-2 rounded-full bg-emerald-400 animate-pulse';
    connText.textContent = 'Connected';
    connPill.className = 'px-2.5 py-0.5 text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full flex items-center gap-1.5';
    btnConnect.textContent = 'Disconnect';
    btnConnect.className = 'px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition shadow-md';
    devIp.textContent = ip ? `${ip}:5555` : '-';
    if (info) {
      devModel.textContent = info.model;
      devOs.textContent = `${info.androidVersion} (API ${info.apiLevel})`;
      devRes.textContent = info.screenResolution;
    }
  } else {
    connDot.className = 'w-2 h-2 rounded-full bg-slate-500';
    connText.textContent = 'Disconnected';
    connPill.className = 'px-2.5 py-0.5 text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 rounded-full flex items-center gap-1.5';
    btnConnect.textContent = 'Connect';
    btnConnect.className = 'px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-xl transition shadow-md glow-blue';
    devModel.textContent = 'Not Connected';
    devIp.textContent = '-';
    devOs.textContent = '-';
    devRes.textContent = '-';
  }
}

// --- Speed Up / Tuning Actions ---
async function setSpeedAnimations(scale) {
  if (!isConnected) return alert('Connect to Android TV first');
  try {
    const res = await fetch('/api/tuning/animation-scale', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scale })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Window animation scale set to ${scale}x! UI transitions are now much snappier.`);
    } else {
      alert(`Failed: ${data.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

async function flushRam() {
  if (!isConnected) return alert('Connect to Android TV first');
  try {
    const res = await fetch('/api/process/flush-ram', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      alert('Dropped all cached background processes! Memory freed.');
      requestManualSnapshot();
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

function changePollRate(ms) {
  const interval = parseInt(ms, 10);
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'set_interval', intervalMs: interval }));
  }
}

function requestManualSnapshot() {
  if (ws && ws.readyState === 1) {
    ws.send(JSON.stringify({ type: 'refresh_now' }));
  }
}

// --- Auto-Discovery Modal ---
function openDiscoverModal() {
  document.getElementById('modal-discover').classList.remove('hidden');
}

function closeDiscoverModal() {
  document.getElementById('modal-discover').classList.add('hidden');
}

async function startDiscoveryScan() {
  const listEl = document.getElementById('discover-list');
  listEl.innerHTML = '<div class="text-center py-6 text-blue-400 animate-pulse text-xs">Scanning subnet on port 5555...</div>';

  try {
    const res = await fetch('/api/discover');
    const data = await res.json();
    if (data.devices && data.devices.length > 0) {
      listEl.innerHTML = data.devices
        .map(
          (dev) => `
        <div class="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
          <div>
            <p class="font-bold text-white text-xs">${dev.name}</p>
            <p class="text-[11px] text-slate-400 font-mono">${dev.ip}:${dev.port}</p>
          </div>
          <button onclick="pickDiscoveredDevice('${dev.ip}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition">
            Connect
          </button>
        </div>
      `
        )
        .join('');
    } else {
      listEl.innerHTML = '<div class="text-center py-6 text-slate-400 text-xs">No devices found with port 5555 open.<br>Ensure "USB/Network Debugging" is enabled on your TV.</div>';
    }
  } catch (err) {
    listEl.innerHTML = `<div class="text-center py-4 text-red-400 text-xs">Scan failed: ${err.message}</div>`;
  }
}

function pickDiscoveredDevice(ip) {
  inputIp.value = ip;
  closeDiscoverModal();
  toggleConnect();
}

// --- Bloatware Hunter Modal ---
async function openDebloatModal() {
  if (!isConnected) return alert('Connect to Android TV first');
  const modal = document.getElementById('modal-debloat');
  const listEl = document.getElementById('debloat-list');
  modal.classList.remove('hidden');
  listEl.innerHTML = '<div class="text-center py-6 text-slate-400">Inspecting packages...</div>';

  try {
    const res = await fetch('/api/packages');
    const data = await res.json();
    if (data.bloatware && data.bloatware.length > 0) {
      listEl.innerHTML = data.bloatware
        .map(
          (item) => `
        <div class="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
          <div>
            <div class="flex items-center gap-2">
              <p class="font-bold text-white">${escapeHtml(item.name)}</p>
              <span class="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] text-slate-400">${item.vendor}</span>
            </div>
            <p class="text-[10px] text-slate-400 font-mono">${escapeHtml(item.package)}</p>
          </div>
          <button onclick="toggleFreeze('${escapeHtml(item.package)}', ${item.isFrozen})" class="px-3 py-1 text-xs font-semibold rounded-lg transition ${
            item.isFrozen
              ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-red-600/20 text-red-400 border border-red-500/30'
          }">
            ${item.isFrozen ? 'Frozen (Disabled)' : 'Active (Freeze)'}
          </button>
        </div>
      `
        )
        .join('');
    }
  } catch (err) {
    listEl.innerHTML = `<div class="text-center py-4 text-red-400">Failed to load packages: ${err.message}</div>`;
  }
}

function closeDebloatModal() {
  document.getElementById('modal-debloat').classList.add('hidden');
}

async function toggleFreeze(pkg, currentlyFrozen) {
  const endpoint = currentlyFrozen ? '/api/package/unfreeze' : '/api/package/freeze';
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: pkg })
    });
    const data = await res.json();
    if (data.success) {
      openDebloatModal(); // Refresh list
    } else {
      alert(`Action failed: ${data.output || data.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Virtual Remote Modal ---
function openRemoteModal() {
  document.getElementById('modal-remote').classList.remove('hidden');
}

function closeRemoteModal() {
  document.getElementById('modal-remote').classList.add('hidden');
}

async function sendRemoteKey(key) {
  if (!isConnected) return alert('Connect to Android TV first');
  try {
    await fetch('/api/remote/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
  } catch (e) {}
}

async function sendRemoteText() {
  if (!isConnected) return alert('Connect to Android TV first');
  const input = document.getElementById('remote-text-input');
  const text = input.value.trim();
  if (!text) return;

  try {
    const res = await fetch('/api/remote/text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    const data = await res.json();
    if (data.success) {
      input.value = '';
    }
  } catch (err) {
    alert(`Failed to send text: ${err.message}`);
  }
}

async function rebootTv() {
  if (!isConnected) return alert('Connect to Android TV first');
  if (confirm('Are you sure you want to reboot the Android TV?')) {
    try {
      await fetch('/api/remote/reboot', { method: 'POST' });
      alert('Reboot command dispatched to TV.');
      setConnectedState(false);
      closeRemoteModal();
    } catch (e) {}
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
