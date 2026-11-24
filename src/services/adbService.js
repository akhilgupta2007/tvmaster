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
      screenResolution: 'Unknown',
      cpuAbi: 'Unknown',
      cpuArch: 'ARM',
      socModel: ''
    };
    this.isConnecting = false;
    this.displaySpecs = null;
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
    this.devicePort = DEFAULT_ADB_PORT;
    this.displaySpecs = null;
    this.deviceInfo = {
      model: 'Unknown Device',
      manufacturer: 'Unknown',
      androidVersion: 'Unknown',
      apiLevel: 0,
      screenResolution: 'Unknown',
      cpuAbi: 'Unknown',
      cpuArch: 'ARM',
      socModel: '',
      displaySpecs: null
    };
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
      // Execute batched single-hop query for fast atomic device identification
      const rawProps = await this.shell(
        'getprop ro.product.model; echo "===PROP==="; ' +
        'getprop ro.product.manufacturer; echo "===PROP==="; ' +
        'getprop ro.build.version.release; echo "===PROP==="; ' +
        'getprop ro.build.version.sdk; echo "===PROP==="; ' +
        '(wm size 2>/dev/null || echo "1920x1080"); echo "===PROP==="; ' +
        'getprop ro.product.cpu.abi; echo "===PROP==="; ' +
        'getprop ro.soc.model; echo "===PROP==="; ' +
        '(getprop ro.hardware 2>/dev/null || true); echo "===PROP==="; ' +
        'getprop ro.soc.manufacturer',
        6000
      );

      const parts = rawProps.split('===PROP===').map((s) => s.trim());
      const model = parts[0] || '';
      const manufacturer = parts[1] || '';
      const androidVersion = parts[2] || '';
      const apiLevel = parseInt(parts[3] || '0', 10) || 0;
      const wmSize = parts[4] || '1920x1080';
      const cpuAbi = parts[5] || 'arm64-v8a';
      const socModel = parts[6] || parts[7] || '';
      const socManufacturer = parts[8] || '';

      let screenResolution = '1920x1080';
      const sizeMatch = wmSize.match(/(\d+x\d+)/);
      if (sizeMatch) {
        screenResolution = sizeMatch[1];
      }

      let cpuArch = 'ARMv8';
      if (cpuAbi.includes('arm64')) {
        cpuArch = 'ARMv8 64-bit';
      } else if (cpuAbi.includes('v7')) {
        cpuArch = 'ARMv8 (32-bit v7l)';
      } else if (cpuAbi.includes('x86_64')) {
        cpuArch = 'x86_64';
      } else if (cpuAbi.includes('x86')) {
        cpuArch = 'x86';
      }
      const socDisplay = [socManufacturer, socModel].filter(Boolean).join(' ').trim();

      this.deviceInfo = {
        model: model || 'Android Device',
        manufacturer: manufacturer || 'Generic',
        androidVersion: androidVersion || 'Unknown',
        apiLevel,
        screenResolution,
        cpuAbi,
        cpuArch,
        socModel: socDisplay,
        displaySpecs: null
      };

      // Query display specs once on connection (zero recurring load)
      try {
        await this.getDisplaySpecs();
      } catch (err) {}
    } catch (e) {
      if (!this.deviceInfo || this.deviceInfo.model === 'Unknown Device') {
        this.deviceInfo = {
          model: `Android Device (${this.deviceIp})`,
          manufacturer: 'Generic',
          androidVersion: 'Unknown',
          apiLevel: 0,
          screenResolution: '1920x1080',
          cpuAbi: 'arm64-v8a',
          cpuArch: 'ARM',
          socModel: '',
          displaySpecs: null
        };
      }
    }
  }

  /**
   * Parse dumpsys display output to extract static display capabilities, refresh rates, HDR & ALLM
   */
  parseDisplaySpecs(raw) {
    if (!raw || typeof raw !== 'string') return null;

    // 1. Density
    let density = null;
    const densityMatch = raw.match(/density\s+(\d+)/i);
    if (densityMatch) density = parseInt(densityMatch[1], 10);

    // 2. Active Mode (width, height, fps)
    let activeMode = null;
    const activeMatch = raw.match(/mActiveSfDisplayMode=DisplayMode\{[^}]*width=(\d+),\s*height=(\d+)[^}]*refreshRate=([0-9.]+)/) ||
                        raw.match(/DisplayDeviceInfo\{[^}]*?(\d+)\s*x\s*(\d+)[^}]*?fps=([0-9.]+)/i) ||
                        raw.match(/DisplayInfo\{[^}]*?real\s*(\d+)\s*x\s*(\d+)[^}]*?modes\s*\[\{[^}]*fps=([0-9.]+)/i);
    if (activeMatch) {
      const w = parseInt(activeMatch[1], 10);
      const h = parseInt(activeMatch[2], 10);
      const fps = Math.round(parseFloat(activeMatch[3]) * 100) / 100;
      activeMode = {
        width: w,
        height: h,
        fps,
        label: `${w}x${h} @ ${Math.round(fps)}Hz`
      };
    }

    // 3. Supported Modes
    const supportedModes = [];
    const modeRegex = /width=(\d+),\s*height=(\d+),\s*fps=([0-9.]+)/g;
    let m;
    const seen = new Set();
    while ((m = modeRegex.exec(raw)) !== null) {
      const w = parseInt(m[1], 10);
      const h = parseInt(m[2], 10);
      const fps = Math.round(parseFloat(m[3]) * 100) / 100;
      const key = `${w}x${h}@${Math.round(fps)}`;
      if (!seen.has(key)) {
        seen.add(key);
        supportedModes.push({
          width: w,
          height: h,
          fps,
          label: `${w}x${h} @ ${Math.round(fps)}Hz`
        });
      }
    }

    supportedModes.sort((a, b) => (b.width * b.height) - (a.width * a.height) || b.fps - a.fps);

    // 4. HDR Capabilities
    const hdrTypes = [];
    const hdrMatch = raw.match(/HdrCapabilities\{mSupportedHdrTypes=\[([^\]]*)\](?:,\s*mMaxLuminance=([0-9.]+))?(?:,\s*mMaxAverageLuminance=([0-9.]+))?(?:,\s*mMinLuminance=([0-9.]+))?/i);
    let maxLuminance = null;
    let minLuminance = null;

    if (hdrMatch) {
      const rawTypes = hdrMatch[1].split(',').map((s) => s.trim()).filter(Boolean);
      const typeMap = {
        '1': 'Dolby Vision',
        '2': 'HDR10',
        '3': 'HLG',
        '4': 'HDR10+'
      };
      for (const t of rawTypes) {
        if (typeMap[t]) hdrTypes.push(typeMap[t]);
      }
      if (hdrMatch[2]) maxLuminance = parseFloat(hdrMatch[2]);
      if (hdrMatch[4]) minLuminance = parseFloat(hdrMatch[4]);
    }

    // 5. ALLM (Auto Low Latency Mode) & Game Mode
    const allmSupported = /allmSupported\s*true/i.test(raw) || /mAllmSupported=true/i.test(raw);
    const gameModeSupported = /minimalPostProcessingSupported\s*true/i.test(raw) || /gameContentTypeSupported\s*true/i.test(raw);

    return {
      activeMode: activeMode || (supportedModes.length > 0 ? supportedModes[0] : null),
      supportedModes,
      hdrTypes,
      hasHdr: hdrTypes.length > 0,
      hdrSummary: hdrTypes.length > 0 ? hdrTypes.join(' / ') : 'SDR Only',
      allmSupported,
      gameModeSupported,
      density,
      luminance: {
        max: maxLuminance,
        min: minLuminance
      }
    };
  }

  /**
   * Query static display and video output capabilities (Zero Recurring Load)
   */
  async getDisplaySpecs(force = false) {
    if (this.displaySpecs && !force) {
      return this.displaySpecs;
    }
    if (!this.connected) {
      return null;
    }

    try {
      const raw = await this.shell('dumpsys display', 4000);
      this.displaySpecs = this.parseDisplaySpecs(raw);
      if (this.deviceInfo && this.displaySpecs) {
        this.deviceInfo.displaySpecs = this.displaySpecs;
      }
      return this.displaySpecs;
    } catch (e) {
      return this.displaySpecs || null;
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
      let output = '';
      try {
        const { stdout, stderr } = await execFileAsync(
          'adb',
          ['-s', target, 'install', '-r', '-g', apkFilePath],
          { timeout: 180000 } // Allow 3 mins for large APKs
        );
        output = (stdout + ' ' + stderr).trim();
      } catch (errWithG) {
        // Fallback without -g in case device OS does not support grant-permissions flag
        const { stdout, stderr } = await execFileAsync(
          'adb',
          ['-s', target, 'install', '-r', apkFilePath],
          { timeout: 180000 }
        );
        output = (stdout + ' ' + stderr).trim();
      }

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

  /**
   * Push a local file to remote Android TV filesystem
   */
  async pushFile(localPath, remotePath, timeoutMs = 180000) {
    if (!this.connected || !this.deviceIp) {
      throw new Error('Not connected to any Android TV device');
    }
    const target = `${this.deviceIp}:${this.devicePort}`;
    const { stdout, stderr } = await execFileAsync(
      'adb',
      ['-s', target, 'push', localPath, remotePath],
      { timeout: timeoutMs }
    );
    const output = (stdout + ' ' + stderr).trim();
    if (output.includes('error:') || output.includes('cannot create')) {
      throw new Error(output || 'Failed to push file to TV');
    }
    return { success: true, output };
  }

  /**
   * Pull a remote file from Android TV filesystem to local path
   */
  async pullFile(remotePath, localPath, timeoutMs = 180000) {
    if (!this.connected || !this.deviceIp) {
      throw new Error('Not connected to any Android TV device');
    }
    const target = `${this.deviceIp}:${this.devicePort}`;
    const { stdout, stderr } = await execFileAsync(
      'adb',
      ['-s', target, 'pull', remotePath, localPath],
      { timeout: timeoutMs }
    );
    const output = (stdout + ' ' + stderr).trim();
    if (output.includes('error:') || output.includes('does not exist')) {
      throw new Error(output || 'Failed to pull file from TV');
    }
    return { success: true, output };
  }
}

module.exports = new AdbService();
