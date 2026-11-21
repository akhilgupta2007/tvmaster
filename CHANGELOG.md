# Changelog

All notable changes to **TvMaster** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.6.0] - 2026-11-21

### Added
* **Hardware CPU Details & Zero-Overhead Per-Core Utilization**:
  * **Zero TV Overhead Architecture**: Reads individual core jiffies (`cpu0`, `cpu1`, `cpu2`, `cpu3`) directly from the existing batch read of `/proc/stat` without executing any additional ADB shell command, subprocess, or network roundtrip.
  * **CPU Architecture & ABI Detection**: Automatically queries device ABI (`ro.product.cpu.abi`) and formats architecture (e.g. `ARMv8 (32-bit v7l)`, `ARMv8 64-bit`, `x86_64`).
  * **SoC Model & Platform Identification**: Reads SoC manufacturer and model (`ro.soc.manufacturer`, `ro.soc.model`, `ro.hardware`) to display chipset identity (e.g. `MediaTek MT9689`, `Amlogic S905X4`, `Qualcomm Snapdragon`).
  * **Dynamic Per-Core Micro-Bar Visualizer**: Renders individual micro-bars on the CPU dashboard card for each detected CPU core with color transitions (green <= 40%, amber <= 75%, red > 75%) updating live over WebSocket.
  * **MCP Server Tool Expansions**: Added `tv_get_display_specs` (display & HDR handshake), `tv_list_devices` (multi-device profiles), `tv_switch_device` (1-click active TV switching), `tv_launch_package`, `tv_clear_app_data`, and `tv_uninstall_package` to the native Model Context Protocol server.
  * Added unit tests asserting multi-core delta parsing in `telemetry.test.js`, architectural metadata checks in `api.test.js`, and expanded MCP registry tests in `mcp.test.js` (45/45 tests passing).

## [1.5.1] - 2026-11-21

### Added
* **Display Capabilities, Video Modes & HDR Specs Inspector (Zero Recurring Load)**:
  * Implemented static display capability extraction (`dumpsys display`) querying HDMI handshake and panel capabilities **once on connection** with **0% background recurring TV load**.
  * **Video Output & FPS Modes**: Detects active display resolution, refresh rate/FPS (e.g. `3840x2160 @ 60.00 Hz`), display density (`320 DPI`), and lists all supported video output modes (4K 60Hz, 1080p, 24p cinema).
  * **High Dynamic Range (HDR) Matrix**: Real-time detection and visual status matrix for **Dolby Vision**, **HDR10+**, **HDR10**, and **HLG** with peak luminance reporting.
  * **Gaming & Low Latency**: Auto-detects **Auto Low Latency Mode (ALLM)** and minimal post-processing Game Mode support.
  * **Display & Video Specs Modal (`#modal-display-specs`)**: Sleek Cyber-Dark modal displaying the full hardware HDMI handshake with 1-click re-query.
  * **Active Device Card Badges**: Display mode (`3840x2160 @ 60Hz`), HDR badges (`🌈 Dolby Vision/HDR10`), ALLM indicators, and `🔍 Specs` shortcut directly on the active card.
  * Added `GET /api/device/display` endpoint with automated tests (42/42 tests passing).

## [1.5.0] - 2026-11-21

### Added
* **Universal Streaming Device & Amazon Fire TV Support**:
  * Extended TvMaster from Android TV-only to universally support **Amazon Fire TV / Firestick / Fire TV Cube**, **Google Chromecast with Google TV**, **NVIDIA Shield TV**, **Smart Projectors** (XGIMI, Formovie, Anker Nebula), and **Android Streaming Boxes** (onn., Xiaomi, MeCool).
  * Implemented automatic device classification engine (`classifyDevice`) inspecting hardware manufacturer, model (`AFT*`, `Shield`, `Chromecast`, etc.), and system signatures to assign category badges and icons (`📺 Smart TV`, `🔥 Firestick`, `🛡️ NVIDIA Shield`, `⚪ Chromecast`, `📦 Streaming Box`, `📽️ Projector`).
  * Added **Device Category Selector** in the Add Device modal for easy manual assignment.
* **Auto-Active Device Card Synchronization (Fix for Disconnected Card Display)**:
  * Resolved timing race condition on page load by orchestrating status check and device list retrieval with `Promise.allSettled`.
  * Implemented backend auto-heal in `/api/devices` that dynamically injects and locks the currently active ADB connection as `isActive: true` even before disk persistence or on initial boot.
  * Synchronized device card renderers so the connected TV/streaming device immediately displays the glowing blue-emerald active gradient, emerald pulsing dot (`● Active`), and `✓ Streaming` status.
* **Curated Bloatware Hunter for Amazon Fire TV & Fire OS**:
  * Added curated definitions for Amazon Fire TV telemetry and promo services (`com.amazon.whisperplay.contracts`, `com.amazon.device.sale.service`, `com.amazon.advertising`, `com.amazon.hedwig`, `com.amazon.kato`, `com.amazon.storm.lightning.services`).
  * Expanded `KNOWN_APP_LABELS` catalog to decode Fire OS system apps (Silk Browser, Fire TV Launcher, Prime Video core daemons) and MediaTek HAL services (Audio Service, HW Composer, Codec C2).
* **Telemetry Process Cleaning & Transient Probe Filtering**:
  * Filtered out self-executing shell commands (`top`, `sh`, `-m`, `"`, `df`, `cat`) created during background telemetry polling, eliminating phantom process rows from the process table.
  * Reassembled bracketed kernel thread names split by whitespace (e.g. `[pre_signal_task]`), preventing truncation to generic suffixes like `task]`.

## [1.4.1] - 2026-11-21

### Added
* **Official TvMaster Brand Logo & Favicon**:
  * Generated high-resolution 3D cyberpunk app icon (`public/assets/logo.jpg`).
  * Crafted ultra-crisp vector SVG logo (`public/assets/logo.svg`) and browser favicon (`public/favicon.svg`) featuring a glassmorphic 4K smart display with cyber-cyan telemetry pulse wave.
* **Decluttered & Balanced UI Architecture**:
  * Streamlined top header: removed redundant manual IP/port text boxes in favor of direct navbar controls (polling speed, refresh, discovery, and add TV).
  * Removed redundant secondary "Device Details Bar", elevating specs directly into the interactive Active TV Card.
  * Balanced 3-column primary telemetry grid (RAM, CPU, Storage) with generous breathing room and high-contrast typography.
  * Consolidated Quick Actions into a unified action toolbar cleanly dividing performance boost pills from device controls.

## [1.4.0] - 2026-11-21

### Added
* **1-Click TV Device Cards & Seamless Multi-TV Switching**:
  * Added dynamic **"My Android TVs"** card deck directly on the dashboard.
  * Saved TVs displayed as rich interactive cards showing TV name, model, IP/port, resolution, and live active state.
  * **Instant Switching**: Click any standby TV card or the "Switch TV" button to seamlessly switch ADB connection and live telemetry stream without retyping IP addresses.
  * Added **Add TV Modal** (`#modal-add-tv`) to easily register multiple Android TVs by IP and custom nickname.
  * Added **Rename TV** capability and delete actions directly from TV cards.
  * Persistent storage engine (`data/devices.json`) keeping device roster synchronized across container reboots.
* **Network Auto-Discovery Fix for Docker & Multi-Subnet Environments**:
  * Fixed auto-discovery failing in bridged Docker containers where `os.networkInterfaces()` only saw internal virtual `172.18.x` networks.
  * Implemented multi-subnet resolver extracting physical LAN subnets from Host headers, client IPs, saved device lists, and `SCAN_SUBNET` env vars.
  * Added **Target Subnet Selector** in Auto-Discovery modal with one-click presets (`10.0.0.*`, `192.168.1.*`, `192.168.0.*`) and custom CIDR input.
  * Refactored socket prober with hard timeout timer preventing connection hang on unresponsive addresses.
  * 1-Click "Switch & Connect" button directly on discovered device items.

## [1.3.3] - 2026-11-21

### Added
* **Dedicated TV Reboot Option with Smart Auto-Reconnection Flow**:
  * Added prominent **Reboot TV** quick action button directly in the main dashboard action bar.
  * Added Cyber Dark **Reboot Android TV Modal** (`#modal-reboot`) with device identity verification, impact warnings, and animated reboot progress spinner.
  * Automated reconnect loop: initiates an intelligent 25s boot countdown, then polls ADB every 3 seconds to seamlessly re-establish connection and resume telemetry as soon as the TV comes back online.
  * Resilient backend reboot handling in `adbService.js` that safely tolerates abrupt socket termination during TV shutdown.

## [1.3.2] - 2026-11-20

### Added
* **Seamless Auto-Reconnect & Persistent Server Configuration**:
  * Added `data/config.json` persistent configuration engine across container restarts.
  * Backend now automatically attempts reconnect on container launch to the last saved TV IP or `TV_IP` environment variable.
  * Frontend automatically triggers auto-connect on page load if the TV was previously connected or an IP is cached, eliminating manual reconnection clicks after reboot.
  * Instant telemetry snapshot request (`refresh_now`) emitted on WebSocket open for zero-wait UI population.
* **Process Name Alignment Fix**:
  * Enhanced `parseTop` in `telemetryService.js` to prevent numeric column drift when parsing kernel/system tasks.

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
