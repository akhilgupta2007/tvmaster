/**
 * TvMaster - Process & Package Management Controller
 */

const adbService = require('../services/adbService');
const { REGEX_PACKAGE } = require('../constants');

// Curated list of known safe-to-disable manufacturer/vendor telemetry and promo services
const KNOWN_BLOATWARE = [
  { package: 'com.sony.dtv.b2b', name: 'Sony B2B Telemetry', vendor: 'Sony', safe: true },
  { package: 'com.sony.dtv.customersupport', name: 'Sony Customer Support Service', vendor: 'Sony', safe: true },
  { package: 'com.google.android.tv.recommendations', name: 'Android TV Recommendations / Ads', vendor: 'Google', safe: true },
  { package: 'com.google.android.videos', name: 'Google Play Movies & TV (if unused)', vendor: 'Google', safe: true },
  { package: 'com.google.android.play.games', name: 'Google Play Games TV', vendor: 'Google', safe: true },
  { package: 'com.xiaomi.mitv.upgrade', name: 'Mi TV Telemetry / Upgrade Service', vendor: 'Xiaomi', safe: true },
  { package: 'com.tcl.partner.tclapp', name: 'TCL Partner App', vendor: 'TCL', safe: true },
  { package: 'com.amazon.whisperplay.contracts', name: 'Amazon WhisperPlay Ads (FireTV)', vendor: 'Amazon', safe: true }
];

class ProcessController {
  /**
   * Force stop a specific package
   */
  async killProcess(req, res) {
    try {
      const { package: pkg } = req.body;
      if (!pkg || !REGEX_PACKAGE.test(pkg)) {
        return res.status(400).json({ error: 'Invalid or missing package name' });
      }

      const result = await adbService.forceStopPackage(pkg);
      return res.json({ success: true, message: `Terminated ${pkg}`, result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Flush cached background apps (am kill-all)
   */
  async flushRam(req, res) {
    try {
      const result = await adbService.killAllBackground();
      return res.json({ success: true, message: 'Dropped all cached background apps', result });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * List installed packages categorized as user, system, or bloatware
   */
  async listPackages(req, res) {
    try {
      if (!adbService.connected) {
        return res.status(400).json({ error: 'Device not connected' });
      }

      // Query packages via adb shell pm list packages -3 (third party) and pm list packages -d (disabled)
      const thirdPartyRaw = await adbService.shell('pm list packages -3');
      const disabledRaw = await adbService.shell('pm list packages -d');

      const thirdPartySet = new Set(
        thirdPartyRaw
          .split('\n')
          .map((l) => l.replace('package:', '').trim())
          .filter(Boolean)
      );

      const disabledSet = new Set(
        disabledRaw
          .split('\n')
          .map((l) => l.replace('package:', '').trim())
          .filter(Boolean)
      );

      // Map known bloatware items with live status
      const bloatwareList = KNOWN_BLOATWARE.map((item) => ({
        ...item,
        isFrozen: disabledSet.has(item.package)
      }));

      return res.json({
        userPackages: Array.from(thirdPartySet),
        disabledPackages: Array.from(disabledSet),
        bloatware: bloatwareList
      });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Freeze / Disable a package
   */
  async freezePackage(req, res) {
    try {
      const { package: pkg } = req.body;
      if (!pkg || !REGEX_PACKAGE.test(pkg)) {
        return res.status(400).json({ error: 'Invalid package name' });
      }

      const result = await adbService.freezePackage(pkg);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Unfreeze / Enable a package
   */
  async unfreezePackage(req, res) {
    try {
      const { package: pkg } = req.body;
      if (!pkg || !REGEX_PACKAGE.test(pkg)) {
        return res.status(400).json({ error: 'Invalid package name' });
      }

      const result = await adbService.unfreezePackage(pkg);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
  /**
   * Uninstall a package
   */
  async uninstallPackage(req, res) {
    try {
      const { package: pkg, keepData } = req.body;
      if (!pkg || !REGEX_PACKAGE.test(pkg)) {
        return res.status(400).json({ error: 'Invalid or missing package name' });
      }

      const result = await adbService.uninstallPackage(pkg, keepData === true);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Clear app cache / data
   */
  async clearAppData(req, res) {
    try {
      const { package: pkg } = req.body;
      if (!pkg || !REGEX_PACKAGE.test(pkg)) {
        return res.status(400).json({ error: 'Invalid package name' });
      }

      const result = await adbService.clearAppData(pkg);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Launch package
   */
  async launchPackage(req, res) {
    try {
      const { package: pkg } = req.body;
      if (!pkg || !REGEX_PACKAGE.test(pkg)) {
        return res.status(400).json({ error: 'Invalid package name' });
      }

      const result = await adbService.launchPackage(pkg);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * Install uploaded APK
   */
  async installApk(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No APK file uploaded' });
      }

      const apkPath = req.file.path;
      const fs = require('fs');
      try {
        const result = await adbService.installApk(apkPath);
        return res.json(result);
      } finally {
        // Always clean up temp uploaded APK file
        fs.unlink(apkPath, () => {});
      }
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}

module.exports = new ProcessController();
