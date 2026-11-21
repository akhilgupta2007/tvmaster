/**
 * TvMaster - Comprehensive Adversarial Penetration & Monkey Fuzzing Test Suite
 * Evaluates Command Injection, Prototype Pollution, Extreme Numeric Boundaries,
 * Type Confusion, Massive Payloads, and Unicode Fuzzing
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const { app, server } = require('../src/server');

const TEST_PORT = 3299;
const baseUrl = `http://localhost:${TEST_PORT}`;

describe('TvMaster Adversarial Penetration & Fuzzing Suite', () => {
  before((done) => {
    server.listen(TEST_PORT, done);
  });

  after((done) => {
    server.close(done);
  });

  // --- Category 1: Prototype Pollution & Type Confusion ---
  test('Security: Prototype pollution attacks via JSON payloads', async () => {
    const maliciousPayloads = [
      { __proto__: { isAdmin: true }, package: 'com.test' },
      { constructor: { prototype: { polluted: true } }, package: 'com.test' }
    ];

    for (const body of maliciousPayloads) {
      const res = await fetch(`${baseUrl}/api/process/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      // Prototype should never be modified
      assert.strictEqual(({}).isAdmin, undefined);
      assert.strictEqual(({}).polluted, undefined);
    }
  });

  test('Security: Type confusion with arrays and objects in place of strings', async () => {
    const confusions = [
      { package: ['com.google.android.youtube', 'evil'] },
      { package: { nested: 'package' } },
      { package: true },
      { package: 12345 }
    ];

    for (const body of confusions) {
      const res = await fetch(`${baseUrl}/api/process/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      assert.strictEqual(res.status, 400, 'Expected 400 rejection on type confusion');
    }
  });

  // --- Category 2: Extreme Numeric Boundaries & Fuzzing ---
  test('Fuzz: Extreme numeric boundaries for animation scale', async () => {
    const extremeNumbers = [
      'Infinity',
      '-Infinity',
      'NaN',
      '1e309',
      '-0',
      '0.0000000001',
      '-1',
      '999999999',
      '0.5.5',
      '0,5'
    ];

    for (const scale of extremeNumbers) {
      const res = await fetch(`${baseUrl}/api/tuning/animation-scale`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scale })
      });
      assert.strictEqual(res.status, 400, `Expected rejection for extreme number: ${scale}`);
    }
  });

  // --- Category 3: Massive Payloads & Buffer Limits ---
  test('Fuzz: 50KB massive string payload handling without crash', async () => {
    const massiveString = 'A'.repeat(50 * 1024);

    const res = await fetch(`${baseUrl}/api/process/kill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package: massiveString })
    });
    // Must be rejected by regex safely without memory exhaustion
    assert.strictEqual(res.status, 400);
  });

  // --- Category 4: Unicode, RTL Overrides & Emojis ---
  test('Fuzz: Unicode, RTL characters, and emoji injection in package & keys', async () => {
    const unicodeStrings = [
      'com.test.\u202E\u0041\u0042', // RTL override
      'com.app.🔥📦💰', // Emojis
      '\u0000nullbyte', // Null byte
      'com.app\uFEFFbom', // Zero-width BOM
      'KEYCODE_\u0000_KILL'
    ];

    for (const str of unicodeStrings) {
      const res = await fetch(`${baseUrl}/api/process/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: str })
      });
      assert.strictEqual(res.status, 400, `Expected 400 on unicode string: ${str}`);
    }
  });

  // --- Category 5: Path Traversal & Static Asset Boundary ---
  test('Security: Directory traversal prevention on static file server', async () => {
    const traversalPaths = [
      '/../../package.json',
      '/%2e%2e/%2e%2e/src/server.js',
      '/....//....//etc/passwd',
      '/..\\..\\windows\\win.ini'
    ];

    for (const p of traversalPaths) {
      const res = await fetch(`${baseUrl}${p}`);
      // Must not return source code or sensitive config files
      assert.notStrictEqual(res.status, 200);
    }
  });

  // --- Category 6: Route Bleed & Unmapped API Endpoints ---
  test('Security: Non-existent API routes return 404, not HTML bleed', async () => {
    const res = await fetch(`${baseUrl}/api/non_existent_endpoint_12345`);
    assert.strictEqual(res.status, 404);
  });

  // --- Category 7: Concurrent Rapid Operations Stress ---
  test('Stress: 20 rapid concurrent requests do not deadlock server', async () => {
    const requests = Array.from({ length: 20 }, () => fetch(`${baseUrl}/api/health`));
    const responses = await Promise.all(requests);

    for (const res of responses) {
      assert.strictEqual(res.status, 200);
      const data = await res.json();
      assert.strictEqual(data.status, 'ok');
    }
  });
});
