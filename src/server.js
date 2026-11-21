/**
 * TvMaster - Main Server Entrypoint
 * Express API + WebSocket Telemetry Hub
 * Release: v1.0.0
 */

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
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
const upload = multer({
  dest: '/tmp/tvmaster-uploads/',
  limits: { fileSize: 500 * 1024 * 1024 } // Support up to 500MB APKs
});

const {
  APP_NAME,
  APP_VERSION,
  DEFAULT_PORT,
  printStartupBanner
} = require('./constants');

const adbService = require('./services/adbService');
const discoveryService = require('./services/discoveryService');
const telemetryService = require('./services/telemetryService');

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
    savedIp: config.lastIp || process.env.TV_IP || ''
  });
});

// Connect to TV
app.post('/api/connect', async (req, res) => {
  try {
    const { ip, port } = req.body;
    const result = await adbService.connect(ip, port);
    saveConfig({ lastIp: ip, lastPort: port || 5555 });
    // Request immediate telemetry update
    await telemetryService.collectTelemetry();
    res.json(result);
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

// Network Auto-Discovery
app.get('/api/discover', async (req, res) => {
  try {
    const devices = await discoveryService.scanNetwork();
    res.json({ devices });
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
    const targetIp = process.env.TV_IP || config.lastIp;
    const targetPort = config.lastPort || 5555;

    // Auto-connect to configured TV_IP or previously saved TV IP
    if (targetIp) {
      console.log(`[TvMaster] Auto-connecting to saved TV IP: ${targetIp}:${targetPort}...`);
      try {
        await adbService.connect(targetIp, targetPort);
        console.log(`[TvMaster] Connected successfully to ${targetIp}:${targetPort}`);
        await telemetryService.collectTelemetry();
      } catch (err) {
        console.warn(`[TvMaster] Auto-connect attempt failed: ${err.message}`);
      }
    }
  });
}
