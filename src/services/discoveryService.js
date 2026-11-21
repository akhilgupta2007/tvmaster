/**
 * TvMaster - Network TV Discovery Service
 * Scans local subnet for Android TV devices with open ADB ports (5555)
 */

const os = require('os');
const net = require('net');
const { DEFAULT_ADB_PORT } = require('../constants');

class DiscoveryService {
  /**
   * Get list of local IPv4 subnets from network interfaces
   */
  getLocalSubnets() {
    const interfaces = os.networkInterfaces();
    const subnets = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip loopback and non-IPv4 addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          const parts = iface.address.split('.');
          if (parts.length === 4) {
            const subnetPrefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
            if (!subnets.includes(subnetPrefix)) {
              subnets.push(subnetPrefix);
            }
          }
        }
      }
    }

    return subnets;
  }

  /**
   * Test if a specific IP has port 5555 open
   */
  probeAdbPort(ip, port = DEFAULT_ADB_PORT, timeoutMs = 400) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({ ip, port, open: true });
        }
      });

      socket.on('timeout', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({ ip, port, open: false });
        }
      });

      socket.on('error', () => {
        if (!resolved) {
          resolved = true;
          socket.destroy();
          resolve({ ip, port, open: false });
        }
      });

      socket.connect(port, ip);
    });
  }

  /**
   * Perform concurrent subnet sweep on port 5555
   */
  async scanNetwork(port = DEFAULT_ADB_PORT, concurrency = 25) {
    const subnets = this.getLocalSubnets();
    if (subnets.length === 0) {
      return [];
    }

    const discovered = [];

    for (const subnet of subnets) {
      const ips = [];
      for (let i = 1; i <= 254; i++) {
        ips.push(`${subnet}.${i}`);
      }

      // Run in concurrency batches to avoid socket exhaustion
      for (let i = 0; i < ips.length; i += concurrency) {
        const batch = ips.slice(i, i + concurrency);
        const results = await Promise.all(batch.map((ip) => this.probeAdbPort(ip, port)));
        for (const res of results) {
          if (res.open) {
            discovered.push({
              ip: res.ip,
              port: res.port,
              name: `Android Device (${res.ip})`
            });
          }
        }
      }
    }

    return discovered;
  }
}

module.exports = new DiscoveryService();
