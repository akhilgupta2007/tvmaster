/**
 * TvMaster - Official Model Context Protocol (MCP) Server
 * Exposes Android TV resource management & debloat tools to AI agents
 * Version: 1.0.0
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const { APP_NAME, APP_VERSION } = require('../constants');
const adbService = require('../services/adbService');
const telemetryService = require('../services/telemetryService');
const discoveryService = require('../services/discoveryService');

function createMcpServer() {
  const server = new McpServer({
    name: APP_NAME,
    version: APP_VERSION
  });

  // Tool 1: Connect to TV
  server.tool(
    'tv_connect',
    'Connect to an Android TV via ADB TCP/IP over the local network',
    {
      ip: z.string().describe('IPv4 address of the Android TV (e.g. 192.168.1.145)'),
      port: z.number().optional().default(5555).describe('ADB port, defaults to 5555')
    },
    async ({ ip, port }) => {
      try {
        const result = await adbService.connect(ip, port);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Connected to ${ip}:${port}`, deviceInfo: result.deviceInfo }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Connection failed: ${err.message}` }]
        };
      }
    }
  );

  // Tool 2: Connection Status & Device Info
  server.tool(
    'tv_get_status',
    'Get current connection status and hardware metadata for the Android TV',
    {},
    async () => {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                connected: adbService.connected,
                deviceIp: adbService.deviceIp,
                devicePort: adbService.devicePort,
                deviceInfo: adbService.deviceInfo
              },
              null,
              2
            )
          }
        ]
      };
    }
  );

  // Tool 3: Live Telemetry
  server.tool(
    'tv_get_telemetry',
    'Get real-time RAM, CPU utilization, load averages, and storage stats (< 1ms TV kernel read)',
    {},
    async () => {
      if (!adbService.connected) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Device not connected. Use tv_connect first.' }]
        };
      }

      const telemetry = await telemetryService.collectTelemetry();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(telemetry, null, 2)
          }
        ]
      };
    }
  );

  // Tool 4: List Running Processes
  server.tool(
    'tv_list_processes',
    'List running processes and memory/CPU consumers on the Android TV',
    {
      filter: z.enum(['all', 'apps', 'system']).optional().default('all').describe('Filter by app type'),
      limit: z.number().optional().default(20).describe('Max number of processes to return')
    },
    async ({ filter, limit }) => {
      if (!adbService.connected) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Device not connected. Use tv_connect first.' }]
        };
      }

      const telemetry = await telemetryService.collectTelemetry();
      let list = (telemetry && telemetry.processes) || [];

      if (filter === 'apps') list = list.filter((p) => p.isPackage);
      if (filter === 'system') list = list.filter((p) => p.isSystem);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(list.slice(0, limit), null, 2)
          }
        ]
      };
    }
  );

  // Tool 5: Kill Process
  server.tool(
    'tv_kill_process',
    'Force stop a running application or background package on the Android TV to free memory',
    {
      package: z.string().describe('Package ID to terminate (e.g. com.netflix.ninja, com.google.android.youtube.tv)')
    },
    async ({ package: pkg }) => {
      try {
        const result = await adbService.forceStopPackage(pkg);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Terminated package ${pkg}`, result }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to terminate: ${err.message}` }]
        };
      }
    }
  );

  // Tool 6: Flush Cached RAM
  server.tool(
    'tv_flush_ram',
    'Safely drop all cached background apps (am kill-all) to immediately reclaim RAM',
    {},
    async () => {
      try {
        await adbService.killAllBackground();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Dropped all cached background apps successfully.' }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `RAM flush failed: ${err.message}` }]
        };
      }
    }
  );

  // Tool 7: Tune Animation Speed
  server.tool(
    'tv_tune_speed',
    'Set window, transition, and animator animation scales (0.5 for 2x faster, 0 for instant)',
    {
      scale: z.number().describe('Scale float (0, 0.25, 0.5, 0.75, 1, 1.5, 2)')
    },
    async ({ scale }) => {
      try {
        const result = await adbService.setAnimationScale(scale);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Animation scale updated to ${scale}x`, result }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to set animation scale: ${err.message}` }]
        };
      }
    }
  );

  // Tool 8: Bloatware Freeze / Unfreeze
  server.tool(
    'tv_debloat_package',
    'Freeze (disable) or unfreeze (enable) a vendor/OEM bloatware package on Android TV without root',
    {
      package: z.string().describe('Package name to freeze or unfreeze'),
      action: z.enum(['freeze', 'unfreeze']).describe('Action to perform')
    },
    async ({ package: pkg, action }) => {
      try {
        const result = action === 'freeze' ? await adbService.freezePackage(pkg) : await adbService.unfreezePackage(pkg);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, action, package: pkg, result }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Debloat action failed: ${err.message}` }]
        };
      }
    }
  );

  // Tool 9: Send Remote Key
  server.tool(
    'tv_send_remote_key',
    'Send a simulated remote control button key event to the Android TV',
    {
      key: z
        .string()
        .describe(
          'Android keycode name, e.g. KEYCODE_HOME, KEYCODE_BACK, KEYCODE_DPAD_UP, KEYCODE_DPAD_DOWN, KEYCODE_DPAD_LEFT, KEYCODE_DPAD_RIGHT, KEYCODE_DPAD_CENTER, KEYCODE_VOLUME_UP, KEYCODE_VOLUME_DOWN'
        )
    },
    async ({ key }) => {
      try {
        const result = await adbService.sendKeyEvent(key);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, key, result }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to send key: ${err.message}` }]
        };
      }
    }
  );

  // Tool 10: Send Text to TV Input
  server.tool(
    'tv_send_text',
    'Type text or search queries directly into any active input box on the TV screen',
    {
      text: z.string().describe('Text to send to the TV')
    },
    async ({ text }) => {
      try {
        await adbService.sendText(text);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: `Sent text "${text}" to TV` }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to send text: ${err.message}` }]
        };
      }
    }
  );

  // Tool 11: Auto-Discover Devices
  server.tool(
    'tv_discover_devices',
    'Scan local network subnet to automatically discover Android TV devices listening on port 5555',
    {},
    async () => {
      try {
        const devices = await discoveryService.scanNetwork();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ devicesCount: devices.length, devices }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Discovery scan failed: ${err.message}` }]
        };
      }
    }
  );

  // Tool 12: Reboot TV
  server.tool(
    'tv_reboot',
    'Soft reboot the connected Android TV',
    {},
    async () => {
      try {
        await adbService.reboot();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, message: 'Reboot command sent to TV' }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Reboot failed: ${err.message}` }]
        };
      }
    }
  );

  return server;
}

// Start stdio transport if executed as standalone script (e.g. node src/mcp/server.js)
async function runStdio() {
  const mcp = createMcpServer();
  const transport = new StdioServerTransport();
  await mcp.connect(transport);
  console.error('[TvMaster MCP] MCP Stdio Server running.');
}

if (require.main === module) {
  runStdio().catch((err) => {
    console.error('[TvMaster MCP Error]', err);
    process.exit(1);
  });
}

module.exports = { createMcpServer };
