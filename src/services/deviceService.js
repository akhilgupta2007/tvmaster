/**
 * TvMaster - TV Device Management Service
 * Manages multiple Android TV profiles, persistent cards, active selection & switching
 */

const fs = require('fs');
const path = require('path');

const DEVICES_FILE = path.join(__dirname, '../../data/devices.json');
const CONFIG_FILE = path.join(__dirname, '../../data/config.json');

class DeviceService {
  constructor() {
    this.devices = [];
    this.activeId = null;
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(DEVICES_FILE)) {
        const raw = fs.readFileSync(DEVICES_FILE, 'utf8');
        this.devices = JSON.parse(raw);
      }
    } catch (e) {
      this.devices = [];
    }

    // Check config.json for lastIp if devices list is empty
    if (this.devices.length === 0) {
      try {
        if (fs.existsSync(CONFIG_FILE)) {
          const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
          if (cfg.lastIp) {
            this.addOrUpdateDevice({
              ip: cfg.lastIp,
              port: cfg.lastPort || 5555,
              name: 'My Android TV'
            });
          }
        }
      } catch (e) {}
    }
  }

  saveToDisk() {
    try {
      const dir = path.dirname(DEVICES_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DEVICES_FILE, JSON.stringify(this.devices, null, 2), 'utf8');
    } catch (e) {}
  }

  getDevices(activeIp = null) {
    return this.devices.map((d) => ({
      ...d,
      isActive: Boolean(activeIp && d.ip === activeIp)
    }));
  }

  getDeviceByIp(ip) {
    return this.devices.find((d) => d.ip === ip);
  }

  addOrUpdateDevice({ ip, port = 5555, name, model, manufacturer, androidVersion, apiLevel, screenResolution }) {
    if (!ip) return null;
    const cleanIp = String(ip).trim();
    const cleanPort = parseInt(port, 10) || 5555;
    const id = `${cleanIp}:${cleanPort}`;

    let existing = this.devices.find((d) => d.ip === cleanIp && d.port === cleanPort);
    if (existing) {
      if (name && name.trim()) existing.name = name.trim();
      if (model) existing.model = model;
      if (manufacturer) existing.manufacturer = manufacturer;
      if (androidVersion) existing.androidVersion = androidVersion;
      if (apiLevel) existing.apiLevel = apiLevel;
      if (screenResolution) existing.screenResolution = screenResolution;
      existing.lastSeen = new Date().toISOString();
    } else {
      const fallbackName = model ? `${manufacturer || ''} ${model}`.trim() : `Android TV (${cleanIp})`;
      existing = {
        id,
        ip: cleanIp,
        port: cleanPort,
        name: name && name.trim() ? name.trim() : fallbackName,
        model: model || 'Android TV',
        manufacturer: manufacturer || '',
        androidVersion: androidVersion || '',
        apiLevel: apiLevel || '',
        screenResolution: screenResolution || '',
        lastSeen: new Date().toISOString()
      };
      this.devices.push(existing);
    }

    this.saveToDisk();
    return existing;
  }

  renameDevice(ip, newName) {
    if (!ip || !newName) return false;
    const cleanName = String(newName).trim();
    const dev = this.devices.find((d) => d.ip === ip);
    if (dev) {
      dev.name = cleanName;
      this.saveToDisk();
      return true;
    }
    return false;
  }

  removeDevice(ip) {
    const initialLen = this.devices.length;
    this.devices = this.devices.filter((d) => d.ip !== ip);
    if (this.devices.length !== initialLen) {
      this.saveToDisk();
      return true;
    }
    return false;
  }

  /**
   * Get all subnets associated with saved devices (e.g. ['10.0.0'])
   */
  getDeviceSubnets() {
    const subnets = new Set();
    for (const dev of this.devices) {
      if (dev.ip) {
        const parts = dev.ip.split('.');
        if (parts.length === 4) {
          subnets.add(`${parts[0]}.${parts[1]}.${parts[2]}`);
        }
      }
    }
    return Array.from(subnets);
  }
}

module.exports = new DeviceService();
