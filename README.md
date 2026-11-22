# TvMaster

<div align="center">

<img src="./public/assets/logo.svg" alt="TvMaster Logo" width="96" height="96" />

![Version](https://img.shields.io/badge/version-1.7.2-blue.svg)
![Platform](https://img.shields.io/badge/platform-Docker%20%7C%20Linux%20%7C%20Windows-green.svg)
![Devices](https://img.shields.io/badge/Devices-Android%20TV%20%7C%20Fire%20TV%20%7C%20Shield%20%7C%20Chromecast-brightgreen.svg)
![Node.js](https://img.shields.io/badge/node-%3E%3D20.0.0-emerald.svg)
![Tests](https://img.shields.io/badge/tests-47%2F47%20passing-brightgreen.svg)
![License](https://img.shields.io/badge/license-MIT-purple.svg)

**Zero-Overhead Android TV, Fire TV & Streaming Device Resource Monitor, Task Manager & Debloat Hub for Docker & Home Servers**

</div>

---

## 📺 Overview

Is your Android TV, Google TV, or Android TV Box stuttering, lagging, or running out of memory?

**TvMaster** is a lightweight, self-hosted web application that gives you a **Windows Task Manager-style dashboard** for your TV directly in your laptop or phone browser. It connects over your home local network via ADB (TCP/IP), allowing you to monitor CPU, RAM, and Storage, kill hung background apps, and freeze OEM manufacturer bloatware.

### 🛡️ The Zero-Load Guarantee
Unlike on-device "cleaner" or "booster" apps that consume valuable TV memory and slow down video playback:
* **Zero TV Overhead:** TvMaster runs entirely on your home server (or PC).
* **Passive Adaptive Polling:** Metric collection only runs when a browser tab is actively open via WebSocket. When you close the tab, **polling shuts off completely (0% TV load)**.
* **Fast Kernel Reads:** Queries lightweight pseudofiles (`/proc/stat`, `/proc/meminfo`, `df`) executing in **< 1ms**, avoiding CPU-heavy `dumpsys` loops.

---

## ✨ Features

* **📱 Dedicated Installed Applications Manager:**
  * Full inventory of all 3rd-party streaming apps and games installed on the TV (whether currently running in RAM or closed/dormant).
  * Automatically resolves readable titles and avatars (Netflix, Kodi, SmartTube, Plex, Prime Video, Stremio, etc.).
  * Real-time running indicators (`🟢 Running` vs `⚪ Idle`).
  * 1-Click Storage Management:
    * 🗑️ **Uninstall**: Safely remove unused apps to immediately recover internal storage space.
    * 🧹 **Clear Data**: Wipe app cache and reset storage without uninstallation.
    * ▶️ **Launch**: Open any app directly on the TV.
  * Instant search filter by app name or package ID.
* **⚡ Real-Time Resource Gauges:**
  * **RAM Breakdown:** Visual segmented bar showing Active Apps, Cached Memory, and Free Memory.
  * **CPU Architecture & Per-Core Utilization (Zero TV Overhead):**
    * Detects hardware CPU architecture (`ARMv8 64-bit`, `ARMv8 32-bit v7l`, `x86_64`) and SoC platform (e.g., `MediaTek MT9689`).
    * Real-time dynamic per-core utilization micro-bars (`C0`, `C1`, `C2`, `C3`) parsed directly from `/proc/stat` with zero additional commands or TV load.
    * 1m / 5m / 15m load averages and kernel execution benchmarks.
  * **Storage Inspector:** Free vs Used internal storage (`/data`).
  * **Thermal Health:** TV CPU temperature and thermal throttling indicator.
* **🖥️ Display Capabilities, Video Modes & HDR Specs:**
  * Real-time hardware HDMI handshake detection querying panel specs **once on connection** (0% recurring load).
  * Video modes & FPS: resolution, refresh rates (e.g. `3840x2160 @ 60.00 Hz`), and display density.
  * Full High Dynamic Range (HDR) matrix: **Dolby Vision**, **HDR10+**, **HDR10**, and **HLG** detection with peak luminance reporting.
  * Auto Low Latency Mode (**ALLM**) and Game Mode detection.
* **📺 Multi-Device & Universal Streaming Support:**
  * Support for **Amazon Fire TV / Firestick / Cube**, **NVIDIA Shield**, **Google Chromecast**, **Smart Projectors**, and **Android TVs**.
  * 1-click device switching, automatic device classification, and custom labels.
* **📊 Live Task Manager Table:**
  * Real-time list of running apps and system daemons sorted by CPU & RAM consumption.
  * Instant search and package filtering.
  * One-click **"End Task"** (`am force-stop`) to immediately release RAM from runaway apps.
* **🚀 One-Click TV Speed Boosts:**
  * **Instant Animation Tuning:** Set Window, Transition, and Animator scales to `0.5x` (2x faster navigation) or `0x` (instant app switches).
  * **RAM Flush:** Drop all cached background apps with a single click (`am kill-all`).
* **🛡️ Bloatware Hunter (Safe Debloat):**
  * Curated database of manufacturer telemetry and promotional ad services (Sony, TCL, Xiaomi, Google TV recommendations).
  * Non-root package freeze (`pm disable-user --user 0`) and unfreeze (`pm enable`).
* **🔍 Network Auto-Discovery:**
  * One-click subnet scan sweeps local IP addresses on port `5555` to find your TV automatically.
  * Remembers your TV IP in local storage for instant reconnects.
* **🎮 Virtual Remote & Keyboard Helper:**
  * Full D-Pad controls (Up, Down, Left, Right, OK, Back, Home, Menu, Volume).
  * Type text, URLs, and complex passwords on your computer keyboard and send them directly to any active text input on your TV (`input text`).
  * Clean soft reboot control.
* **🤖 Model Context Protocol (MCP) Server:**
  * Native MCP server (`src/mcp/server.js`) compliant with the official `@modelcontextprotocol/sdk`.
  * Allows AI assistants (Antigravity, Claude, Cursor, ChatGPT) to inspect TV telemetry, kill runaway tasks, flush RAM, adjust animations, freeze bloatware, and send remote keystrokes.

---

## 🚀 Quickstart Guide

### Step 1: Enable Network Debugging on your Android TV
1. On your TV, navigate to **Settings > Device Preferences > About** (or **Settings > System > About** on Google TV).
2. Scroll down to **Build** and click the `OK` button on your remote **7 times** until you see the message:  
   *"You are now a developer!"*
3. Go back one menu to **Settings > Device Preferences > Developer options**.
4. Scroll down and turn **ON**:
   * **USB Debugging**
   * **Network Debugging** (or **Wireless Debugging** if listed).
5. Find your TV's local IP address under **Settings > Network & Internet** (e.g. `192.168.1.145`).

---

### Step 2: Deploy with Docker Compose or Portainer (Recommended)

1. **Via Portainer / Dockge Stack or standard `docker-compose.yml`**:
   ```yaml
   version: '3.8'

   services:
     tvmaster:
       image: ghcr.io/akhilgupta2007/tvmaster:latest
       container_name: tvmaster
       restart: unless-stopped
       ports:
         - "3055:3055"
       environment:
         - PORT=3055
         - NODE_ENV=production
         # Optional: set your TV IP to auto-connect on startup
         # - TV_IP=10.0.0.13
       volumes:
         - tvmaster-adb-keys:/root/.android
         - tvmaster-data:/app/data
       healthcheck:
         test: ["CMD", "curl", "-f", "http://localhost:3055/api/health"]
         interval: 30s
         timeout: 5s
         retries: 3

   volumes:
     tvmaster-adb-keys:
       name: tvmaster_adb_keys
     tvmaster-data:
       name: tvmaster_data
   ```

2. Launch the container:
   ```bash
   docker compose up -d
   ```
3. Open your browser to:
   ```
   http://<your-home-server-ip>:3055
   ```

> **Note on Persistent Volumes:**
> - `tvmaster-adb-keys` (`/root/.android`): Persists your ADB authorization keys so you only have to approve the TV screen prompt once!
> - `tvmaster-data` (`/app/data`): Persists your saved TV device cards, custom nicknames, and configuration across container updates.

---

### Step 3: Local Node.js Run (Optional)

If running directly on a workstation without Docker:
```bash
cd tvmaster
npm install --omit=dev
node src/server.js
```
Or simply double-click `deploy.bat` on Windows.

---

### Step 4: First-Time Pairing Authorization

1. On the TvMaster web dashboard, click **"Auto-Discover"** (or type your TV's IP) and click **Connect**.
2. Look at your TV screen. A prompt will appear:
   > *"Allow USB/Network debugging from this computer?"*
3. Check the box **"Always allow from this computer"** using your remote and click **OK**.
4. The dashboard will immediately turn green with **Connected** status and display live TV metrics!

---

## ⚙️ Configuration & Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3055` | Port the web dashboard listens on |
| `TV_IP` | *(empty)* | Optional: Set TV IP to auto-connect on container startup (e.g. `192.168.1.145`) |
| `NODE_ENV` | `production` | Environment mode (`production` or `development`) |

### Example `.env` or Compose Override
```yaml
services:
  tvmaster:
    environment:
      - PORT=3055
      - TV_IP=192.168.1.145
```

---

## 🔒 Security & Adversarial Hardening

TvMaster is built with robust security controls to protect your home network:
* **Command Injection Defense:** All incoming inputs (IP addresses, port numbers, package names, animation scale floats, and remote key codes) are strictly validated against strict whitelist regular expressions before passing to ADB.
* **Prototype Pollution Protection:** JSON body parsers prevent object prototype contamination (`__proto__` / `constructor`).
* **Input Sanitization:** Remote text injection automatically escapes shell metacharacters (`\\"'`$#&*|;<>~(){}` etc.).
* **Zero Cloud Dependency:** Runs 100% locally on your LAN with zero telemetry sent to external servers.
* **Test Suite:** Verified with 21 automated tests covering adversarial monkey fuzzing, 50KB payload boundaries, and extreme numeric edges.

---

## 🤖 Model Context Protocol (MCP) Integration

TvMaster exposes a native MCP server for AI agents.

### Adding TvMaster to Antigravity, Claude Desktop, or Cursor

Add this entry to your MCP configuration file (e.g. `claude_desktop_config.json` or Antigravity MCP settings):

```json
{
  "mcpServers": {
    "tvmaster": {
      "command": "node",
      "args": [
        "c:/Users/akhil/OneDrive/Documents/antigravity/tvmaster/src/mcp/server.js"
      ]
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
| :--- | :--- |
| `tv_connect` | Connects to TV IP and port over network ADB |
| `tv_get_status` | Returns device connection state, model, OS, and resolution |
| `tv_get_telemetry` | Real-time RAM, CPU, Load average, and Storage (< 1ms read) |
| `tv_list_processes` | Lists running processes with CPU % and memory in MB |
| `tv_kill_process` | Force stops a package (`am force-stop`) |
| `tv_flush_ram` | Drops cached background apps (`am kill-all`) |
| `tv_tune_speed` | Sets animation scales (`0.5`, `0`, `1.0`) |
| `tv_debloat_package` | Freezes or unfreezes manufacturer bloatware (`pm disable-user`) |
| `tv_send_remote_key` | Sends D-pad, Home, Back, Volume, Menu keys |
| `tv_send_text` | Types text directly into any active input on screen |
| `tv_discover_devices`| Sweeps local subnet for Android TVs |
| `tv_reboot` | Soft reboots the Android TV |
| `tv_get_display_specs` | Queries resolution, refresh rate/FPS, HDR matrix (Dolby Vision, HDR10+, HLG), and ALLM |
| `tv_list_devices` | Lists registered TV, Firestick, Shield, and Projector profiles with active status |
| `tv_switch_device` | Seamlessly switches active connection to another target device IP |
| `tv_launch_package` | Opens an app on the TV (`monkey -p`) |
| `tv_clear_app_data` | Clears app cache and data (`pm clear`) |
| `tv_uninstall_package` | Uninstalls an app package from the TV (`pm uninstall`) |
| `tv_list_installed_apps` | Lists all user-installed applications with resolved titles and package IDs |

---

## 📁 Project Directory Structure

```
tvmaster/
├── Dockerfile                  # Lightweight Alpine container with Node.js & ADB
├── docker-compose.yml          # Single-command deployment with volume persistence
├── package.json                # Dependencies & test runners
├── deploy.bat                  # One-click Windows deployment launcher
├── README.md                   # Full documentation & setup guide
├── CHANGELOG.md                # Release version history
├── src/
│   ├── server.js               # Express API + WebSocket telemetry hub
│   ├── constants.js            # Release versioning & regex security patterns
│   ├── controllers/
│   │   ├── processController.js# Task Manager (kill, RAM flush, debloat)
│   │   └── tuningController.js # Animations, remote keys, keyboard text
│   └── services/
│       ├── adbService.js       # Sanitized ADB execution engine
│       ├── telemetryService.js # Sub-millisecond /proc metric parser
│       └── discoveryService.js # Fast local subnet port 5555 scanner
├── public/
│   ├── index.html              # Modern Cyber Dark Dashboard
│   ├── css/styles.css          # Theme variables & custom scrollbars
│   └── js/app.js               # WebSocket client & interactive controllers
└── tests/
    ├── api.test.js             # API route & security validation tests
    ├── telemetry.test.js       # Metric parser unit tests
    └── security_and_fuzz.test.js # Adversarial monkey & fuzzing suite
```

---

## ❓ Troubleshooting

### 1. Connection times out or refuses
* Verify your TV and your home server are on the same local subnet / Wi-Fi network.
* Ensure **Developer Options > USB Debugging** is turned **ON** on your TV.
* Some TVs (e.g. newer Philips, Sony, or TCL) require turning on **"Network Debugging"** explicitly in Developer Options.

### 2. Device shows as "Unauthorized"
* Look at your TV screen while connecting. Android displays a confirmation dialog. Check *"Always allow"* and click **OK**.
* If the prompt doesn't appear, go to **Developer options > Revoke USB debugging authorizations** on your TV, then reconnect from TvMaster.

### 3. TV IP changes after reboot
* In your home Wi-Fi router settings, assign a **Static DHCP Reservation** for your Android TV so its IP never changes.

---

## 📄 License
MIT License. Created for the home server, homelab, and Android TV community.
