/**
 * TvMaster - Low-Overhead Telemetry Service
 * Parses Linux/Android /proc pseudofiles with negligible CPU footprint
 */

const adbService = require('./adbService');
const appLabelService = require('./appLabelService');

class TelemetryService {
  constructor() {
    this.subscribers = new Set();
    this.pollTimer = null;
    this.pollIntervalMs = 3000; // Gentle default 3 seconds
    this.prevCpuTicks = null;
    this.lastTelemetry = null;
  }

  /**
   * Parse /proc/meminfo string into clean memory stats
   */
  parseMeminfo(meminfoStr) {
    if (!meminfoStr || typeof meminfoStr !== 'string') {
      return { totalMb: 0, usedMb: 0, freeMb: 0, cachedMb: 0, availableMb: 0, usedPercent: 0 };
    }

    const map = {};
    const lines = meminfoStr.split('\n');
    for (const line of lines) {
      const match = line.match(/^([a-zA-Z0-9_()]+):\s+(\d+)\s*kB/);
      if (match) {
        map[match[1]] = parseInt(match[2], 10);
      }
    }

    const totalKb = map.MemTotal || 0;
    const freeKb = map.MemFree || 0;
    const cachedKb = (map.Cached || 0) + (map.Buffers || 0);
    // MemAvailable was added in Linux 3.14 (Android 6.0+)
    const availableKb = map.MemAvailable !== undefined ? map.MemAvailable : (freeKb + cachedKb);
    const usedKb = Math.max(0, totalKb - availableKb);

    // Deep memory breakdown
    const anonKb = map.AnonPages || 0;
    const slabKb = (map.Slab || 0) + (map.PageTables || 0) + (map.KernelStack || 0);
    const swapUsedKb = Math.max(0, (map.SwapTotal || 0) - (map.SwapFree || 0));

    const totalMb = Math.round(totalKb / 1024);
    const freeMb = Math.round(freeKb / 1024);
    const cachedMb = Math.round(cachedKb / 1024);
    const availableMb = Math.round(availableKb / 1024);
    const usedMb = Math.round(usedKb / 1024);
    const usedPercent = totalMb > 0 ? Math.min(100, Math.round((usedMb / totalMb) * 100)) : 0;

    // Userspace apps memory (AnonPages)
    const appsMb = anonKb > 0 ? Math.round(anonKb / 1024) : Math.max(0, Math.round((usedKb - slabKb) / 1024));
    // Kernel, 4K Display Hardware Framebuffer (MediaTek/SurfaceFlinger) & Drivers
    const kernelGpuMb = Math.max(0, usedMb - appsMb);
    const zramMb = Math.round(swapUsedKb / 1024);

    return {
      totalMb,
      usedMb,
      freeMb,
      cachedMb,
      availableMb,
      usedPercent,
      appsMb,
      kernelGpuMb,
      zramMb
    };
  }

  /**
   * Parse /proc/stat CPU tick counters and calculate delta CPU %
   */
  parseCpuStat(cpuStatStr) {
    if (!cpuStatStr || typeof cpuStatStr !== 'string') {
      return { cpuPercent: 0 };
    }

    const firstLine = cpuStatStr.trim().split('\n')[0];
    const parts = firstLine.trim().split(/\s+/);

    if (parts[0] !== 'cpu' || parts.length < 5) {
      return { cpuPercent: 0 };
    }

    const user = parseInt(parts[1], 10) || 0;
    const nice = parseInt(parts[2], 10) || 0;
    const system = parseInt(parts[3], 10) || 0;
    const idle = parseInt(parts[4], 10) || 0;
    const iowait = parseInt(parts[5], 10) || 0;
    const irq = parseInt(parts[6], 10) || 0;
    const softirq = parseInt(parts[7], 10) || 0;
    const steal = parseInt(parts[8], 10) || 0;

    const idleTotal = idle + iowait;
    const activeTotal = user + nice + system + irq + softirq + steal;
    const total = idleTotal + activeTotal;

    let cpuPercent = 0;
    if (this.prevCpuTicks) {
      const deltaTotal = total - this.prevCpuTicks.total;
      const deltaActive = activeTotal - this.prevCpuTicks.active;
      if (deltaTotal > 0) {
        cpuPercent = Math.max(0, Math.min(100, Math.round((deltaActive / deltaTotal) * 100)));
      }
    }

    this.prevCpuTicks = { total, active: activeTotal };
    return { cpuPercent };
  }

  /**
   * Parse /proc/loadavg (1m, 5m, 15m)
   */
  parseLoadavg(loadavgStr) {
    if (!loadavgStr || typeof loadavgStr !== 'string') {
      return { load1: 0, load5: 0, load15: 0 };
    }

    const parts = loadavgStr.trim().split(/\s+/);
    return {
      load1: parseFloat(parts[0]) || 0,
      load5: parseFloat(parts[1]) || 0,
      load15: parseFloat(parts[2]) || 0
    };
  }

  /**
   * Parse df -k /data output
   */
  parseStorage(dfStr) {
    if (!dfStr || typeof dfStr !== 'string') {
      return { totalGb: 0, usedGb: 0, freeGb: 0, usedPercent: 0 };
    }

    const lines = dfStr.trim().split('\n');
    if (lines.length < 2) {
      return { totalGb: 0, usedGb: 0, freeGb: 0, usedPercent: 0 };
    }

    // Example line: /dev/block/dm-0 11453440 8214220 3239220 72% /data
    const targetLine = lines[lines.length - 1];
    const parts = targetLine.trim().split(/\s+/);

    if (parts.length >= 5) {
      const totalKb = parseInt(parts[1], 10) || 0;
      const usedKb = parseInt(parts[2], 10) || 0;
      const freeKb = parseInt(parts[3], 10) || 0;
      const percentStr = parts[4].replace('%', '');

      const totalGb = +(totalKb / (1024 * 1024)).toFixed(1);
      const usedGb = +(usedKb / (1024 * 1024)).toFixed(1);
      const freeGb = +(freeKb / (1024 * 1024)).toFixed(1);
      const usedPercent = parseInt(percentStr, 10) || (totalGb > 0 ? Math.round((usedGb / totalGb) * 100) : 0);

      return { totalGb, usedGb, freeGb, usedPercent };
    }

    return { totalGb: 0, usedGb: 0, freeGb: 0, usedPercent: 0 };
  }

  /**
   * Parse top output into process list
   */
  parseTop(topStr) {
    if (!topStr || typeof topStr !== 'string') {
      return [];
    }

    const processes = [];
    const lines = topStr.split('\n');
    let headerFound = false;
    let colMap = {};

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      // Identify header line
      if (line.includes('PID') && (line.includes('ARGS') || line.includes('Name') || line.includes('CMD'))) {
        headerFound = true;
        // Handle Toybox top header 'S[%CPU]' which maps to two columns: State and %CPU
        const normalized = line.replace(/S\[%CPU\]/i, 'S %CPU');
        const cols = normalized.split(/\s+/);
        cols.forEach((col, idx) => {
          const upper = col.toUpperCase();
          if (upper.includes('CPU')) colMap['CPU'] = idx;
          if (upper.includes('RES') || upper.includes('RSS')) colMap['RES'] = idx;
          if (upper.includes('PID')) colMap['PID'] = idx;
        });
        continue;
      }

      if (!headerFound) continue;

      const parts = line.split(/\s+/);
      if (parts.length < 5) continue;

      const pid = parseInt(parts[0], 10);
      if (isNaN(pid)) continue;

      // Detect package name / command
      let name = parts[parts.length - 1];

      // Reassemble bracketed kernel threads split across spaces (e.g. [kworker/2:4 task])
      if (name.endsWith(']') && !name.startsWith('[')) {
        for (let i = parts.length - 2; i >= 1; i--) {
          if (parts[i].startsWith('[')) {
            name = parts.slice(i, parts.length).join(' ');
            break;
          }
        }
      }

      // If last token is purely numeric or invalid, look backwards for command/package
      if (/^\d+$/.test(name) && parts.length > 2) {
        for (let i = parts.length - 1; i >= 1; i--) {
          if (!/^\d+(\.\d+)?%?$/.test(parts[i]) && parts[i] !== 'S' && parts[i] !== 'R' && parts[i] !== 'D') {
            name = parts[i];
            break;
          }
        }
      }

      // Clean trailing quotes or escape characters
      name = name.replace(/^["']|["']$/g, '').trim();

      // Filter out self-spawned ephemeral telemetry probe artifacts & shell tokens
      if (
        !name ||
        name === 'top' ||
        name === 'sh' ||
        name === '-m' ||
        name === '-n' ||
        name === 'cat' ||
        name === 'df' ||
        name === '"' ||
        name === "'" ||
        name.startsWith('top ') ||
        name.startsWith('sh -c') ||
        (name.length <= 1 && !/^[a-zA-Z0-9]$/.test(name))
      ) {
        continue;
      }

      // Extract CPU and memory
      let cpu = 0;
      let memMb = 0;

      // If header mappings exist
      if (colMap['CPU'] !== undefined && parts[colMap['CPU']]) {
        cpu = parseFloat(parts[colMap['CPU']]) || 0;
      }
      if (colMap['RES'] !== undefined && parts[colMap['RES']]) {
        const p = parts[colMap['RES']];
        const unit = p.slice(-1).toUpperCase();
        const val = parseFloat(p.slice(0, -1));
        if (unit === 'G') memMb = Math.round(val * 1024);
        else if (unit === 'M') memMb = Math.round(val);
        else if (unit === 'K') memMb = Math.round(val / 1024);
      }

      // Fallback heuristics if column map didn't resolve
      if (cpu === 0 && memMb === 0) {
        for (let i = 1; i < parts.length - 1; i++) {
          const p = parts[i];
          if (/^\d+\.\d+%?$/.test(p) && cpu === 0) {
            cpu = parseFloat(p);
          } else if (/^\d+(\.\d+)?[M|G|K]$/i.test(p) && memMb === 0) {
            const unit = p.slice(-1).toUpperCase();
            const val = parseFloat(p.slice(0, -1));
            if (unit === 'G') memMb = Math.round(val * 1024);
            else if (unit === 'M') memMb = Math.round(val);
            else if (unit === 'K') memMb = Math.round(val / 1024);
          }
        }
      }

      // Friendly state and app name
      let isSystem = name.startsWith('/system') || name.startsWith('[');
      let isPackage = name.includes('.');
      const appName = appLabelService.resolve(name);

      processes.push({
        pid,
        name: appName,
        appName,
        package: name,
        cpu: isNaN(cpu) ? 0 : cpu,
        memMb: isNaN(memMb) ? 0 : memMb,
        isSystem,
        isPackage
      });
    }

    // Sort by highest CPU and memory
    return processes.sort((a, b) => (b.cpu + b.memMb * 0.1) - (a.cpu + a.memMb * 0.1)).slice(0, 50);
  }

  /**
   * Fetch one-shot combined telemetry snapshot from TV via single ADB batch
   */
  async collectTelemetry() {
    if (!adbService.connected) {
      return null;
    }

    try {
      // Execute fast batch command via ADB in one single network hop
      const raw = await adbService.shell(
        'cat /proc/meminfo; echo "===CPU==="; cat /proc/stat; echo "===LOAD==="; cat /proc/loadavg; echo "===STORAGE==="; df -k /data; echo "===TOP==="; top -b -n 1 -m 20',
        4000
      );

      const parts = raw.split('===CPU===');
      const meminfoStr = parts[0] || '';

      const rest1 = parts[1] ? parts[1].split('===LOAD===') : ['', ''];
      const statStr = rest1[0] || '';

      const rest2 = rest1[1] ? rest1[1].split('===STORAGE===') : ['', ''];
      const loadStr = rest2[0] || '';

      const rest3 = rest2[1] ? rest2[1].split('===TOP===') : ['', ''];
      const dfStr = rest3[0] || '';
      const topStr = rest3[1] || '';

      const memory = this.parseMeminfo(meminfoStr);
      const cpu = this.parseCpuStat(statStr);
      const load = this.parseLoadavg(loadStr);
      const storage = this.parseStorage(dfStr);
      const processes = this.parseTop(topStr);

      const processTotalMb = processes.reduce((acc, p) => acc + (p.memMb || 0), 0);
      memory.processTotalMb = processTotalMb;

      this.lastTelemetry = {
        timestamp: Date.now(),
        device: adbService.deviceInfo,
        memory,
        cpu: {
          percent: cpu.cpuPercent,
          load1: load.load1,
          load5: load.load5,
          load15: load.load15
        },
        storage,
        processes
      };

      return this.lastTelemetry;
    } catch (err) {
      return null;
    }
  }

  /**
   * Adaptive Polling: Add active browser WebSocket subscriber
   */
  addSubscriber(ws) {
    this.subscribers.add(ws);
    // If first subscriber, start polling loop
    if (this.subscribers.size === 1) {
      this.startPolling();
    }
    // Send immediate cached snapshot if available
    if (this.lastTelemetry) {
      try {
        ws.send(JSON.stringify({ type: 'telemetry', data: this.lastTelemetry }));
      } catch (e) {}
    }
  }

  /**
   * Remove subscriber on connection close
   */
  removeSubscriber(ws) {
    this.subscribers.delete(ws);
    // If no more clients, STOP polling to guarantee zero TV load!
    if (this.subscribers.size === 0) {
      this.stopPolling();
    }
  }

  /**
   * Start periodic gentle poll
   */
  startPolling() {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(async () => {
      if (this.subscribers.size === 0 || !adbService.connected) return;
      const data = await this.collectTelemetry();
      if (data) {
        const payload = JSON.stringify({ type: 'telemetry', data });
        for (const client of this.subscribers) {
          if (client.readyState === 1) { // OPEN
            client.send(payload);
          }
        }
      }
    }, this.pollIntervalMs);
  }

  /**
   * Stop polling
   */
  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Change polling interval
   */
  setPollInterval(ms) {
    this.pollIntervalMs = Math.max(1000, Math.min(60000, ms));
    if (this.pollTimer) {
      this.stopPolling();
      this.startPolling();
    }
  }
}

module.exports = new TelemetryService();
