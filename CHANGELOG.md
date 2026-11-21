# Changelog

All notable changes to **TvMaster** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.1] - 2026-11-20

### Added
* **Full Memory Transparency & Accounting (Kernel, 4K Display Hardware & Apps)**:
  * Resolved discrepancy between process table memory and total used RAM:
    * Disclosed 4K display GPU framebuffer carveout (SurfaceFlinger, MediaTek hardware video decoders, and direct kernel buffers).
    * Split memory into 4 transparent categories: **Apps & Services** (`AnonPages`), **Kernel & 4K Display Hardware** (`Slab + drivers`), **Reclaimable Cache** (`Cached + Buffers`), and **Available Memory**.
  * Added 4-segment visual RAM bar on dashboard (Blue for Apps, Purple for Kernel/4K GPU, Cyan for Cache, Slate for Free).
  * Added live memory accounting strip directly above the process table showing exact totals across processes vs kernel/hardware.

## [1.3.0] - 2026-11-20

### Added
* **Online App Name Resolution via Google Play Store Scraper**:
  * Added live online lookup engine to query official application titles directly from Google Play Store web metadata for any uncatalogued package.
  * Zero-delay synchronous fallback: immediately renders heuristic title and queries online metadata asynchronously in the background.
  * Disk and memory caching (`data/app_labels_cache.json`) so each package is only fetched once.
  * Verified live lookups (e.g. `com.spocky.projengmenu` ➔ **Projectivy Launcher**, `com.myiptvonline.implayer` ➔ **iMPlayer TV IPTV Player**).

## [1.2.0] - 2026-11-20

### Added
* **Package-to-App-Name Decoder Service (`appLabelService.js`)**:
  * Resolves cryptic Android package identifiers into clean human-readable application names (e.g. `com.google.android.youtube.tv` → **YouTube**, `org.smarttube.stable` → **SmartTube**, `com.myiptvonline.implayer` → **IMPlayer**, `com.spocky.projengmenu` → **Projectivy Launcher**, `com.mediatek.tis` → **MediaTek TV Input Service**).
  * Includes extensive catalog of over 150+ popular Android TV apps, streaming platforms, IPTV players, and OEM hardware services.
  * Smart camelCase & reverse-domain heuristic decomposition for uncatalogued or custom sideloaded apps.
* **Dedicated App Name Column & Multi-Column Sorting**:
  * New dedicated **App Name** column in the Task Manager table alongside **Package ID**.
  * Interactive click-to-sort on **App Name (A-Z / Z-A)**, with directional indicators.
  * Added "App Name (A-Z)" and "App Name (Z-A)" directly in the Sort By dropdown.
  * Omni-search filter now matches on friendly App Name, Package ID, and PID simultaneously.

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
