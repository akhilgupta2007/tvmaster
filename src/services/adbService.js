/**
 * TvMaster - ADB Service
 * Secure execution wrapper for Android Debug Bridge commands
 */

const { execFile, exec } = require('child_process');
const { promisify } = require('util');
const {
  REGEX_IPV4,
  REGEX_PACKAGE,
  REGEX_KEYEVENT,
  REGEX_ANIMATION_SCALE,
  DEFAULT_ADB_PORT
} = require('../constants');

const execFileAsync = promisify(execFile);

class AdbService {
  constructor() {
    this.connected = false;
    this.deviceIp = null;
    this.devicePort = DEFAULT_ADB_PORT;
    this.deviceInfo = {
      model: 'Unknown Device',
      manufacturer: 'Unknown',
      androidVersion: 'Unknown',
      apiLevel: 0,
      screenResolution: 'Unknown'
    };
    this.isConnecting = false;
  }

  /**
   * Connect to Android TV via ADB TCP/IP
   */
  async connect(ip, port = DEFAULT_ADB_PORT) {
    if (!ip || !REGEX_IPV4.test(ip)) {
      throw new Error(`Invalid IPv4 address: ${ip}`);
    }

    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      throw new Error(`Invalid port: ${port}`);
    }

    this.isConnecting = true;
    const target = `${ip}:${portNum}`;

    try {
      // Execute adb connect <ip>:<port>
      const { stdout, stderr } = await execFileAsync('adb', ['connect', target], { timeout: 8000 });
      const output = (stdout + ' ' + stderr).trim();

      if (output.includes('connected to') || output.includes('already connected')) {
        this.connected = true;
        this.deviceIp = ip;
        this.devicePort = portNum;
        await this.refreshDeviceInfo();
        return { success: true, message: `Connected to ${target}`, deviceInfo: this.deviceInfo };
      } else {
        this.connected = false;
        throw new Error(output || 'Connection refused or device offline');
      }
    } catch (err) {
      this.connected = false;
      throw new Error(`Failed to connect to ${target}: ${err.message}`);
    } finally {
      this.isConnecting = false;
    }
  }

  /**
   * Disconnect from current ADB device
   */
  async disconnect() {
    if (this.deviceIp) {
      const target = `${this.deviceIp}:${this.devicePort}`;
      try {
        await execFileAsync('adb', ['disconnect', target], { timeout: 5000 });
      } catch (e) {
        // Ignore disconnect errors
      }
    }
    this.connected = false;
    this.deviceIp = null;
    return { success: true, message: 'Disconnected' };
  }

  /**
   * Execute an ADB shell command with security validation and timeout
   */
  async shell(commandString, timeoutMs = 6000) {
    if (!this.connected || !this.deviceIp) {
      throw new Error('Not connected to any Android TV device');
    }

    const target = `${this.deviceIp}:${this.devicePort}`;
    try {
      // Run adb -s <target> shell <commandString>
      const { stdout, stderr } = await execFileAsync(
        'adb',
        ['-s', target, 'shell', commandString],
        { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }
      );
      return stdout || stderr || '';
    } catch (err) {
      // Check if device dropped connection
      if (err.message && (err.message.includes('device offline') || err.message.includes('closed'))) {
        this.connected = false;
      }
      throw err;
    }
  }

  /**
   * Refresh device metadata (model, OS, resolution)
   */
  async refreshDeviceInfo() {
    try {
      const model = (await this.shell('getprop ro.product.model')).trim();
      const manufacturer = (await this.shell('getprop ro.product.manufacturer')).trim();
      const androidVersion = (await this.shell('getprop ro.build.version.release')).trim();
      const apiLevel = parseInt((await this.shell('getprop ro.build.version.sdk')).trim(), 10) || 0;
      const wmSize = (await this.shell('wm size')).trim(); // Physical size: 1920x1080

      let screenResolution = '1920x1080';
      const sizeMatch = wmSize.match(/(\d+x\d+)/);
      if (sizeMatch) {
        screenResolution = sizeMatch[1];
      }

      this.deviceInfo = {
        model: model || 'Android TV',
        manufacturer: manufacturer || 'Generic',
        androidVersion: androidVersion || 'Unknown',
        apiLevel,
        screenResolution
      };
    } catch (e) {
      // Keep existing info if command fails
    }
  }

  /**
   * Force stop a package (Kill Task)
   */
  async forceStopPackage(packageName) {
    if (!packageName || !REGEX_PACKAGE.test(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    await this.shell(`am force-stop ${packageName}`);
    return { success: true, package: packageName };
  }

  /**
   * Kill all background cached processes (RAM Flush)
   */
  async killAllBackground() {
    await this.shell('am kill-all');
    return { success: true };
  }

  /**
   * Set window animation scale (0, 0.5, 1.0)
   */
  async setAnimationScale(scale) {
    const scaleStr = String(scale);
    if (!REGEX_ANIMATION_SCALE.test(scaleStr)) {
      throw new Error(`Invalid animation scale: ${scale}`);
    }
    await this.shell(`settings put global window_animation_scale ${scaleStr}`);
    await this.shell(`settings put global transition_animation_scale ${scaleStr}`);
    await this.shell(`settings put global animator_duration_scale ${scaleStr}`);
    return { success: true, scale: parseFloat(scaleStr) };
  }

  /**
   * Get current animation scale
   */
  async getAnimationScale() {
    try {
      const val = (await this.shell('settings get global window_animation_scale')).trim();
      return parseFloat(val) || 1.0;
    } catch {
      return 1.0;
    }
  }

  /**
   * Freeze / Disable a package (user 0)
   */
  async freezePackage(packageName) {
    if (!packageName || !REGEX_PACKAGE.test(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    const res = await this.shell(`pm disable-user --user 0 ${packageName}`);
    return { success: res.includes('disabled'), output: res.trim() };
  }

  /**
   * Unfreeze / Enable a package
   */
  async unfreezePackage(packageName) {
    if (!packageName || !REGEX_PACKAGE.test(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    const res = await this.shell(`pm enable ${packageName}`);
    return { success: res.includes('enabled'), output: res.trim() };
  }

  /**
   * Send simulated key event (e.g. KEYCODE_HOME, KEYCODE_BACK, KEYCODE_DPAD_CENTER)
   */
  async sendKeyEvent(keyEvent) {
    if (!keyEvent || !REGEX_KEYEVENT.test(keyEvent)) {
      throw new Error(`Invalid key event: ${keyEvent}`);
    }
    await this.shell(`input keyevent ${keyEvent}`);
    return { success: true, key: keyEvent };
  }

  /**
   * Send text to active input on TV (sanitizes text)
   */
  async sendText(text) {
    if (typeof text !== 'string') {
      throw new Error('Text must be a string');
    }
    // Escape shell special characters for input text
    const escaped = text.replace(/([\\"'`$#&*|;<>~(){}\[\]?!\s])/g, '\\$1');
    await this.shell(`input text "${escaped}"`);
    return { success: true };
  }

  /**
   * Install an APK file on the TV via adb install -r
   */
  async installApk(apkFilePath) {
    if (!this.connected || !this.deviceIp) {
      throw new Error('Not connected to any Android TV device');
    }

    const target = `${this.deviceIp}:${this.devicePort}`;
    try {
      const { stdout, stderr } = await execFileAsync(
        'adb',
        ['-s', target, 'install', '-r', '-g', apkFilePath],
        { timeout: 120000 } // Allow 2 mins for large APKs
      );
      const output = (stdout + ' ' + stderr).trim();
      if (output.includes('Success')) {
        return { success: true, message: 'APK installed successfully!' };
      } else {
        throw new Error(output || 'Installation failed');
      }
    } catch (err) {
      throw new Error(`Failed to install APK: ${err.message}`);
    }
  }

  /**
   * Uninstall a package from the TV via pm uninstall
   */
  async uninstallPackage(packageName, keepData = false) {
    if (!packageName || !REGEX_PACKAGE.test(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    const cmd = keepData ? `pm uninstall -k ${packageName}` : `pm uninstall ${packageName}`;
    const res = await this.shell(cmd, 15000);
    if (res.includes('Success')) {
      return { success: true, message: `Successfully uninstalled ${packageName}` };
    } else {
      throw new Error(res.trim() || 'Uninstall failed');
    }
  }

  /**
   * Clear app data and cache (pm clear)
   */
  async clearAppData(packageName) {
    if (!packageName || !REGEX_PACKAGE.test(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    const res = await this.shell(`pm clear ${packageName}`, 10000);
    return { success: res.includes('Success'), output: res.trim() };
  }

  /**
   * Launch / Open an application (monkey -p <pkg> -c android.intent.category.LAUNCHER 1)
   */
  async launchPackage(packageName) {
    if (!packageName || !REGEX_PACKAGE.test(packageName)) {
      throw new Error(`Invalid package name: ${packageName}`);
    }
    await this.shell(`monkey -p ${packageName} -c android.intent.category.LAUNCHER 1`, 5000);
    return { success: true, message: `Launched ${packageName}` };
  }

  /**
   * Reboot TV
   */
  async reboot() {
    if (!this.connected) {
      throw new Error('Not connected to any Android TV device');
    }
    try {
      await this.shell('reboot', 4000);
    } catch (e) {
      // Abrupt socket termination is expected when Android drops ADB to restart
    }
    this.connected = false;
    return { success: true, message: 'Reboot signal sent to TV' };
  }
}

module.exports = new AdbService();
