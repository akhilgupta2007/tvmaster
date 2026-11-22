/**
 * TvMaster - TV Device Management & Switching Unit Tests
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const deviceService = require('../src/services/deviceService');
const discoveryService = require('../src/services/discoveryService');
const { server } = require('../src/server');

const TEST_PORT = 3198;
const baseUrl = `http://localhost:${TEST_PORT}`;

describe('TvMaster Device Management & Multi-TV Switching Tests', () => {
  before((done) => {
    server.listen(TEST_PORT, done);
  });

  after((done) => {
    server.close(done);
  });

  test('DeviceService: adds, renames, retrieves, and removes devices', () => {
    // Add device
    const dev = deviceService.addOrUpdateDevice({
      ip: '10.0.0.99',
      port: 5555,
      name: 'Test Living Room TV',
      model: 'SmartTV 4K',
      manufacturer: 'Hisense'
    });
    assert.strictEqual(dev.ip, '10.0.0.99');
    assert.strictEqual(dev.name, 'Test Living Room TV');

    // Retrieve
    const found = deviceService.getDeviceByIp('10.0.0.99');
    assert.ok(found);
    assert.strictEqual(found.model, 'SmartTV 4K');

    // Rename
    const renamed = deviceService.renameDevice('10.0.0.99', 'Renamed Cinema TV');
    assert.strictEqual(renamed, true);
    assert.strictEqual(deviceService.getDeviceByIp('10.0.0.99').name, 'Renamed Cinema TV');

    // Subnets
    const subnets = deviceService.getDeviceSubnets();
    assert.ok(subnets.includes('10.0.0'));

    // Remove
    const removed = deviceService.removeDevice('10.0.0.99');
    assert.strictEqual(removed, true);
    assert.strictEqual(deviceService.getDeviceByIp('10.0.0.99'), undefined);
  });

  test('API: GET /api/devices returns saved devices array', async () => {
    const res = await fetch(`${baseUrl}/api/devices`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.devices));
  });

  test('Security: POST /api/devices/switch rejects malformed IP injection', async () => {
    const malicious = [
      '10.0.0.1; rm -rf /',
      '127.0.0.1 && cat /etc/passwd',
      'not_an_ip',
      '999.999.999.999'
    ];

    for (const ip of malicious) {
      const res = await fetch(`${baseUrl}/api/devices/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port: 5555 })
      });
      assert.strictEqual(res.status, 400, `Expected 400 for malicious switch IP: ${ip}`);
    }
  });

  test('API: POST /api/devices/switch handles deviceType without ReferenceError', async () => {
    // Attempt switch to an unreachable test IP: should fail with 400 Connection failed, NOT 500 ReferenceError
    const res = await fetch(`${baseUrl}/api/devices/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip: '127.0.0.1', port: 5556, name: 'Test Device', deviceType: 'firestick' })
    });
    const data = await res.json();
    assert.notStrictEqual(data.error, 'deviceType is not defined');
  });

  test('DiscoveryService: extracts subnets from diverse candidate hints and interfaces', () => {
    const s1 = discoveryService.extractSubnet('10.0.0.131:3055');
    assert.strictEqual(s1, '10.0.0');

    const s2 = discoveryService.extractSubnet('192.168.1.50');
    assert.strictEqual(s2, '192.168.1');

    const s3 = discoveryService.extractSubnet('::ffff:10.0.0.22');
    assert.strictEqual(s3, '10.0.0');

    const subs = discoveryService.resolveSubnets(['10.0.0.13', '10.0.0.131:3055']);
    assert.ok(subs.includes('10.0.0'));
  });

  test('API: GET /api/discover handles custom subnet parameter gracefully', async () => {
    // Scan a single dummy subnet with immediate return
    const res = await fetch(`${baseUrl}/api/discover?subnet=127.0.0`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.devices));
    assert.ok(Array.isArray(data.detectedSubnets));
  });

  test('DeviceService: accurately classifies Amazon Fire TV, Shield, Chromecast, and TV', () => {
    const { classifyDevice } = require('../src/services/deviceService');
    const fire = classifyDevice('AFTMM', 'Amazon', 'Living Room Firestick');
    assert.strictEqual(fire.type, 'firestick');
    assert.strictEqual(fire.icon, '🔥');

    const shield = classifyDevice('SHIELD Android TV', 'NVIDIA');
    assert.strictEqual(shield.type, 'shield');
    assert.strictEqual(shield.icon, '🛡️');

    const cc = classifyDevice('Chromecast', 'Google');
    assert.strictEqual(cc.type, 'chromecast');
    assert.strictEqual(cc.icon, '⚪');

    const proj = classifyDevice('Horizon Pro', 'XGIMI');
    assert.strictEqual(proj.type, 'projector');
    assert.strictEqual(proj.icon, '📽️');

    const tv = classifyDevice('SmartTV 4K FFM', 'Hisense');
    assert.strictEqual(tv.type, 'tv');
    assert.strictEqual(tv.icon, '📺');
  });

  test('DeviceService: getDevices auto-heals and injects active device if missing from disk', () => {
    const list = deviceService.getDevices('10.99.88.77');
    const active = list.find((d) => d.ip === '10.99.88.77');
    assert.ok(active);
    assert.strictEqual(active.isActive, true);
  });

  test('AdbService: disconnect clears deviceIp and resets deviceInfo to clean defaults', async () => {
    const adb = require('../src/services/adbService');
    adb.connected = true;
    adb.deviceIp = '10.0.0.13';
    adb.deviceInfo = { model: 'Old Model', manufacturer: 'Old Brand' };

    await adb.disconnect();
    assert.strictEqual(adb.connected, false);
    assert.strictEqual(adb.deviceIp, null);
    assert.strictEqual(adb.deviceInfo.model, 'Unknown Device');
    assert.strictEqual(adb.deviceInfo.manufacturer, 'Unknown');
  });

  test('TelemetryService: reset and broadcast handle switching gracefully', () => {
    const telemetry = require('../src/services/telemetryService');
    telemetry.prevCpuTicks = { total: 100, active: 50 };
    telemetry.prevCoreTicks = { cpu0: { total: 50, active: 25 } };
    telemetry.lastTelemetry = { timestamp: Date.now() };

    telemetry.reset();
    assert.strictEqual(telemetry.prevCpuTicks, null);
    assert.strictEqual(telemetry.prevCoreTicks, null);
    assert.strictEqual(telemetry.lastTelemetry, null);

    // Broadcast with dummy ws client
    let received = null;
    const mockWs = {
      readyState: 1,
      send: (str) => { received = JSON.parse(str); }
    };
    telemetry.subscribers.add(mockWs);
    telemetry.broadcast({ test: true, deviceIp: '10.0.0.14' });
    telemetry.subscribers.delete(mockWs);

    assert.ok(received);
    assert.strictEqual(received.type, 'telemetry');
    assert.strictEqual(received.data.deviceIp, '10.0.0.14');
  });
});
