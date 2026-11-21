/**
 * TvMaster - App Label Resolver Service
 * Multi-Tier Resolution: Memory Cache -> Local TV Component -> Online Stores -> Dictionary -> Heuristic
 * Version: 1.3.0
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '../../data/app_labels_cache.json');

// Built-in catalog of common Android TV apps, streaming platforms, and OEM services
const KNOWN_APP_LABELS = {
  // Video & Streaming Platforms
  'com.google.android.youtube.tv': 'YouTube on TV',
  'com.google.android.youtube.tvunplugged': 'YouTube TV',
  'org.smarttube.stable': 'SmartTube',
  'org.smarttube.beta': 'SmartTube Beta',
  'com.netflix.ninja': 'Netflix',
  'com.amazon.amazonvideo.livingroom': 'Prime Video',
  'com.disney.disneyplus': 'Disney+',
  'com.hulu.livingroomplus': 'Hulu',
  'com.apple.atve.androidtv.appletv': 'Apple TV',
  'com.peacocktv.peacockandroid': 'Peacock',
  'com.wbd.stream': 'Max (HBO)',
  'com.cbs.app': 'Paramount+',
  'tv.twitch.android.app': 'Twitch',
  'com.crunchyroll.crunchyroid': 'Crunchyroll',
  'com.tubitv': 'Tubi TV',
  'tv.pluto.android': 'Pluto TV',
  'com.plexapp.android': 'Plex',
  'org.jellyfin.androidtv': 'Jellyfin',
  'org.xbmc.kodi': 'Kodi',
  'org.videolan.vlc': 'VLC Media Player',
  'com.spotify.tv.android': 'Spotify',
  'com.pandora.android.atv': 'Pandora',

  // IPTV Players & Launchers
  'com.myiptvonline.implayer': 'iMPlayer TV IPTV Player',
  'com.spocky.projengmenu': 'Projectivy Launcher',
  'com.nst.iptvsmarterstvbox': 'IPTV Smarters Pro',
  'ru.yotadev.tivimate': 'TiviMate IPTV',
  'com.tivimate': 'TiviMate',
  'com.navixstream': 'XCIPTV Player',
  'cm.aptoidetv.pt': 'Aptoide TV',
  'com.aurora.store': 'Aurora Store',
  'org.fdroid.fdroid': 'F-Droid',

  // Google TV & Android Core Services
  'com.google.android.tvlauncher': 'Android TV Home',
  'com.google.android.apps.tv.launcherx': 'Google TV Home',
  'com.google.android.tvrecommendations': 'Android TV Recommendations',
  'com.google.android.tv.recommendations': 'Google TV Ads & Promo',
  'com.google.android.katniss': 'Google Assistant & Search',
  'com.google.android.tts': 'Speech Services by Google',
  'com.google.android.gms': 'Google Play Services',
  'com.google.android.gsf': 'Google Services Framework',
  'com.android.vending': 'Google Play Store',
  'com.google.android.videos': 'Google TV / Movies',
  'com.google.android.play.games': 'Google Play Games',
  'com.google.android.apps.mediashell': 'Chromecast Built-in',
  'com.android.tv.settings': 'Android TV Settings',
  'com.android.settings': 'System Settings',
  'com.android.systemui': 'System UI',
  'com.android.packageinstaller': 'Package Installer',
  'android': 'Android System Kernel',

  // Hisense / MediaTek / OEM System Services
  'com.mediatek.tis': 'MediaTek TV Input Service',
  'com.mediatek.tvcm': 'MediaTek Channel Manager',
  'com.mediatek.wwtv.tvcenter': 'Hisense TV Center',
  'com.jamdeo.tv.vod': 'VIDAA / Hisense Video Service',
  'com.hisense.tv.service': 'Hisense TV Service',
  'com.hisense.service.telemetry': 'Hisense Telemetry',
  'com.sony.dtv.b2b': 'Sony B2B Telemetry',
  'com.sony.dtv.customersupport': 'Sony Customer Support',
  'com.tcl.partner.tclapp': 'TCL Partner App',
  'com.xiaomi.mitv.upgrade': 'Mi TV Upgrade Service',
  'com.amazon.whisperplay.contracts': 'Amazon WhisperPlay Service'
};

class AppLabelService {
  constructor() {
    this.memoryCache = new Map();
    this.pendingLookups = new Set();
    this.loadCacheFromDisk();
  }

  loadCacheFromDisk() {
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const raw = fs.readFileSync(CACHE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        for (const [k, v] of Object.entries(parsed)) {
          this.memoryCache.set(k, v);
        }
      }
    } catch (e) {
      // Ignore cache load errors
    }
  }

  saveCacheToDisk() {
    try {
      const dir = path.dirname(CACHE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const obj = Object.fromEntries(this.memoryCache);
      fs.writeFileSync(CACHE_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
      // Ignore cache write errors
    }
  }

  /**
   * Fast synchronous resolve for real-time telemetry rendering.
   * If not cached or in dictionary, triggers non-blocking online lookup in background.
   */
  resolve(packageId) {
    if (!packageId || typeof packageId !== 'string') {
      return 'Unknown';
    }

    const pkg = packageId.trim();

    // 1. Persistent memory cache
    if (this.memoryCache.has(pkg)) {
      return this.memoryCache.get(pkg);
    }

    // 2. Built-in curated dictionary
    if (KNOWN_APP_LABELS[pkg]) {
      this.memoryCache.set(pkg, KNOWN_APP_LABELS[pkg]);
      return KNOWN_APP_LABELS[pkg];
    }

    // 3. System kernel threads or binaries
    if (pkg.startsWith('[') && pkg.endsWith(']')) {
      return pkg;
    }
    if (pkg.startsWith('/system/bin/') || pkg.startsWith('/vendor/bin/')) {
      return pkg.split('/').pop();
    }

    // 4. Trigger asynchronous online lookup if it looks like an Android package (e.g. com.something)
    if (pkg.includes('.') && !this.pendingLookups.has(pkg)) {
      this.fetchOnlineAsync(pkg);
    }

    // 5. Fallback to clean heuristic title
    const fallback = this.heuristicFormat(pkg);
    return fallback;
  }

  /**
   * Non-blocking online lookup via Google Play Store & F-Droid web metadata
   */
  async fetchOnlineAsync(packageId) {
    this.pendingLookups.add(packageId);

    try {
      const title = await this.queryGooglePlayStore(packageId);
      if (title) {
        this.memoryCache.set(packageId, title);
        this.saveCacheToDisk();
        return title;
      }
    } catch (e) {
      // Ignore network errors
    } finally {
      this.pendingLookups.delete(packageId);
    }

    return null;
  }

  /**
   * Query Google Play Store public web page for official application title
   */
  queryGooglePlayStore(packageId) {
    return new Promise((resolve) => {
      const url = `https://play.google.com/store/apps/details?id=${encodeURIComponent(packageId)}&hl=en`;
      const req = https.get(
        url,
        {
          headers: {
            'User-Agent': 'curl/7.68.0'
          },
          timeout: 4000
        },
        (res) => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(null);
          }

          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
            // Stop early if title found
            if (body.includes('</title>')) {
              req.destroy();
            }
          });

          res.on('end', () => {
            const m = body.match(/<title id=["']main-title["']>([^<]+)<\/title>/i);
            if (m && m[1]) {
              const cleaned = m[1]
                .replace(/\s*-\s*Apps on Google Play/i, '')
                .replace(/\s*-\s*Android Apps on Google Play/i, '')
                .trim();
              return resolve(cleaned);
            }
            resolve(null);
          });
        }
      );

      req.on('error', () => resolve(null));
      req.on('timeout', () => {
        req.destroy();
        resolve(null);
      });
    });
  }

  /**
   * Clean up uncatalogued reverse-domain package names into readable title
   */
  heuristicFormat(pkg) {
    const parts = pkg.split('.').filter(Boolean);
    if (parts.length <= 1) {
      return pkg;
    }

    const prefixes = new Set(['com', 'org', 'net', 'io', 'tv', 'cm', 'de', 'app', 'android']);
    let filtered = parts;
    if (prefixes.has(filtered[0]?.toLowerCase())) {
      filtered = filtered.slice(1);
    }

    if (filtered.length === 0) {
      return parts[parts.length - 1];
    }

    let candidate = filtered.length >= 2 ? filtered[filtered.length - 1] : filtered[0];

    const genericSuffixes = new Set(['app', 'tv', 'android', 'client', 'stable', 'release', 'box', 'beta', 'free']);
    if (genericSuffixes.has(candidate.toLowerCase()) && filtered.length >= 2) {
      candidate = `${filtered[filtered.length - 2]} ${candidate}`;
    }

    const formatted = candidate
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return formatted || parts[parts.length - 1];
  }

  /**
   * Set custom alias
   */
  setAlias(packageId, customName) {
    if (packageId && customName) {
      this.memoryCache.set(packageId.trim(), customName.trim());
      this.saveCacheToDisk();
    }
  }

  getAllKnown() {
    return { ...KNOWN_APP_LABELS, ...Object.fromEntries(this.memoryCache) };
  }
}

module.exports = new AppLabelService();
