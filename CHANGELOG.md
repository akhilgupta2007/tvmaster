# Changelog

All notable changes to **TvMaster** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - 2026-11-20

### Added
* **Initial Release of TvMaster (`v1.0.0`)**: A zero-overhead Android TV resource monitor and process manager for Docker.
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
