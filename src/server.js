/**
 * TvMaster - Main Server Entrypoint
 * Express API + WebSocket Telemetry Hub
 * Release: v1.0.0
 */

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { WebSocketServer } = require('ws');

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
  res.json({
    connected: adbService.connected,
    deviceIp: adbService.deviceIp,
    devicePort: adbService.devicePort,
    deviceInfo: adbService.deviceInfo
  });
});

// Connect to TV
app.post('/api/connect', async (req, res) => {
  try {
    const { ip, port } = req.body;
    const result = await adbService.connect(ip, port);
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

    // Check optional TV_IP environment variable for auto-connect
    if (process.env.TV_IP) {
      console.log(`[TvMaster] Auto-connecting to configured TV IP: ${process.env.TV_IP}...`);
      try {
        await adbService.connect(process.env.TV_IP);
        console.log(`[TvMaster] Connected successfully to ${process.env.TV_IP}`);
      } catch (err) {
        console.warn(`[TvMaster] Auto-connect attempt failed: ${err.message}`);
      }
    }
  });
}
