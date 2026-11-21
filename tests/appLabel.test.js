/**
 * TvMaster - App Label Resolution Unit Tests
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const appLabelService = require('../src/services/appLabelService');
const telemetryService = require('../src/services/telemetryService');

describe('AppLabelService Tests', () => {
  test('Decodes known streaming and TV apps correctly', () => {
    assert.strictEqual(appLabelService.resolve('com.google.android.youtube.tv'), 'YouTube');
    assert.strictEqual(appLabelService.resolve('org.smarttube.stable'), 'SmartTube');
    assert.strictEqual(appLabelService.resolve('com.netflix.ninja'), 'Netflix');
    assert.strictEqual(appLabelService.resolve('com.myiptvonline.implayer'), 'IMPlayer');
    assert.strictEqual(appLabelService.resolve('com.spocky.projengmenu'), 'Projectivy Launcher');
    assert.strictEqual(appLabelService.resolve('cm.aptoidetv.pt'), 'Aptoide TV');
    assert.strictEqual(appLabelService.resolve('org.xbmc.kodi'), 'Kodi');
    assert.strictEqual(appLabelService.resolve('com.plexapp.android'), 'Plex');
    assert.strictEqual(appLabelService.resolve('com.google.android.tvlauncher'), 'Android TV Home');
    assert.strictEqual(appLabelService.resolve('com.mediatek.tis'), 'MediaTek TV Input Service');
  });

  test('Heuristic resolution formats uncatalogued packages into readable title', () => {
    const sample = appLabelService.resolve('com.developer.mycoolplayer');
    assert.strictEqual(sample, 'Mycoolplayer');

    const camelCaseSample = appLabelService.resolve('com.app.fastStreamPlayer');
    assert.strictEqual(camelCaseSample, 'Fast Stream Player');

    const kernelThread = appLabelService.resolve('[kworker/u8:2]');
    assert.strictEqual(kernelThread, '[kworker/u8:2]');
  });

  test('Custom user alias overrides default mapping', () => {
    appLabelService.setAlias('com.custom.internal', 'My Private IPTV');
    assert.strictEqual(appLabelService.resolve('com.custom.internal'), 'My Private IPTV');
  });

  test('Telemetry parseTop attaches appName to all parsed processes', () => {
    const rawTop = `
PID USER         PR  NI VIRT  RES  SHR S[%CPU] %MEM     TIME+ ARGS
3421 u0_a45       20   0 1.4G 384M  64M S 14.2  19.0  12:34.56 org.smarttube.stable
1890 system       20   0 1.2G 226M  45M S  3.8  11.2   5:20.10 com.google.android.tvlauncher
`;
    const procs = telemetryService.parseTop(rawTop);
    assert.strictEqual(procs.length, 2);
    assert.strictEqual(procs[0].appName, 'SmartTube');
    assert.strictEqual(procs[0].package, 'org.smarttube.stable');
    assert.strictEqual(procs[1].appName, 'Android TV Home');
    assert.strictEqual(procs[1].package, 'com.google.android.tvlauncher');
  });
});
