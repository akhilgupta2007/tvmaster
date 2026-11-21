/**
 * TvMaster - MCP Server Tool Definition & Schema Tests
 */

const { test, describe } = require('node:test');
const assert = require('node:assert');
const { createMcpServer } = require('../src/mcp/server');
const { APP_VERSION } = require('../src/constants');

describe('TvMaster MCP Server Tool Registry Tests', () => {
  const mcp = createMcpServer();

  test('MCP Server initializes with TvMaster name and version', () => {
    assert.strictEqual(mcp.server._serverInfo.name, 'TvMaster');
    assert.strictEqual(mcp.server._serverInfo.version, APP_VERSION);
  });

  test('MCP Server registers all required Android TV management tools', () => {
    // Check registered tools map
    const tools = mcp._registeredTools;
    assert.ok(tools['tv_connect'], 'tv_connect registered');
    assert.ok(tools['tv_get_status'], 'tv_get_status registered');
    assert.ok(tools['tv_get_telemetry'], 'tv_get_telemetry registered');
    assert.ok(tools['tv_list_processes'], 'tv_list_processes registered');
    assert.ok(tools['tv_kill_process'], 'tv_kill_process registered');
    assert.ok(tools['tv_flush_ram'], 'tv_flush_ram registered');
    assert.ok(tools['tv_tune_speed'], 'tv_tune_speed registered');
    assert.ok(tools['tv_debloat_package'], 'tv_debloat_package registered');
    assert.ok(tools['tv_send_remote_key'], 'tv_send_remote_key registered');
    assert.ok(tools['tv_send_text'], 'tv_send_text registered');
    assert.ok(tools['tv_discover_devices'], 'tv_discover_devices registered');
    assert.ok(tools['tv_reboot'], 'tv_reboot registered');
  });

  test('tv_get_status handles disconnected state gracefully', async () => {
    const tools = mcp._registeredTools;
    const res = await tools['tv_get_status'].handler({});
    assert.strictEqual(res.content.length, 1);
    const parsed = JSON.parse(res.content[0].text);
    assert.strictEqual(parsed.connected, false);
  });

  test('tv_get_telemetry reports error when not connected', async () => {
    const tools = mcp._registeredTools;
    const res = await tools['tv_get_telemetry'].handler({});
    assert.strictEqual(res.isError, true);
    assert.match(res.content[0].text, /Device not connected/i);
  });
});
