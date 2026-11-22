/**
 * TvMaster - Main Server Entrypoint
 * Express API + WebSocket Telemetry Hub
 * Release: v1.0.0
 */

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const cors = require('cors');
const multer = require('multer');
const { WebSocketServer } = require('ws');

const CONFIG_FILE = path.join(__dirname, '../data/config.json');

function getSavedConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {}
  return {};
}

function saveConfig(data) {
  try {
    const dir = path.dirname(CONFIG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const current = getSavedConfig();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...current, ...data }, null, 2), 'utf8');
  } catch (e) {}
}

// Configure temporary upload storage for APK installation
const uploadDir = path.join(os.tmpdir(), 'tvmaster-uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.apk';
    const safeName = `tvmaster-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 } // Support up to 500MB APKs
});

const {
  APP_NAME,
  APP_VERSION,
  DEFAULT_PORT,
  REGEX_IPV4,
  printStartupBanner
} = require('./constants');

const adbService = require('./services/adbService');
const discoveryService = require('./services/discoveryService');
const telemetryService = require('./services/telemetryService');
const deviceService = require('./services/deviceService');

const processController = require('./controllers/processController');
const tuningController = require('./controllers/tuningController');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// --- API Endpoints ---

// Healthcheck & Version Info
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: APP_NAME,
    version: APP_VERSION,
    connected: adbService.connected,
    activeSubscribers: telemetryService.subscribers.size
  });
});

// Device Connection Status
app.get('/api/status', (req, res) => {
  const config = getSavedConfig();
  res.json({
    connected: adbService.connected,
    deviceIp: adbService.deviceIp,
    devicePort: adbService.devicePort,
    deviceInfo: adbService.deviceInfo,
    savedIp: config.lastIp || process.env.TV_IP || '',
    activeDevice: adbService.connected ? deviceService.getDeviceByIp(adbService.deviceIp) : null
  });
});

// Connect to TV or Streaming Device
app.post('/api/connect', async (req, res) => {
  try {
    const { ip, port, name, deviceType } = req.body;
    const result = await adbService.connect(ip, port);
    saveConfig({ lastIp: ip, lastPort: port || 5555 });
    
    // Automatically save or update device profile in cards
    const devInfo = adbService.deviceInfo || {};
    deviceService.addOrUpdateDevice({
      ip,
      port: port || 5555,
      name,
      model: devInfo.model,
      manufacturer: devInfo.manufacturer,
      androidVersion: devInfo.androidVersion,
      apiLevel: devInfo.apiLevel,
      screenResolution: devInfo.screenResolution,
      displaySpecs: devInfo.displaySpecs,
      deviceType
    });

    // Request immediate telemetry update
    await telemetryService.collectTelemetry();
    res.json({ ...result, devices: deviceService.getDevices(ip) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Disconnect from TV
app.post('/api/disconnect', async (req, res) => {
  try {
    const result = await adbService.disconnect();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- TV Device Profiles & 1-Click Card Switching ---

// Get static display & video capabilities (Zero Recurring Load)
app.get('/api/device/display', async (req, res) => {
  try {
    if (!adbService.connected) {
      return res.status(400).json({ error: 'No device currently connected' });
    }
    const force = req.query.refresh === 'true';
    const specs = await adbService.getDisplaySpecs(force);
    return res.json({
      success: true,
      deviceIp: adbService.deviceIp,
      deviceInfo: adbService.deviceInfo,
      displaySpecs: specs
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Get all saved TV profiles with active flag
app.get('/api/devices', (req, res) => {
  const activeIp = adbService.connected ? adbService.deviceIp : null;
  if (activeIp && !deviceService.getDeviceByIp(activeIp)) {
    const devInfo = adbService.deviceInfo || {};
    deviceService.addOrUpdateDevice({
      ip: activeIp,
      port: adbService.devicePort || 5555,
      model: devInfo.model,
      manufacturer: devInfo.manufacturer,
      androidVersion: devInfo.androidVersion,
      apiLevel: devInfo.apiLevel,
      screenResolution: devInfo.screenResolution,
      displaySpecs: devInfo.displaySpecs
    });
  }
  res.json({
    activeIp,
    devices: deviceService.getDevices(activeIp)
  });
});

// Switch active TV profile in 1 click
app.post('/api/devices/switch', async (req, res) => {
  try {
    const { ip, port, name, deviceType } = req.body;
    if (!ip || !REGEX_IPV4.test(ip)) {
      return res.status(400).json({ error: 'Valid TV IP address required' });
    }
    const targetPort = port ? parseInt(port, 10) : 5555;

    // Disconnect currently active device if any
    if (adbService.connected) {
      try {
        await adbService.disconnect();
      } catch (e) {}
    }

    // Connect to target device
    const connectRes = await adbService.connect(ip, targetPort);
    if (connectRes.success) {
      const devInfo = adbService.deviceInfo || {};
      const saved = deviceService.addOrUpdateDevice({
        ip,
        port: targetPort,
        name: name || (devInfo.model ? `${devInfo.manufacturer || ''} ${devInfo.model}`.trim() : `Android TV (${ip})`),
        model: devInfo.model,
        manufacturer: devInfo.manufacturer,
        androidVersion: devInfo.androidVersion,
        apiLevel: devInfo.apiLevel,
        screenResolution: devInfo.screenResolution,
        displaySpecs: devInfo.displaySpecs,
        deviceType: deviceType || ''
      });
      saveConfig({ lastIp: ip, lastPort: targetPort });
      await telemetryService.collectTelemetry();
      return res.json({
        success: true,
        message: `Switched to ${saved.name}`,
        activeDevice: saved,
        devices: deviceService.getDevices(ip)
      });
    } else {
      return res.status(400).json({ error: connectRes.error || 'Connection failed' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Add a TV card profile
app.post('/api/devices', (req, res) => {
  try {
    const { ip, port, name } = req.body;
    if (!ip || !REGEX_IPV4.test(ip)) {
      return res.status(400).json({ error: 'Valid TV IP address required' });
    }
    const saved = deviceService.addOrUpdateDevice({
      ip,
      port: port ? parseInt(port, 10) : 5555,
      name
    });
    return res.json({
      success: true,
      device: saved,
      devices: deviceService.getDevices(adbService.connected ? adbService.deviceIp : null)
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Rename TV card profile
app.put('/api/devices/rename', (req, res) => {
  try {
    const { ip, name } = req.body;
    if (!ip || !name) {
      return res.status(400).json({ error: 'IP and Name are required' });
    }
    const ok = deviceService.renameDevice(ip, name);
    if (ok) {
      return res.json({
        success: true,
        message: 'TV renamed',
        devices: deviceService.getDevices(adbService.connected ? adbService.deviceIp : null)
      });
    }
    return res.status(404).json({ error: 'TV device not found' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Delete TV card profile
app.delete('/api/devices/:ip', (req, res) => {
  try {
    const { ip } = req.params;
    const ok = deviceService.removeDevice(ip);
    if (ok) {
      return res.json({
        success: true,
        message: 'TV removed from cards',
        devices: deviceService.getDevices(adbService.connected ? adbService.deviceIp : null)
      });
    }
    return res.status(404).json({ error: 'TV device not found' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Network Auto-Discovery (Enhanced for Docker bridges & multi-subnets)
app.get('/api/discover', async (req, res) => {
  try {
    const customSubnet = req.query.subnet;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const hostHeader = req.headers.host;
    const savedSubnets = deviceService.getDeviceSubnets();
    const candidateIps = [clientIp, hostHeader, ...savedSubnets].filter(Boolean);

    const devices = await discoveryService.scanNetwork(customSubnet, candidateIps);
    const enriched = devices.map((d) => {
      const known = deviceService.getDeviceByIp(d.ip);
      return {
        ...d,
        name: known ? known.name : d.name,
        model: known ? known.model : 'Android TV',
        isKnown: Boolean(known)
      };
    });
    res.json({
      detectedSubnets: discoveryService.resolveSubnets(candidateIps),
      devices: enriched
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Process Management
app.post('/api/process/kill', (req, res) => processController.killProcess(req, res));
app.post('/api/process/flush-ram', (req, res) => processController.flushRam(req, res));
app.get('/api/packages', (req, res) => processController.listPackages(req, res));
app.post('/api/package/freeze', (req, res) => processController.freezePackage(req, res));
app.post('/api/package/unfreeze', (req, res) => processController.unfreezePackage(req, res));
app.post('/api/package/uninstall', (req, res) => processController.uninstallPackage(req, res));
app.post('/api/package/clear-data', (req, res) => processController.clearAppData(req, res));
app.post('/api/package/launch', (req, res) => processController.launchPackage(req, res));
app.post('/api/package/install', upload.single('apk'), (req, res) => processController.installApk(req, res));

// System Tuning & Remote
app.get('/api/tuning/animation-scale', (req, res) => tuningController.getAnimationScale(req, res));
app.post('/api/tuning/animation-scale', (req, res) => tuningController.setAnimationScale(req, res));
app.post('/api/remote/key', (req, res) => tuningController.sendRemoteKey(req, res));
app.post('/api/remote/text', (req, res) => tuningController.sendRemoteText(req, res));
app.post('/api/remote/reboot', (req, res) => tuningController.reboot(req, res));

// --- WebSocket Handling for Zero-Load Adaptive Telemetry ---
wss.on('connection', (ws) => {
  telemetryService.addSubscriber(ws);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'set_interval') {
        telemetryService.setPollInterval(data.intervalMs);
      } else if (data.type === 'refresh_now') {
        const snapshot = await telemetryService.collectTelemetry();
        if (snapshot && ws.readyState === 1) {
          ws.send(JSON.stringify({ type: 'telemetry', data: snapshot }));
        }
      }
    } catch (e) {
      // Ignore malformed messages
    }
  });

  ws.on('close', () => {
    telemetryService.removeSubscriber(ws);
  });
});

// Export app and server for testing
module.exports = { app, server };

// Start listening if run directly
if (require.main === module) {
  server.listen(DEFAULT_PORT, async () => {
    printStartupBanner();

    const config = getSavedConfig();
    const savedDevs = deviceService.getDevices();
    const targetIp = process.env.TV_IP || config.lastIp || (savedDevs.length > 0 ? savedDevs[0].ip : null);
    const targetPort = config.lastPort || (savedDevs.length > 0 ? savedDevs[0].port : 5555);

    // Auto-connect to configured TV_IP or previously saved TV IP
    if (targetIp) {
      console.log(`[TvMaster] Auto-connecting to saved TV IP: ${targetIp}:${targetPort}...`);
      try {
        await adbService.connect(targetIp, targetPort);
        console.log(`[TvMaster] Connected successfully to ${targetIp}:${targetPort}`);
        const devInfo = adbService.deviceInfo || {};
        deviceService.addOrUpdateDevice({
          ip: targetIp,
          port: targetPort,
          model: devInfo.model,
          manufacturer: devInfo.manufacturer,
          androidVersion: devInfo.androidVersion,
          apiLevel: devInfo.apiLevel,
          screenResolution: devInfo.screenResolution
        });
        await telemetryService.collectTelemetry();
      } catch (err) {
        console.warn(`[TvMaster] Auto-connect attempt failed: ${err.message}`);
      }
    }
  });
}
