/**
 * TvMaster - Streaming Device & TV Management Service
 * Manages multiple Android TV, Fire TV, and Streaming Device profiles, persistent cards, active selection & switching
 */

const fs = require('fs');
const path = require('path');

const DEVICES_FILE = path.join(__dirname, '../../data/devices.json');
const CONFIG_FILE = path.join(__dirname, '../../data/config.json');

/**
 * Classify streaming device type based on manufacturer, model, and name
 */
function classifyDevice(model = '', manufacturer = '', name = '', explicitType = '') {
  if (explicitType) {
    const map = {
      firestick: { type: 'firestick', label: 'Amazon Fire TV / Stick', icon: '🔥' },
      shield: { type: 'shield', label: 'NVIDIA Shield TV', icon: '🛡️' },
      chromecast: { type: 'chromecast', label: 'Google Chromecast', icon: '⚪' },
      projector: { type: 'projector', label: 'Smart Projector', icon: '📽️' },
      box: { type: 'box', label: 'Streaming Box', icon: '📦' },
      tv: { type: 'tv', label: 'Smart TV', icon: '📺' }
    };
    if (map[explicitType]) return map[explicitType];
  }

  const combined = `${manufacturer} ${model} ${name}`.toLowerCase();
  if (combined.includes('amazon') || combined.includes('fire') || combined.includes('aft')) {
    return { type: 'firestick', label: 'Amazon Fire TV / Stick', icon: '🔥' };
  }
  if (combined.includes('shield')) {
    return { type: 'shield', label: 'NVIDIA Shield TV', icon: '🛡️' };
  }
  if (combined.includes('chromecast') || combined.includes('sabrina')) {
    return { type: 'chromecast', label: 'Google Chromecast', icon: '⚪' };
  }
  if (combined.includes('projector') || combined.includes('xgimi') || combined.includes('formovie') || combined.includes('nebula') || combined.includes('dangbei')) {
    return { type: 'projector', label: 'Smart Projector', icon: '📽️' };
  }
  if (combined.includes('box') || combined.includes('onn') || combined.includes('mecool') || combined.includes('minix')) {
    return { type: 'box', label: 'Streaming Box', icon: '📦' };
  }
  return { type: 'tv', label: 'Smart TV', icon: '📺' };
}

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
              name: 'My Streaming Device'
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
    const list = this.devices.map((d) => {
      const classification = classifyDevice(d.model, d.manufacturer, d.name, d.deviceType);
      return {
        ...d,
        deviceType: d.deviceType || classification.type,
        deviceTypeLabel: d.deviceTypeLabel || classification.label,
        deviceIcon: d.deviceIcon || classification.icon,
        isActive: Boolean(activeIp && d.ip === activeIp)
      };
    });

    // Auto-heal: If activeIp is known connected but not yet registered in disk devices, inject it dynamically
    if (activeIp && !list.some((d) => d.ip === activeIp)) {
      const classification = classifyDevice('', '', 'Connected Device');
      list.unshift({
        id: `${activeIp}:5555`,
        ip: activeIp,
        port: 5555,
        name: `Connected Device (${activeIp})`,
        model: 'Android Device',
        manufacturer: '',
        androidVersion: '',
        apiLevel: '',
        screenResolution: '',
        deviceType: classification.type,
        deviceTypeLabel: classification.label,
        deviceIcon: classification.icon,
        lastSeen: new Date().toISOString(),
        isActive: true
      });
    }

    return list;
  }

  getDeviceByIp(ip) {
    return this.devices.find((d) => d.ip === ip);
  }

  addOrUpdateDevice({ ip, port = 5555, name, model, manufacturer, androidVersion, apiLevel, screenResolution, deviceType }) {
    if (!ip) return null;
    const cleanIp = String(ip).trim();
    const cleanPort = parseInt(port, 10) || 5555;
    const id = `${cleanIp}:${cleanPort}`;

    const classification = classifyDevice(model, manufacturer, name, deviceType);

    let existing = this.devices.find((d) => d.ip === cleanIp && d.port === cleanPort);
    if (existing) {
      if (name && name.trim()) existing.name = name.trim();
      if (model) existing.model = model;
      if (manufacturer) existing.manufacturer = manufacturer;
      if (androidVersion) existing.androidVersion = androidVersion;
      if (apiLevel) existing.apiLevel = apiLevel;
      if (screenResolution) existing.screenResolution = screenResolution;
      existing.deviceType = deviceType || classification.type;
      existing.deviceTypeLabel = classification.label;
      existing.deviceIcon = classification.icon;
      existing.lastSeen = new Date().toISOString();
    } else {
      const fallbackName = model ? `${manufacturer || ''} ${model}`.trim() : `${classification.label} (${cleanIp})`;
      existing = {
        id,
        ip: cleanIp,
        port: cleanPort,
        name: name && name.trim() ? name.trim() : fallbackName,
        model: model || classification.label,
        manufacturer: manufacturer || '',
        androidVersion: androidVersion || '',
        apiLevel: apiLevel || '',
        screenResolution: screenResolution || '',
        deviceType: deviceType || classification.type,
        deviceTypeLabel: classification.label,
        deviceIcon: classification.icon,
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
      const classification = classifyDevice(dev.model, dev.manufacturer, dev.name, dev.deviceType);
      dev.deviceType = classification.type;
      dev.deviceTypeLabel = classification.label;
      dev.deviceIcon = classification.icon;
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
module.exports.classifyDevice = classifyDevice;

