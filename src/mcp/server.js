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
const deviceService = require('../services/deviceService');
const appLabelService = require('../services/appLabelService');

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

  // Tool 13: Uninstall Package
  server.tool(
    'tv_uninstall_package',
    'Uninstall an application or package from the Android TV',
    {
      package: z.string().describe('Package ID to uninstall (e.g. com.example.app)'),
      keepData: z.boolean().optional().default(false).describe('Keep app cache/data directory')
    },
    async ({ package: pkg, keepData }) => {
      try {
        const result = await adbService.uninstallPackage(pkg, keepData);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Uninstall failed: ${err.message}` }]
        };
      }
    }
  );

  // Tool 14: Clear App Data
  server.tool(
    'tv_clear_app_data',
    'Clear all data and cache for an application (pm clear)',
    {
      package: z.string().describe('Package ID to clear')
    },
    async ({ package: pkg }) => {
      try {
        const result = await adbService.clearAppData(pkg);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Clear data failed: ${err.message}` }]
        };
      }
    }
  );

  // Tool 15: Launch Package
  server.tool(
    'tv_launch_package',
    'Launch or open an application on the Android TV',
    {
      package: z.string().describe('Package ID to launch')
    },
    async ({ package: pkg }) => {
      try {
        const result = await adbService.launchPackage(pkg);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Launch failed: ${err.message}` }]
        };
      }
    }
  );

  // Tool 16: Display & HDR Specs
  server.tool(
    'tv_get_display_specs',
    'Get display capabilities, video modes, refresh rate (FPS), HDR matrix (Dolby Vision, HDR10+, HLG), and ALLM',
    {
      forceRefresh: z.boolean().optional().default(false).describe('Re-query HDMI handshake from TV')
    },
    async ({ forceRefresh }) => {
      if (!adbService.connected) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Device not connected. Use tv_connect first.' }]
        };
      }
      try {
        const specs = await adbService.getDisplaySpecs(forceRefresh);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(specs, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to query display specs: ${err.message}` }]
        };
      }
    }
  );

  // Tool 17: List Saved Devices & Streaming Cards
  server.tool(
    'tv_list_devices',
    'List all registered TV, Firestick, Shield, and Streaming device profiles with classification and active status',
    {},
    async () => {
      try {
        const devices = deviceService.getDevices(adbService.deviceIp);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: devices.length, activeIp: adbService.deviceIp, devices }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to list devices: ${err.message}` }]
        };
      }
    }
  );

  // Tool 18: Switch Device
  server.tool(
    'tv_switch_device',
    'Switch active connection to another saved or target Android TV / Streaming device by IP address',
    {
      ip: z.string().describe('Target device IP to connect to (e.g. 10.0.0.13)'),
      port: z.number().optional().default(5555).describe('ADB port, defaults to 5555')
    },
    async ({ ip, port }) => {
      try {
        const result = await adbService.connect(ip, port);
        const classification = deviceService.addOrUpdateDevice({
          ip,
          port,
          name: result.deviceInfo?.model || ip,
          model: result.deviceInfo?.model || '',
          manufacturer: result.deviceInfo?.manufacturer || ''
        });
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  success: true,
                  message: `Switched connection to ${ip}:${port}`,
                  deviceInfo: result.deviceInfo,
                  classification
                },
                null,
                2
              )
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Switch device failed: ${err.message}` }]
        };
      }
    }
  );

  // Tool 19: List Installed User Apps
  server.tool(
    'tv_list_installed_apps',
    'List all user-installed applications on the Android TV with resolved human names and package IDs',
    {},
    async () => {
      if (!adbService.connected) {
        return {
          isError: true,
          content: [{ type: 'text', text: 'Device not connected. Use tv_connect first.' }]
        };
      }
      try {
        const thirdPartyRaw = await adbService.shell('pm list packages -3');
        const pkgs = thirdPartyRaw
          .split('\n')
          .map((l) => l.replace('package:', '').trim())
          .filter(Boolean);
        const apps = pkgs
          .map((pkg) => ({
            package: pkg,
            name: appLabelService.resolve(pkg)
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ count: apps.length, apps }, null, 2)
            }
          ]
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Failed to list installed apps: ${err.message}` }]
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
