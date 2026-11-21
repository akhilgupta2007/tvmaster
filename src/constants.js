/**
 * TvMaster - System Constants & Validation Patterns
 * Version: 1.0.0
 */

const APP_NAME = 'TvMaster';
const APP_VERSION = '1.2.0';
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3055;
const DEFAULT_ADB_PORT = 5555;

// Validation Regex patterns to prevent shell command injection
const REGEX_IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/;
const REGEX_PACKAGE = /^[a-zA-Z0-9_]+(?:\.[a-zA-Z0-9_]+)+$/;
const REGEX_KEYEVENT = /^[A-Z0-9_]{1,30}$/;
const REGEX_ANIMATION_SCALE = /^(?:0|0\.25|0\.5|0\.75|1|1\.25|1\.5|2)(?:\.0)?$/;

/**
 * Startup banner printed to stdout for Docker container logging
 */
function printStartupBanner() {
  const line = '═'.repeat(60);
  console.log(`
╔${line}╗
║                                                            ║
║   ████████╗██╗   ██╗███╗   ███╗ █████╗ ███████╗████████╗   ║
║   ╚══██╔══╝██║   ██║████╗ ████║██╔══██╗██╔════╝╚══██╔══╝   ║
║      ██║   ██║   ██║██╔████╔██║███████║███████╗   ██║      ║
║      ██║   ╚██╗ ██╔╝██║╚██╔╝██║██╔══██║╚════██║   ██║      ║
║      ██║    ╚████╔╝ ██║ ╚═╝ ██║██║  ██║███████║   ██║      ║
║      ╚═╝     ╚═══╝  ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝      ║
║                                                            ║
║   ${APP_NAME} - Android TV Resource Monitor & Task Manager    ║
║   Release: v${APP_VERSION}                                         ║
║   Zero-Overhead Adaptive ADB Telemetry                     ║
║   Web Dashboard listening on port ${DEFAULT_PORT}                    ║
╚${line}╝
`);
}

module.exports = {
  APP_NAME,
  APP_VERSION,
  DEFAULT_PORT,
  DEFAULT_ADB_PORT,
  REGEX_IPV4,
  REGEX_PACKAGE,
  REGEX_KEYEVENT,
  REGEX_ANIMATION_SCALE,
  printStartupBanner
};
