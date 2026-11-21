/**
 * TvMaster - Network TV Discovery Service
 * Scans local subnet for Android TV devices with open ADB ports (5555)
 * Supports Docker bridged environments, client IP subnets & custom subnets
 */

const os = require('os');
const net = require('net');
const { DEFAULT_ADB_PORT } = require('../constants');

class DiscoveryService {
  /**
   * Extract IPv4 /24 prefix from an IP address or hostname
   */
  extractSubnet(ipOrHost) {
    if (!ipOrHost) return null;
    // Strip IPv6 prefix like ::ffff:
    let clean = String(ipOrHost).replace(/^::ffff:/i, '').trim();
    // Strip port like :3055 or :5555
    if (clean.includes(':')) {
      clean = clean.split(':')[0].trim();
    }
    const parts = clean.split('.');
    if (parts.length === 4) {
      const p0 = parseInt(parts[0], 10);
      const p1 = parseInt(parts[1], 10);
      const p2 = parseInt(parts[2], 10);
      if (!isNaN(p0) && !isNaN(p1) && !isNaN(p2) && p0 >= 0 && p0 <= 255) {
        return `${p0}.${p1}.${p2}`;
      }
    }
    return null;
  }

  /**
   * Determine candidate subnets to scan, prioritizing physical LANs over Docker bridges
   */
  resolveSubnets(candidates = []) {
    const subnets = new Set();

    // 1. Check environment variable (e.g. SCAN_SUBNET="10.0.0" or "10.0.0,192.168.1")
    if (process.env.SCAN_SUBNET || process.env.TV_SUBNET) {
      const envSubs = (process.env.SCAN_SUBNET || process.env.TV_SUBNET).split(',');
      for (const s of envSubs) {
        const sub = this.extractSubnet(s.trim()) || s.trim();
        if (sub) subnets.add(sub);
      }
    }

    // 2. Check candidate IPs (Client IP, Host header, saved devices)
    for (const cand of candidates) {
      const sub = this.extractSubnet(cand);
      if (sub && !sub.startsWith('127.') && !sub.startsWith('172.17.') && !sub.startsWith('172.18.')) {
        subnets.add(sub);
      }
    }

    // 3. Inspect OS network interfaces
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          const sub = this.extractSubnet(iface.address);
          if (sub) {
            // Prioritize non-docker subnets
            subnets.add(sub);
          }
        }
      }
    }

    // 4. Fallback if only Docker internal bridges exist
    if (subnets.size === 0) {
      subnets.add('192.168.1');
      subnets.add('10.0.0');
    }

    return Array.from(subnets);
  }

  /**
   * Test if a specific IP has port 5555 open using an explicit timeout timer
   */
  probeAdbPort(ip, port = DEFAULT_ADB_PORT, timeoutMs = 450) {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      const finish = (open) => {
        if (!resolved) {
          resolved = true;
          try {
            socket.removeAllListeners();
            socket.destroy();
          } catch (e) {}
          resolve({ ip, port, open });
        }
      };

      const timer = setTimeout(() => {
        finish(false);
      }, timeoutMs);

      socket.on('connect', () => {
        clearTimeout(timer);
        finish(true);
      });

      socket.on('error', () => {
        clearTimeout(timer);
        finish(false);
      });

      try {
        socket.connect(port, ip);
      } catch (e) {
        clearTimeout(timer);
        finish(false);
      }
    });
  }

  /**
   * Perform concurrent subnet sweep on port 5555
   * @param {string|string[]} targetSubnets - Specific subnet(s) to scan (e.g. '10.0.0' or ['10.0.0'])
   * @param {string[]} candidateIps - IP hints (client IP, Host header, saved TVs)
   * @param {number} port - ADB port (default 5555)
   * @param {number} concurrency - Concurrent connection probes (default 30)
   */
  async scanNetwork(targetSubnets = null, candidateIps = [], port = DEFAULT_ADB_PORT, concurrency = 30) {
    let subnets = [];
    if (targetSubnets) {
      const list = Array.isArray(targetSubnets) ? targetSubnets : [targetSubnets];
      subnets = list.map((s) => this.extractSubnet(s) || s).filter(Boolean);
    }

    if (subnets.length === 0) {
      subnets = this.resolveSubnets(candidateIps);
    }

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
              subnet,
              name: `Android TV (${res.ip})`
            });
          }
        }
      }
    }

    return discovered;
  }
}

module.exports = new DiscoveryService();
