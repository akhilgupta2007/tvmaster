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
const barRamKernel = document.getElementById('bar-ram-kernel');
const barRamCached = document.getElementById('bar-ram-cached');
const ramActiveVal = document.getElementById('ram-active-val');
const ramKernelVal = document.getElementById('ram-kernel-val');
const ramCachedVal = document.getElementById('ram-cached-val');
const ramFreeVal = document.getElementById('ram-free-val');
const memAccountingPill = document.getElementById('mem-accounting-pill');

const cpuBadge = document.getElementById('cpu-badge');
const cpuPercent = document.getElementById('cpu-percent');
const cpuLoadavg = document.getElementById('cpu-loadavg');
const barCpu = document.getElementById('bar-cpu');
const cpuArchBadge = document.getElementById('cpu-arch-badge');
const cpuSocLabel = document.getElementById('cpu-soc-label');
const cpuCoresContainer = document.getElementById('cpu-cores-container');

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
window.addEventListener('DOMContentLoaded', async () => {
  if (lastIp) {
    inputIp.value = lastIp;
  }
  setupDragAndDrop();
  initWebSocket();
  await Promise.allSettled([checkServerStatus(), fetchDevicesList()]);
});

// --- Server Status & Initial Check ---
async function checkServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      setConnectedState(true, data.deviceIp, data.deviceInfo);
      fetchPackagesList();
      fetchDevicesList();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'refresh_now' }));
      }
    } else {
      setConnectedState(false);
      const targetIp = data.savedIp || lastIp || (inputIp ? inputIp.value.trim() : '');
      if (targetIp) {
        inputIp.value = targetIp;
        // Seamlessly auto-connect without intrusive popups
        toggleConnect(true);
      }
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
      const toolbarBadge = document.getElementById('installed-apps-badge');
      if (toolbarBadge) toolbarBadge.textContent = `${data.userPackages.length}`;
    }
    if (data.installedApps) {
      allInstalledApps = data.installedApps;
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
    // Request instant telemetry snapshot on connection
    ws.send(JSON.stringify({ type: 'refresh_now' }));
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

  // Auto-synchronize connection status when receiving live telemetry
  if (!isConnected) {
    const activeIp = data.deviceIp || (data.device && data.device.ip) || (devIp && devIp.textContent !== '-' ? devIp.textContent.replace(':5555', '') : '');
    setConnectedState(true, activeIp, data.device);
  }

  // Device Info
  if (data.device) {
    devModel.textContent = data.device.model || 'Android TV';
    devOs.textContent = `${data.device.androidVersion} (API ${data.device.apiLevel})`;
    devRes.textContent = data.device.screenResolution || '1920x1080';
    if (cpuArchBadge && data.device.cpuArch) {
      cpuArchBadge.textContent = data.device.cpuArch;
    }
    if (cpuSocLabel && data.device.socModel) {
      cpuSocLabel.textContent = data.device.socModel;
    }
  }

  // RAM
  if (data.memory) {
    const mem = data.memory;
    ramBadge.textContent = `${mem.usedMb} / ${mem.totalMb} MB`;
    ramPercent.textContent = `${mem.usedPercent}%`;

    const appsMb = mem.appsMb || Math.max(0, mem.usedMb - (mem.kernelGpuMb || 0));
    const kernelGpuMb = mem.kernelGpuMb || Math.max(0, mem.usedMb - appsMb);
    const cachedMb = mem.cachedMb || 0;
    const availableMb = mem.availableMb || (mem.totalMb - mem.usedMb);

    const appsPercent = mem.totalMb > 0 ? (appsMb / mem.totalMb) * 100 : 0;
    const kernelPercent = mem.totalMb > 0 ? (kernelGpuMb / mem.totalMb) * 100 : 0;
    const cachedPercent = mem.totalMb > 0 ? (cachedMb / mem.totalMb) * 100 : 0;

    if (barRamActive) barRamActive.style.width = `${appsPercent}%`;
    if (barRamKernel) barRamKernel.style.width = `${kernelPercent}%`;
    if (barRamCached) barRamCached.style.width = `${cachedPercent}%`;

    if (ramActiveVal) ramActiveVal.textContent = `${appsMb} MB`;
    if (ramKernelVal) ramKernelVal.textContent = `${kernelGpuMb} MB`;
    if (ramCachedVal) ramCachedVal.textContent = `${cachedMb} MB`;
    if (ramFreeVal) ramFreeVal.textContent = `${availableMb} MB`;

    // Update memory accounting pill above the process table
    if (memAccountingPill && data.processes) {
      const procSum = mem.processTotalMb || data.processes.reduce((acc, p) => acc + (p.memMb || 0), 0);
      memAccountingPill.innerHTML = `Table apps: <b class="text-blue-400">${procSum} MB</b> | Kernel & 4K Display: <b class="text-purple-400">~${kernelGpuMb} MB</b> | Cache: <b class="text-cyan-400">~${cachedMb} MB</b> | Free: <b class="text-emerald-400">~${availableMb} MB</b>`;
    }

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

    // Render per-core utilization micro-bars
    if (cpuCoresContainer && Array.isArray(cpu.cores) && cpu.cores.length > 0) {
      if (cpuSocLabel && (!data.device || !data.device.socModel)) {
        cpuSocLabel.textContent = `${cpu.cores.length} Cores`;
      }
      cpuCoresContainer.innerHTML = cpu.cores.map((c) => {
        const barColor = c.percent > 75 ? 'bg-red-500' : c.percent > 40 ? 'bg-amber-400' : 'bg-emerald-400';
        return `
          <div class="bg-slate-950/80 p-1.5 rounded-lg border border-slate-800 text-[10px]">
            <div class="flex justify-between items-center text-slate-400 mb-1 leading-none">
              <span class="font-medium text-slate-300">C${c.core}</span>
              <span class="font-mono text-white font-bold">${c.percent}%</span>
            </div>
            <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all duration-300 ${barColor}" style="width: ${c.percent}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }
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
  if (!confirm(`Are you sure you want to completely UNINSTALL ${name} from your Android TV? This will free up internal storage.`)) return;

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
      allInstalledApps = allInstalledApps.filter((a) => a.package !== pkg);
      requestManualSnapshot();
      fetchPackagesList();
      renderInstalledAppsList(allInstalledApps);
      const toolbarBadge = document.getElementById('installed-apps-badge');
      const countBadge = document.getElementById('apps-modal-count-badge');
      if (toolbarBadge) toolbarBadge.textContent = `${allInstalledApps.length}`;
      if (countBadge) countBadge.textContent = `${allInstalledApps.length} Apps`;
    } else {
      alert(`Uninstall failed: ${data.error}`);
    }
  } catch (err) {
    alert(`Error: ${err.message}`);
  }
}

// --- Installed Apps Manager Modal ---
let allInstalledApps = [];

async function openAppsModal() {
  const modal = document.getElementById('modal-installed-apps');
  if (modal) {
    modal.classList.remove('hidden');
    loadInstalledApps();
  }
}

function closeAppsModal() {
  const modal = document.getElementById('modal-installed-apps');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function loadInstalledApps(force = false) {
  const listEl = document.getElementById('installed-apps-list');
  const countBadge = document.getElementById('apps-modal-count-badge');
  const toolbarBadge = document.getElementById('installed-apps-badge');
  if (!listEl) return;

  if (force || allInstalledApps.length === 0) {
    listEl.innerHTML = '<div class="text-center py-8 text-slate-500 flex items-center justify-center gap-2"><svg class="animate-spin w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg> Loading installed applications from TV...</div>';
    try {
      const res = await fetch('/api/packages');
      const data = await res.json();
      if (data.installedApps) {
        allInstalledApps = data.installedApps;
      } else if (data.userPackages) {
        allInstalledApps = data.userPackages.map((pkg) => ({
          package: pkg,
          name: pkg,
          isDisabled: false
        }));
      }
      if (data.userPackages) {
        userInstalledPackages = new Set(data.userPackages);
      }
    } catch (e) {
      listEl.innerHTML = '<div class="text-center py-6 text-red-400">Failed to load installed applications from TV.</div>';
      return;
    }
  }

  if (toolbarBadge) toolbarBadge.textContent = `${allInstalledApps.length}`;
  if (countBadge) countBadge.textContent = `${allInstalledApps.length} Apps`;

  renderInstalledAppsList(allInstalledApps);
}

function filterInstalledApps() {
  const input = document.getElementById('apps-search-input');
  const query = (input ? input.value : '').toLowerCase().trim();
  if (!query) {
    renderInstalledAppsList(allInstalledApps);
    return;
  }

  const filtered = allInstalledApps.filter(
    (app) => (app.name && app.name.toLowerCase().includes(query)) ||
             (app.package && app.package.toLowerCase().includes(query))
  );
  renderInstalledAppsList(filtered);
}

function renderInstalledAppsList(apps) {
  const listEl = document.getElementById('installed-apps-list');
  if (!listEl) return;

  if (!apps || apps.length === 0) {
    listEl.innerHTML = '<div class="text-center py-8 text-slate-500">No applications match your search.</div>';
    return;
  }

  // Check currently running packages in memory
  const runningPackages = new Set((currentProcesses || []).map((p) => p.package));

  listEl.innerHTML = apps.map((app) => {
    const isRunning = runningPackages.has(app.package);
    const initial = (app.name || app.package).charAt(0).toUpperCase();

    const runningBadge = isRunning
      ? '<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30 flex items-center gap-1"><span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Running</span>'
      : '<span class="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 font-semibold">Idle</span>';

    return `
      <div class="bg-slate-950/70 hover:bg-slate-950 border border-slate-800/80 hover:border-slate-700 rounded-xl p-3 flex items-center justify-between gap-3 transition">
        <div class="flex items-center gap-3 min-w-0">
          <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600/30 to-indigo-600/30 border border-blue-500/30 flex items-center justify-center text-sm font-bold text-white shrink-0">
            ${escapeHtml(initial)}
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-white truncate">${escapeHtml(app.name)}</span>
              ${runningBadge}
            </div>
            <div class="text-[11px] font-mono text-slate-400 truncate">${escapeHtml(app.package)}</div>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button onclick="launchApp('${escapeHtml(app.package)}')" title="Launch App on TV" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition flex items-center gap-1">
            <span>▶</span>
            <span class="hidden sm:inline">Launch</span>
          </button>
          <button onclick="clearAppData('${escapeHtml(app.package)}', '${escapeHtml(app.name)}')" title="Clear App Cache and Data" class="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-amber-300 text-xs font-semibold rounded-lg transition flex items-center gap-1">
            <span>🧹</span>
            <span class="hidden sm:inline">Clear</span>
          </button>
          <button onclick="uninstallApp('${escapeHtml(app.package)}', '${escapeHtml(app.name)}')" title="Uninstall from TV" class="px-2.5 py-1.5 bg-red-950/80 hover:bg-red-800 text-red-300 hover:text-white border border-red-700/80 text-xs font-bold rounded-lg transition flex items-center gap-1">
            <span>🗑️</span>
            <span>Uninstall</span>
          </button>
        </div>
      </div>
    `;
  }).join('');
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

// Auto-heal connection status check
async function ensureConnected() {
  if (isConnected) return true;
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.connected) {
      setConnectedState(true, data.deviceIp, data.deviceInfo);
      return true;
    }
  } catch (e) {}
  return false;
}

async function openInstallModal() {
  const connected = await ensureConnected();
  if (!connected) {
    alert('Please connect to your Android TV first');
    return;
  }
  const modal = document.getElementById('modal-install');
  if (modal) {
    modal.classList.remove('hidden');
    const targetLabel = document.getElementById('install-target-tv');
    if (targetLabel) {
      targetLabel.textContent = `Target: ${devModel.textContent || 'Android TV'} (${devIp.textContent || ''})`;
    }
  }
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

  const connected = await ensureConnected();
  if (!connected) {
    alert('Please connect to your Android TV first before installing an APK');
    return;
  }

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
async function toggleConnect(isAuto = false) {
  if (isConnected) {
    try {
      await fetch('/api/disconnect', { method: 'POST' });
      setConnectedState(false);
    } catch (e) {}
  } else {
    const ip = inputIp.value.trim();
    const port = parseInt(inputPort.value.trim(), 10) || 5555;
    if (!ip) {
      if (!isAuto) alert('Please enter your Android TV IP address');
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
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'refresh_now' }));
        }
      } else {
        if (!isAuto) {
          alert(`Connection Failed: ${data.error || 'Check that Network Debugging is enabled on TV'}`);
        }
        setConnectedState(false);
      }
    } catch (err) {
      if (!isAuto) {
        alert(`Network Error: ${err.message}`);
      }
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
      if (cpuArchBadge && info.cpuArch) {
        cpuArchBadge.textContent = info.cpuArch;
      }
      if (cpuSocLabel && info.socModel) {
        cpuSocLabel.textContent = info.socModel;
      }
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
    if (cpuArchBadge) cpuArchBadge.textContent = 'ARM';
    if (cpuSocLabel) cpuSocLabel.textContent = '';
    if (cpuCoresContainer) cpuCoresContainer.innerHTML = '';
  }
  // Refresh TV cards active state
  renderTvCards(savedTvDevices, connected ? (ip || (inputIp ? inputIp.value.trim() : '')) : null);
}

// --- Speed Up / Tuning Actions ---
async function setSpeedAnimations(scale) {
  if (!await ensureConnected()) return alert('Please connect to your Android TV first');
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
  if (!await ensureConnected()) return alert('Please connect to your Android TV first');
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

// --- TV Device Card Switching & Management Engine ---
let savedTvDevices = [];

async function fetchDevicesList() {
  try {
    const res = await fetch('/api/devices');
    const data = await res.json();
    savedTvDevices = data.devices || [];
    renderTvCards(savedTvDevices, data.activeIp);
  } catch (e) {
    console.warn('Failed to load saved TV profiles:', e);
  }
}

function renderTvCards(devices, activeIp) {
  const container = document.getElementById('tv-cards-container');
  const countBadge = document.getElementById('tv-cards-count');
  if (!container) return;

  if (countBadge) {
    countBadge.textContent = `${devices.length} saved`;
  }

  const currentIp = activeIp || (isConnected && inputIp ? inputIp.value.trim() : null);

  let html = '';

  for (const dev of devices) {
    const isActive = Boolean(dev.isActive || (currentIp && (dev.ip === currentIp || dev.id === currentIp || dev.id?.startsWith(currentIp + ':'))));
    const icon = dev.deviceIcon || (dev.deviceType === 'firestick' ? '🔥' : dev.deviceType === 'shield' ? '🛡️' : dev.deviceType === 'box' ? '📦' : dev.deviceType === 'projector' ? '📽️' : '📺');
    const typeLabel = dev.deviceTypeLabel || (dev.deviceType === 'firestick' ? 'Fire TV / Stick' : dev.deviceType === 'shield' ? 'NVIDIA Shield' : dev.deviceType === 'box' ? 'Streaming Box' : dev.deviceType === 'projector' ? 'Smart Projector' : 'Smart TV');

    if (isActive) {
      // Active Device Card (High visual emphasis)
      html += `
        <div class="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950/40 border-2 border-blue-500 rounded-2xl p-4 shadow-xl glow-blue relative flex flex-col justify-between transition group">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/40 flex items-center justify-center text-xl shadow-inner">
                ${icon}
              </div>
              <div>
                <div class="flex items-center gap-1.5">
                  <h4 class="font-bold text-white text-sm leading-tight">${escapeHtml(dev.name || typeLabel)}</h4>
                  <button onclick="promptRenameTv('${dev.ip}', '${escapeHtml(dev.name || '')}')" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition text-xs" title="Rename Device">✏️</button>
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-[10px] font-medium bg-blue-500/20 text-blue-300 px-1.5 py-0.2 rounded">${typeLabel}</span>
                  <span class="text-[11px] font-mono text-slate-400">${dev.ip}:${dev.port || 5555}</span>
                </div>
              </div>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shadow-sm">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Active
            </span>
          </div>

          <div class="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 gap-1.5 flex-wrap">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">${escapeHtml(dev.model || 'Connected')}</span>
              <span class="text-blue-300 font-mono font-medium">${escapeHtml(dev.displaySpecs?.activeMode?.label || dev.screenResolution || '3840x2160')}</span>
              ${dev.displaySpecs?.hasHdr ? `<span class="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-1.5 py-0.2 rounded text-[10px] font-semibold">🌈 ${escapeHtml(dev.displaySpecs.hdrTypes.slice(0, 2).join('/'))}</span>` : ''}
              ${dev.displaySpecs?.allmSupported ? `<span class="bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.2 rounded text-[10px] font-semibold">🎮 ALLM</span>` : ''}
            </div>
            <div class="flex items-center gap-2">
              <button onclick="openDisplaySpecsModal()" class="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition flex items-center gap-0.5" title="View Full Video & HDMI Handshake Specs">
                🔍 Specs
              </button>
              <span class="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                ✓ Streaming
              </span>
            </div>
          </div>
        </div>
      `;
    } else {
      // Standby / Other Device Card (1-Click Switchable)
      html += `
        <div onclick="switchTv('${dev.ip}', ${dev.port || 5555}, '${escapeHtml(dev.name || '')}')" class="bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-blue-500/50 rounded-2xl p-4 shadow cursor-pointer relative flex flex-col justify-between transition group hover:-translate-y-0.5">
          <div class="flex items-start justify-between gap-2">
            <div class="flex items-center gap-2.5">
              <div class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-xl group-hover:scale-105 transition">
                ${icon}
              </div>
              <div>
                <div class="flex items-center gap-1.5">
                  <h4 class="font-bold text-slate-200 group-hover:text-white text-sm leading-tight">${escapeHtml(dev.name || typeLabel)}</h4>
                  <button onclick="event.stopPropagation(); promptRenameTv('${dev.ip}', '${escapeHtml(dev.name || '')}')" class="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-white transition text-xs" title="Rename Device">✏️</button>
                </div>
                <div class="flex items-center gap-1.5 mt-0.5">
                  <span class="text-[10px] font-medium bg-slate-800 text-slate-400 px-1.5 py-0.2 rounded">${typeLabel}</span>
                  <span class="text-[11px] font-mono text-slate-400">${dev.ip}:${dev.port || 5555}</span>
                </div>
              </div>
            </div>
            <button onclick="event.stopPropagation(); deleteTvCard('${dev.ip}')" class="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 text-xs transition px-1" title="Remove Device">✕</button>
          </div>

          <div class="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span class="bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-400">${escapeHtml(dev.model || 'Saved Device')}</span>
            <button onclick="event.stopPropagation(); switchTv('${dev.ip}', ${dev.port || 5555}, '${escapeHtml(dev.name || '')}')" class="px-2.5 py-1 bg-slate-800 hover:bg-blue-600 text-slate-300 hover:text-white rounded-lg font-semibold text-xs transition border border-slate-700 hover:border-transparent flex items-center gap-1">
              ⚡ Switch Device
            </button>
          </div>
        </div>
      `;
    }
  }

  // Add Device Card Button at the end
  html += `
    <div onclick="openAddTvModal()" class="border-2 border-dashed border-slate-800 hover:border-blue-500/50 bg-slate-950/40 hover:bg-blue-600/5 rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition min-h-[110px] group">
      <div class="w-8 h-8 rounded-full bg-slate-800 group-hover:bg-blue-600/20 text-slate-400 group-hover:text-blue-400 flex items-center justify-center mb-1.5 transition">
        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
      </div>
      <span class="text-xs font-bold text-slate-300 group-hover:text-white">Add Device</span>
      <span class="text-[10px] text-slate-500">TV, Firestick, Chromecast, Box</span>
    </div>
  `;

  container.innerHTML = html;
}

// 1-Click Switch TV Handler
async function switchTv(ip, port = 5555, name = '', deviceType = '') {
  inputIp.value = ip;
  inputPort.value = port;
  btnConnect.disabled = true;
  btnConnect.textContent = 'Switching...';

  try {
    const res = await fetch('/api/devices/switch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, port, name, deviceType })
    });
    const data = await res.json();
    if (data.success) {
      localStorage.setItem('tvmaster_last_ip', ip);
      setConnectedState(true, ip, data.deviceInfo || data.activeDevice);
      fetchPackagesList();
      fetchDevicesList();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'refresh_now' }));
      }
    } else {
      alert(`Failed to switch device: ${data.error || 'Could not connect'}`);
      setConnectedState(false);
      fetchDevicesList();
    }
  } catch (err) {
    alert(`Network Error: ${err.message}`);
    setConnectedState(false);
    fetchDevicesList();
  } finally {
    btnConnect.disabled = false;
  }
}

// Add TV Modal Handlers
function openAddTvModal() {
  document.getElementById('modal-add-tv').classList.remove('hidden');
}

function closeAddTvModal() {
  document.getElementById('modal-add-tv').classList.add('hidden');
}

async function saveAndSwitchNewTv() {
  const ip = document.getElementById('add-tv-ip').value.trim();
  const port = parseInt(document.getElementById('add-tv-port').value.trim(), 10) || 5555;
  const name = document.getElementById('add-tv-name').value.trim();
  const deviceType = document.getElementById('add-tv-type')?.value || 'tv';

  if (!ip) return alert('Please enter a valid IP address');

  closeAddTvModal();
  await switchTv(ip, port, name, deviceType);
}

// Rename TV Handlers
function promptRenameTv(ip, currentName) {
  document.getElementById('rename-tv-ip').value = ip;
  document.getElementById('rename-tv-input').value = currentName || '';
  document.getElementById('modal-rename-tv').classList.remove('hidden');
}

function closeRenameTvModal() {
  document.getElementById('modal-rename-tv').classList.add('hidden');
}

async function submitRenameTv() {
  const ip = document.getElementById('rename-tv-ip').value.trim();
  const name = document.getElementById('rename-tv-input').value.trim();
  if (!ip || !name) return alert('Name cannot be empty');

  try {
    const res = await fetch('/api/devices/rename', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, name })
    });
    const data = await res.json();
    if (data.success) {
      closeRenameTvModal();
      fetchDevicesList();
    } else {
      alert(data.error || 'Failed to rename');
    }
  } catch (e) {
    alert(e.message);
  }
}

// Delete TV Card Handler
async function deleteTvCard(ip) {
  if (confirm(`Remove TV (${ip}) from your saved cards?`)) {
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(ip)}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        fetchDevicesList();
      }
    } catch (e) {
      alert(e.message);
    }
  }
}

// --- Enhanced Auto-Discovery with Subnet Scanning ---
function openDiscoverModal() {
  document.getElementById('modal-discover').classList.remove('hidden');
}

function closeDiscoverModal() {
  document.getElementById('modal-discover').classList.add('hidden');
}

async function startDiscoveryScan() {
  const listEl = document.getElementById('discover-list');
  const subnetInput = document.getElementById('discover-subnet-input');
  let subnet = subnetInput ? subnetInput.value.trim() : '';
  if (subnet === 'all') subnet = '';

  const subnetText = subnet ? `subnet ${subnet}.0/24` : 'local network';
  listEl.innerHTML = `<div class="text-center py-6 text-blue-400 animate-pulse text-xs">Scanning ${subnetText} on port 5555...</div>`;

  try {
    const url = subnet ? `/api/discover?subnet=${encodeURIComponent(subnet)}` : '/api/discover';
    const res = await fetch(url);
    const data = await res.json();

    if (data.devices && data.devices.length > 0) {
      listEl.innerHTML = data.devices
        .map(
          (dev) => `
        <div class="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-slate-700 transition">
          <div>
            <div class="flex items-center gap-1.5">
              <p class="font-bold text-white text-xs">${escapeHtml(dev.name)}</p>
              ${dev.isKnown ? '<span class="text-[9px] bg-blue-500/20 text-blue-400 px-1.5 py-0.2 rounded font-semibold">Saved</span>' : ''}
            </div>
            <p class="text-[11px] text-slate-400 font-mono">${dev.ip}:${dev.port}</p>
          </div>
          <div class="flex items-center gap-1.5">
            <button onclick="pickDiscoveredDevice('${dev.ip}', ${dev.port}, '${escapeHtml(dev.name)}')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow-sm glow-blue">
              Switch & Connect
            </button>
          </div>
        </div>
      `
        )
        .join('');
    } else {
      listEl.innerHTML = `
        <div class="text-center py-6 text-slate-400 text-xs space-y-1">
          <p class="text-white font-semibold">No active Android TV devices detected on ${subnetText}.</p>
          <p class="text-[11px] text-slate-500">1. Ensure your TV is powered on and connected to Wi-Fi/Ethernet.<br>2. Verify "Network Debugging" (Port 5555) is enabled in Developer Options.<br>3. If your TV is on another subnet (e.g. 192.168.1.*), change the target subnet above.</p>
        </div>
      `;
    }
  } catch (err) {
    listEl.innerHTML = `<div class="text-center py-4 text-red-400 text-xs">Scan failed: ${err.message}</div>`;
  }
}

function pickDiscoveredDevice(ip, port = 5555, name = '') {
  closeDiscoverModal();
  switchTv(ip, port, name);
}

// --- Bloatware Hunter Modal ---
async function openDebloatModal() {
  if (!await ensureConnected()) return alert('Please connect to your Android TV first');
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
  if (!await ensureConnected()) return alert('Please connect to your Android TV first');
  try {
    await fetch('/api/remote/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    });
  } catch (e) {}
}

async function sendRemoteText() {
  if (!await ensureConnected()) return alert('Please connect to your Android TV first');
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

// --- Reboot TV Handlers & Reconnect Loop ---
let rebootPollInterval = null;
let rebootCountdownInterval = null;

async function openRebootModal() {
  if (!await ensureConnected()) {
    alert('Please connect to your Android TV first');
    return;
  }
  const modal = document.getElementById('modal-reboot');
  const targetDesc = document.getElementById('reboot-target-desc');
  const confirmView = document.getElementById('reboot-confirm-view');
  const progressView = document.getElementById('reboot-progress-view');

  if (targetDesc) {
    targetDesc.textContent = `${devModel.textContent || 'Android TV'} (${inputIp.value}:${inputPort.value || 5555})`;
  }
  if (confirmView) confirmView.classList.remove('hidden');
  if (progressView) progressView.classList.add('hidden');

  closeRemoteModal();
  modal.classList.remove('hidden');
}

function closeRebootModal() {
  const modal = document.getElementById('modal-reboot');
  if (modal) modal.classList.add('hidden');
  if (rebootPollInterval) {
    clearInterval(rebootPollInterval);
    rebootPollInterval = null;
  }
  if (rebootCountdownInterval) {
    clearInterval(rebootCountdownInterval);
    rebootCountdownInterval = null;
  }
}

async function executeReboot() {
  const confirmView = document.getElementById('reboot-confirm-view');
  const progressView = document.getElementById('reboot-progress-view');
  const timerEl = document.getElementById('reboot-timer');
  const statusMsg = document.getElementById('reboot-status-msg');

  if (confirmView) confirmView.classList.add('hidden');
  if (progressView) progressView.classList.remove('hidden');

  try {
    await fetch('/api/remote/reboot', { method: 'POST' });
  } catch (e) {
    // Abrupt socket termination is expected during reboot
  }

  setConnectedState(false);

  // 25s Countdown before active polling reconnection
  let remaining = 25;
  if (timerEl) timerEl.textContent = `${remaining}s`;

  rebootCountdownInterval = setInterval(() => {
    remaining--;
    if (timerEl) timerEl.textContent = `${Math.max(0, remaining)}s`;
    if (remaining <= 0) {
      clearInterval(rebootCountdownInterval);
      rebootCountdownInterval = null;
      if (statusMsg) statusMsg.textContent = 'Searching for TV on local network...';
      startRebootReconnectLoop();
    }
  }, 1000);
}

function startRebootReconnectLoop() {
  const statusMsg = document.getElementById('reboot-status-msg');
  const timerEl = document.getElementById('reboot-timer');
  if (timerEl) timerEl.textContent = 'Connecting...';

  let attempts = 0;
  const maxAttempts = 30; // Poll for up to 90 seconds (3s intervals)

  rebootPollInterval = setInterval(async () => {
    attempts++;
    if (attempts > maxAttempts) {
      clearInterval(rebootPollInterval);
      rebootPollInterval = null;
      if (statusMsg) {
        statusMsg.innerHTML = '<span class="text-amber-400">TV is still booting. You can click Connect manually once it finishes.</span>';
      }
      return;
    }

    try {
      const ip = inputIp.value.trim();
      const port = parseInt(inputPort.value.trim(), 10) || 5555;
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port })
      });
      const data = await res.json();
      if (data.success) {
        clearInterval(rebootPollInterval);
        rebootPollInterval = null;
        if (statusMsg) {
          statusMsg.innerHTML = '<span class="text-emerald-400 font-bold">✓ Reconnected to Android TV!</span>';
        }
        setConnectedState(true, ip, data.deviceInfo);
        fetchPackagesList();
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'refresh_now' }));
        }
        setTimeout(() => {
          closeRebootModal();
        }, 1200);
      }
    } catch (e) {
      // Still booting up
    }
  }, 3000);
}

function rebootTv() {
  openRebootModal();
}

// --- Display & Video Specs Modal Handlers ---
let cachedDisplaySpecs = null;

function openDisplaySpecsModal() {
  const modal = document.getElementById('modal-display-specs');
  if (modal) {
    modal.classList.remove('hidden');
    fetchDisplaySpecs();
  }
}

function closeDisplaySpecsModal() {
  const modal = document.getElementById('modal-display-specs');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function fetchDisplaySpecs(force = false) {
  const container = document.getElementById('display-specs-content');
  if (!container) return;

  if (force || !cachedDisplaySpecs) {
    container.innerHTML = `
      <div class="text-center py-8 text-slate-500">
        <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent mb-2"></div>
        <p>Querying HDMI display capabilities...</p>
      </div>
    `;
  }

  try {
    const res = await fetch(`/api/device/display?refresh=${force ? 'true' : 'false'}`);
    const data = await res.json();

    if (!data.success || !data.displaySpecs) {
      container.innerHTML = `
        <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-slate-400">
          <p class="font-semibold text-amber-400 mb-1">Display Specs Unavailable</p>
          <p class="text-[11px]">${data.error || 'Could not query dumpsys display from device.'}</p>
        </div>
      `;
      return;
    }

    cachedDisplaySpecs = data.displaySpecs;
    renderDisplaySpecsContent(data.displaySpecs, data.deviceInfo);
  } catch (err) {
    container.innerHTML = `
      <div class="p-4 rounded-xl bg-slate-950 border border-slate-800 text-center text-rose-400">
        <p class="font-semibold mb-1">Failed to query display capabilities</p>
        <p class="text-[11px] text-slate-400">${escapeHtml(err.message)}</p>
      </div>
    `;
  }
}

function renderDisplaySpecsContent(specs, info) {
  const container = document.getElementById('display-specs-content');
  if (!container || !specs) return;

  const active = specs.activeMode || { width: 3840, height: 2160, fps: 60, label: '3840x2160 @ 60Hz' };
  const allHdr = ['Dolby Vision', 'HDR10+', 'HDR10', 'HLG'];

  container.innerHTML = `
    <!-- Top Active Mode Banner -->
    <div class="bg-gradient-to-r from-indigo-950/60 to-slate-950 p-4 rounded-2xl border border-indigo-500/30 flex items-center justify-between">
      <div>
        <span class="text-[10px] uppercase font-bold text-indigo-400 tracking-wider">Active Output Resolution</span>
        <h3 class="text-xl font-black text-white mt-0.5 font-mono">${active.width} × ${active.height}</h3>
        <p class="text-xs text-slate-300 font-medium">${active.width >= 3840 ? '4K Ultra High Definition (UHD)' : active.width >= 1920 ? 'Full HD (1080p)' : 'Standard HD'}</p>
      </div>
      <div class="text-right space-y-1">
        <span class="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 inline-block font-mono">
          ${active.fps ? active.fps + ' Hz' : '60 Hz'}
        </span>
        <div class="text-[11px] text-slate-400 font-mono">${specs.density ? specs.density + ' DPI' : ''}</div>
      </div>
    </div>

    <!-- High Dynamic Range (HDR) Matrix -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
          <span>🌈 High Dynamic Range (HDR) Formats</span>
        </h4>
        <span class="text-[10px] text-slate-400">${specs.hasHdr ? specs.hdrTypes.length + ' supported' : 'SDR only'}</span>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
        ${allHdr.map((fmt) => {
          const supported = specs.hdrTypes && specs.hdrTypes.includes(fmt);
          return `
            <div class="p-2.5 rounded-xl border ${supported ? 'bg-amber-500/10 border-amber-500/40 text-amber-300' : 'bg-slate-950 border-slate-800 text-slate-600'} text-center transition">
              <div class="text-xs font-bold">${fmt}</div>
              <div class="text-[10px] mt-0.5 font-medium ${supported ? 'text-emerald-400 font-bold' : 'text-slate-500'}">
                ${supported ? '✓ Supported' : '—'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Gaming & Latency Features -->
    <div class="space-y-2">
      <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider">
        🎮 Gaming & Low-Latency HDMI Features
      </h4>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div class="font-semibold text-white">Auto Low Latency Mode (ALLM)</div>
            <div class="text-[10px] text-slate-400">Switches TV to Game Mode automatically</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${specs.allmSupported ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}">
            ${specs.allmSupported ? '✓ Active' : 'Not Supported'}
          </span>
        </div>
        <div class="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
          <div>
            <div class="font-semibold text-white">Minimal Post-Processing</div>
            <div class="text-[10px] text-slate-400">Low-latency video rendering mode</div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${specs.gameModeSupported ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-slate-800 text-slate-500'}">
            ${specs.gameModeSupported ? '✓ Supported' : 'Standard'}
          </span>
        </div>
      </div>
    </div>

    <!-- Supported Resolution & Refresh Rate Modes -->
    <div class="space-y-2">
      <div class="flex items-center justify-between">
        <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider">
          🖥️ Supported Video Modes & FPS
        </h4>
        <span class="text-[10px] text-slate-400">${specs.supportedModes ? specs.supportedModes.length : 1} modes</span>
      </div>
      <div class="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-1.5 bg-slate-950 rounded-xl border border-slate-800">
        ${(specs.supportedModes && specs.supportedModes.length > 0 ? specs.supportedModes : [active]).map((m) => `
          <span class="px-2.5 py-1 rounded-lg text-[11px] font-mono font-medium bg-slate-900 border border-slate-700 text-slate-200">
            ${escapeHtml(m.label || m.width + 'x' + m.height + ' @ ' + Math.round(m.fps) + 'Hz')}
          </span>
        `).join('')}
      </div>
    </div>
  `;
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
