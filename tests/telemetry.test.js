/**
 * TvMaster - Telemetry Parsing & Edge Case Unit Tests
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const telemetryService = require('../src/services/telemetryService');

describe('TelemetryService Parsing Tests', () => {
  test('parseMeminfo with standard Android /proc/meminfo', () => {
    const sample = `
MemTotal:        2015984 kB
MemFree:          124560 kB
MemAvailable:     584320 kB
Buffers:           45120 kB
Cached:           412000 kB
Active:           980000 kB
`;
    const res = telemetryService.parseMeminfo(sample);
    assert.strictEqual(res.totalMb, 1969);
    assert.strictEqual(res.freeMb, 122);
    assert.strictEqual(res.availableMb, 571);
    assert.strictEqual(res.cachedMb, 446);
    assert.strictEqual(res.usedPercent, 71);
  });

  test('parseMeminfo handles null, empty string, or malformed text gracefully', () => {
    const res1 = telemetryService.parseMeminfo('');
    assert.strictEqual(res1.totalMb, 0);
    assert.strictEqual(res1.usedPercent, 0);

    const res2 = telemetryService.parseMeminfo(null);
    assert.strictEqual(res2.totalMb, 0);

    const res3 = telemetryService.parseMeminfo('GARBAGE_STRING_WITHOUT_MEMINFO_FIELDS');
    assert.strictEqual(res3.totalMb, 0);
  });

  test('parseCpuStat calculates delta correctly over two samples', () => {
    // Reset previous ticks
    telemetryService.prevCpuTicks = null;

    const tick1 = 'cpu  1000 0 1000 8000 0 0 0 0 0 0\ncpu0 500 0 500 4000 0 0 0 0 0 0';
    const res1 = telemetryService.parseCpuStat(tick1);
    assert.strictEqual(res1.cpuPercent, 0); // First tick has no baseline

    // Second tick: +200 active, +800 idle (total +1000) -> 20% CPU
    const tick2 = 'cpu  1100 0 1100 8800 0 0 0 0 0 0\ncpu0 550 0 550 4400 0 0 0 0 0 0';
    const res2 = telemetryService.parseCpuStat(tick2);
    assert.strictEqual(res2.cpuPercent, 20);
  });

  test('parseLoadavg parses 1m, 5m, 15m load', () => {
    const sample = '1.84 1.45 1.12 2/780 12345\n';
    const res = telemetryService.parseLoadavg(sample);
    assert.strictEqual(res.load1, 1.84);
    assert.strictEqual(res.load5, 1.45);
    assert.strictEqual(res.load15, 1.12);

    const empty = telemetryService.parseLoadavg('');
    assert.strictEqual(empty.load1, 0);
  });

  test('parseStorage parses df /data correctly', () => {
    const sample = `
Filesystem     1K-blocks    Used Available Use% Mounted on
/dev/block/dm-0  11453440 8214220   3239220  72% /data
`;
    const res = telemetryService.parseStorage(sample);
    assert.strictEqual(res.totalGb, 10.9);
    assert.strictEqual(res.usedGb, 7.8);
    assert.strictEqual(res.freeGb, 3.1);
    assert.strictEqual(res.usedPercent, 72);
  });

  test('parseTop parses processes from top output', () => {
    const sample = `
PID USER         PR  NI VIRT  RES  SHR S[%CPU] %MEM     TIME+ ARGS
3421 u0_a45       20   0 1.4G 384M  64M S 14.2  19.0  12:34.56 com.google.android.youtube.tv
1890 system       20   0 1.2G 226M  45M S  3.8  11.2   5:20.10 com.google.android.tvlauncher
4510 u0_a22       20   0 900M 145M  32M S  0.1   7.2   1:10.05 com.netflix.ninja
`;
    const list = telemetryService.parseTop(sample);
    assert.strictEqual(list.length, 3);
    assert.strictEqual(list[0].pid, 3421);
    assert.strictEqual(list[0].package, 'com.google.android.youtube.tv');
    assert.strictEqual(list[0].cpu, 14.2);
    assert.strictEqual(list[0].memMb, 384);
  });

  test('Adaptive polling lifecycle starts and stops based on subscribers', () => {
    const dummyWs = { readyState: 1, send: () => {} };
    telemetryService.subscribers.clear();
    telemetryService.stopPolling();

    assert.strictEqual(telemetryService.pollTimer, null);

    telemetryService.addSubscriber(dummyWs);
    assert.notStrictEqual(telemetryService.pollTimer, null);

    telemetryService.removeSubscriber(dummyWs);
    assert.strictEqual(telemetryService.pollTimer, null);
  });
});
