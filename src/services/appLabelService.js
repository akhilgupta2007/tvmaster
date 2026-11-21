/**
 * TvMaster - App Label Resolver Service
 * Decodes Android package IDs into human-readable Application Names
 */

// Comprehensive dictionary of common Android TV apps, streaming platforms, launchers, IPTV players, and OEM services
const KNOWN_APP_LABELS = {
  // Video & Streaming Platforms
  'com.google.android.youtube.tv': 'YouTube',
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
  'com.mxtech.videoplayer.ad': 'MX Player',
  'com.mxtech.videoplayer.pro': 'MX Player Pro',
  'com.bsp.player.android': 'BSPlayer',
  'com.spotify.tv.android': 'Spotify',
  'com.pandora.android.atv': 'Pandora',
  'deezer.android.tv': 'Deezer',
  'com.tidal.tv': 'Tidal',

  // IPTV Players & Launchers
  'com.myiptvonline.implayer': 'IMPlayer',
  'com.spocky.projengmenu': 'Projectivy Launcher',
  'com.nst.iptvsmarterstvbox': 'IPTV Smarters Pro',
  'ru.yotadev.tivimate': 'TiviMate IPTV',
  'com.tivimate': 'TiviMate',
  'com.navixstream': 'XCIPTV Player',
  'com.bubblesoft.android.bubbleupnp': 'BubbleUPnP',
  'cm.aptoidetv.pt': 'Aptoide TV',
  'com.aurora.store': 'Aurora Store',
  'org.fdroid.fdroid': 'F-Droid',
  'com.amaze.filemanager': 'Amaze File Manager',
  'com.speedsoftware.rootexplorer': 'Root Explorer',
  'com.cxinventor.file.explorer': 'Cx File Explorer',
  'com.lonelycatgames.Xplore': 'X-plore File Manager',
  'com.ghisler.android.TotalCommander': 'Total Commander',
  'com.topjohnwu.magisk': 'Magisk',
  'com.wireguard.android': 'WireGuard',
  'com.nordvpn.android': 'NordVPN',
  'com.surfshark.vpnclient.android': 'Surfshark VPN',
  'expressvpn.vpn': 'ExpressVPN',
  'com.adguard.android': 'AdGuard',
  'com.tailscale.ipn': 'Tailscale',

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
  'com.google.android.packageinstaller': 'Google Package Installer',
  'com.android.shell': 'Android Shell Daemon',
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
    this.customAliases = new Map();
  }

  /**
   * Resolve a package identifier or process command to a friendly App Name
   */
  resolve(packageId) {
    if (!packageId || typeof packageId !== 'string') {
      return 'Unknown';
    }

    const pkg = packageId.trim();

    // 1. Check custom user aliases
    if (this.customAliases.has(pkg)) {
      return this.customAliases.get(pkg);
    }

    // 2. Check curated dictionary
    if (KNOWN_APP_LABELS[pkg]) {
      return KNOWN_APP_LABELS[pkg];
    }

    // 3. System process or kernel thread (e.g. [kworker], /system/bin/surfaceflinger)
    if (pkg.startsWith('[') && pkg.endsWith(']')) {
      return pkg;
    }
    if (pkg.startsWith('/system/bin/') || pkg.startsWith('/vendor/bin/')) {
      return pkg.split('/').pop();
    }

    // 4. Intelligent heuristic decomposition
    return this.heuristicFormat(pkg);
  }

  /**
   * Clean up uncatalogued reverse-domain package names into readable title
   */
  heuristicFormat(pkg) {
    const parts = pkg.split('.').filter(Boolean);
    if (parts.length <= 1) {
      return pkg;
    }

    // Remove common prefixes
    const prefixes = new Set(['com', 'org', 'net', 'io', 'tv', 'cm', 'de', 'app', 'android']);
    let filtered = parts;
    if (prefixes.has(filtered[0]?.toLowerCase())) {
      filtered = filtered.slice(1);
    }

    if (filtered.length === 0) {
      return parts[parts.length - 1];
    }

    // Take the meaningful segment (usually the last or company+app)
    let candidate = filtered.length >= 2 ? filtered[filtered.length - 1] : filtered[0];

    // If last token is generic like 'app', 'tv', 'android', 'client', 'pro', 'stable', 'release', take previous token
    const genericSuffixes = new Set(['app', 'tv', 'android', 'client', 'stable', 'release', 'box', 'beta', 'free']);
    if (genericSuffixes.has(candidate.toLowerCase()) && filtered.length >= 2) {
      candidate = `${filtered[filtered.length - 2]} ${candidate}`;
    }

    // Format camelCase and underscores: 'projengmenu' -> 'Proj Eng Menu', 'implayer' -> 'Implayer'
    const formatted = candidate
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .split(' ')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return formatted || parts[parts.length - 1];
  }

  /**
   * Set custom alias for a package
   */
  setAlias(packageId, customName) {
    if (packageId && customName) {
      this.customAliases.set(packageId.trim(), customName.trim());
    }
  }

  /**
   * Get all registered labels for bulk querying
   */
  getAllKnown() {
    return { ...KNOWN_APP_LABELS, ...Object.fromEntries(this.customAliases) };
  }
}

module.exports = new AppLabelService();
