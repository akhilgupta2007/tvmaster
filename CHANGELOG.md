# Changelog

All notable changes to **TvMaster** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.1.0] - 2026-11-20

### Added
* **Process Slicing & Advanced Sorting (Task Manager Rework)**:
  * Clickable column headers on Name, Package, PID, CPU %, and Memory (PSS in MB) with ascending/descending directional indicators.
  * Fast filter chips: "All", "Installed Apps", "System Daemons", and "🔥 Resource Hogs" (processes consuming > 5% CPU or > 150MB RAM).
  * Real-time search filter matching name, package, or PID.
  * Slicing limits: Top 25, Top 50, Top 100, and All processes.
* **App Installation & Sideloading (Wireless APK Sideload)**:
  * Interactive Drag & Drop modal for `.apk` files directly from laptop/phone browser.
  * Real-time upload and installation progress indicator.
  * Installs on TV wirelessly over ADB via `adb install -r -g`.
* **Full App Lifecycle Actions from UI**:
  * **Uninstall App**: Completely removes user applications (`pm uninstall`) from TV with one click.
  * **Open / Launch**: Starts an application on the TV directly from the web dashboard.
  * **Clear Cache & Data**: Resets app state and frees storage (`pm clear`).
  * **End Task**: Terminates running apps and background services immediately.
* **Extended MCP Tools**: Added `tv_uninstall_package`, `tv_clear_app_data`, and `tv_launch_package`.

## [1.0.0] - 2026-11-20

### Added
* **Initial Release of TvMaster (`v1.0.0`)**: A zero-overhead Android TV resource monitor and process manager for Docker.
* **Model Context Protocol (MCP) Server**:
  * Native MCP server compliant with official `@modelcontextprotocol/sdk`.
  * 12 agentic tools enabling AI assistants to monitor TV telemetry, kill runaway tasks, flush RAM, adjust animations, freeze bloatware, and send remote keystrokes.
* **Remote Docker Deployment Automation**:
  * Added `deploy-to-server.bat` for one-command packaging and deploying to home server.
* **Low-Overhead Telemetry Engine**:
  * Direct kernel pseudofile parsing (`/proc/stat`, `/proc/meminfo`, `/proc/loadavg`, `df -k /data`).
  * Adaptive client-driven polling via WebSockets (automatically shuts down queries when browser is closed, guaranteeing zero TV impact).
* **Process Manager**:
  * Windows Task Manager-style process list with real-time CPU% and memory (PSS in MB).
  * One-click "End Task" (`am force-stop`) for rogue/hung apps.
  * Instant RAM Flush (`am kill-all`) to drop cached background processes.
* **Bloatware Hunter & Debloat Manager**:
  * Curated database of manufacturer telemetry and recommendation promo packages (Sony, TCL, Xiaomi, Google TV ads).
  * Non-root package freeze/unfreeze (`pm disable-user --user 0` / `pm enable`).
* **Instant TV Tuning & Remote**:
  * One-click Window Animation Scale adjustments (`0.5x` for 2x snappier UI, `0x` for instant transitions).
  * Virtual Remote D-pad and Keyboard text injection (`input text`) to send queries and passwords directly from a computer.
  * Soft reboot control.
* **Network Auto-Discovery**:
  * Automated subnet sweep probing port `5555` to discover Android TVs without manual IP hunting.
  * Persistent ADB key storage volume (`tvmaster_adb_keys`) to eliminate repeated authorization prompts.
* **Security & Hardening**:
  * Regex validation filters preventing command injection on all ADB commands.
  * Comprehensive automated unit and API security tests.
* **Docker Packaging**:
  * Official Dockerfile and `docker-compose.yml` with healthcheck on `/api/health`.
  * Startup banner printing application name and release `v1.0.0` to stdout.
