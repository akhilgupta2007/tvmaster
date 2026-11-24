/**
 * TvMaster - Remote File Manager Service
 * Provides secure on-demand file browsing, directory creation, deletion, and transfers via ADB
 * Version: 1.0.0
 */

const path = require('path');
const adbService = require('./adbService');

// Allowed root storage prefixes accessible by Android shell user
const ALLOWED_ROOTS = [
  '/sdcard',
  '/storage/emulated/0',
  '/storage',
  '/mnt/media_rw',
  '/mnt/sdcard'
];

// Protected directories that can never be deleted
const PROTECTED_PATHS = new Set([
  '/',
  '/sdcard',
  '/sdcard/',
  '/storage',
  '/storage/',
  '/storage/emulated',
  '/storage/emulated/',
  '/storage/emulated/0',
  '/storage/emulated/0/',
  '/mnt',
  '/mnt/'
]);

// Blocked system directories
const BLOCKED_PREFIXES = [
  '/system',
  '/vendor',
  '/data/data',
  '/proc',
  '/sys',
  '/dev',
  '/etc'
];

/**
 * Format bytes into human-readable strings
 */
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined || isNaN(bytes)) return '-';
  const b = parseInt(bytes, 10);
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${parseFloat((b / Math.pow(k, i)).toFixed(1))} ${sizes[i] || 'B'}`;
}

/**
 * Classify file category and pick visual icon
 */
function classifyFile(name, isDirectory) {
  if (isDirectory) {
    return { category: 'folder', icon: '📁', label: 'Folder' };
  }

  const ext = path.posix.extname(name).toLowerCase().replace('.', '');
  
  const videoExts = new Set(['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts', 'm4v', '3gp', 'flv']);
  if (videoExts.has(ext)) return { category: 'video', icon: '🎬', label: 'Video', ext };

  const audioExts = new Set(['mp3', 'aac', 'flac', 'wav', 'm4a', 'ogg', 'opus', 'wma']);
  if (audioExts.has(ext)) return { category: 'audio', icon: '🎵', label: 'Audio', ext };

  const imageExts = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg']);
  if (imageExts.has(ext)) return { category: 'image', icon: '🖼️', label: 'Image', ext };

  if (ext === 'apk') return { category: 'apk', icon: '📦', label: 'Android Package', ext };

  const archiveExts = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);
  if (archiveExts.has(ext)) return { category: 'archive', icon: '🗜️', label: 'Archive', ext };

  const docExts = new Set(['txt', 'log', 'json', 'xml', 'pdf', 'doc', 'docx', 'csv', 'md', 'conf', 'prop']);
  if (docExts.has(ext)) return { category: 'document', icon: '📄', label: 'Document', ext };

  return { category: 'file', icon: '📄', label: ext ? `${ext.toUpperCase()} File` : 'File', ext };
}

class FileService {
  /**
   * Strictly sanitize and validate remote path
   * Prevents path traversal and shell injection
   */
  sanitizePath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string' || rawPath.trim() === '') {
      return '/sdcard';
    }

    if (/[\0\r\n]/.test(rawPath)) {
      throw new Error('Access denied: path contains invalid control characters or null bytes');
    }

    // Strip dangerous shell command delimiters
    const cleaned = rawPath.replace(/[;&|`$><"'\\]/g, '').trim();

    // Posix normalization resolves .. and . safely
    const normalized = path.posix.normalize(cleaned);

    // Block root access and system traversal
    if (normalized === '/' || normalized === '') {
      throw new Error('Access denied: root directory access is restricted');
    }

    for (const blocked of BLOCKED_PREFIXES) {
      if (normalized === blocked || normalized.startsWith(blocked + '/')) {
        throw new Error(`Access denied: access to system path '${blocked}' is restricted`);
      }
    }

    // Verify path resides within allowed storage boundaries
    const isAllowed = ALLOWED_ROOTS.some(
      (root) => normalized === root || normalized.startsWith(root + '/')
    );

    if (!isAllowed) {
      throw new Error(`Access denied: path '${normalized}' is outside allowed storage locations`);
    }

    return normalized;
  }

  /**
   * Strictly sanitize a single file or directory name
   */
  sanitizeName(rawName) {
    if (!rawName || typeof rawName !== 'string') {
      throw new Error('Name cannot be empty');
    }

    if (/[\0\r\n/\\;&|`$><"']/.test(rawName)) {
      throw new Error('Invalid name provided: prohibited characters');
    }

    const cleaned = rawName.trim();
    if (!cleaned || cleaned === '.' || cleaned === '..') {
      throw new Error('Invalid name provided');
    }
    if (cleaned.length > 255) {
      throw new Error('Name exceeds maximum 255 characters');
    }
    return cleaned;
  }

  /**
   * Parse single toybox/toolbox ls line
   * Examples:
   * drwxrwx--x 4 root sdcard_rw 4096 2026-11-20 12:00 Download
   * -rw-rw---- 1 u0_a45 everybody 1048576 2026-11-20 14:30 video.mp4
   * lrwxrwxrwx 1 root root 21 2026-11-20 10:00 sdcard -> /storage/emulated/0
   */
  parseLsLine(rawLine, parentPath) {
    const line = rawLine.trim();
    if (!line || line.startsWith('total ') || line.includes(': Permission denied')) {
      return null;
    }

    const parts = line.split(/\s+/);
    if (parts.length < 6) return null;

    const permissions = parts[0];
    const isDirectory = permissions.startsWith('d');
    const isSymlink = permissions.startsWith('l');

    // Filename is the trailing part, which may contain spaces
    // Find index of time or date column
    // Toybox formats:
    // [0:perm] [1:links] [2:owner] [3:group] [4:size] [5:date] [6:time] [7..:name]
    // Or without links:
    // [0:perm] [1:owner] [2:group] [3:size] [4:date] [5:time] [6..:name]
    let nameIndex = -1;
    let size = 0;
    let modified = '';

    for (let i = 4; i < parts.length - 1; i++) {
      // Check for time format e.g. 14:30
      if (/^\d{1,2}:\d{2}$/.test(parts[i])) {
        nameIndex = i + 1;
        modified = `${parts[i - 1]} ${parts[i]}`;
        size = parseInt(parts[i - 2], 10) || 0;
        break;
      } else if (/^\d{4}$/.test(parts[i]) && i >= 2 && /^[A-Z][a-z]{2}$/.test(parts[i - 2])) {
        // Traditional month day year format: e.g. Nov 20 2025
        nameIndex = i + 1;
        modified = `${parts[i - 2]} ${parts[i - 1]} ${parts[i]}`;
        size = parseInt(parts[i - 3], 10) || 0;
        break;
      }
    }

    if (nameIndex === -1 || nameIndex >= parts.length) {
      // Fallback: take last element as name
      nameIndex = parts.length - 1;
    }

    let name = parts.slice(nameIndex).join(' ');
    // Handle symlink e.g. "sdcard -> /storage/emulated/0"
    if (isSymlink && name.includes(' -> ')) {
      name = name.split(' -> ')[0].trim();
    }

    // Ignore . and ..
    if (name === '.' || name === '..') {
      return null;
    }

    const itemPath = path.posix.join(parentPath, name);
    const classification = classifyFile(name, isDirectory);

    return {
      name,
      path: itemPath,
      isDirectory,
      isSymlink,
      size: isDirectory ? 0 : size,
      sizeFormatted: isDirectory ? '-' : formatBytes(size),
      permissions,
      modified: modified || 'Unknown',
      category: classification.category,
      icon: classification.icon,
      label: classification.label,
      ext: classification.ext || ''
    };
  }

  /**
   * List files and directories in remote path
   */
  async listFiles(rawPath = '/sdcard') {
    const targetPath = this.sanitizePath(rawPath);
    const parentPath = targetPath === '/sdcard' || targetPath === '/storage/emulated/0'
      ? null
      : path.posix.dirname(targetPath);

    // Query file listing and storage stats in parallel
    const [lsOutput, dfOutput] = await Promise.all([
      adbService.shell(`ls -la -p "${targetPath}" 2>/dev/null || ls -la "${targetPath}" 2>/dev/null`, 8000),
      adbService.shell(`df -k "${targetPath}" 2>/dev/null || true`, 4000)
    ]);

    const items = [];
    const lines = (lsOutput || '').split('\n');

    for (const line of lines) {
      const parsed = this.parseLsLine(line, targetPath);
      if (parsed) {
        items.push(parsed);
      }
    }

    // Sort: Folders first, then alphabetically case-insensitive
    items.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    // Parse free space from df output if available
    let storageStats = null;
    if (dfOutput) {
      const dfLines = dfOutput.trim().split('\n');
      if (dfLines.length >= 2) {
        const parts = dfLines[dfLines.length - 1].trim().split(/\s+/);
        if (parts.length >= 5) {
          const totalKb = parseInt(parts[1], 10) || 0;
          const usedKb = parseInt(parts[2], 10) || 0;
          const freeKb = parseInt(parts[3], 10) || 0;
          storageStats = {
            total: formatBytes(totalKb * 1024),
            used: formatBytes(usedKb * 1024),
            free: formatBytes(freeKb * 1024),
            usedPercent: parts[4].replace('%', '')
          };
        }
      }
    }

    return {
      currentPath: targetPath,
      parentPath,
      items,
      count: items.length,
      storage: storageStats
    };
  }

  /**
   * Create a new folder
   */
  async createDirectory(rawParentPath, rawName) {
    const parentPath = this.sanitizePath(rawParentPath);
    const folderName = this.sanitizeName(rawName);
    const fullPath = path.posix.join(parentPath, folderName);

    await adbService.shell(`mkdir -p "${fullPath}"`, 5000);
    return { success: true, path: fullPath, name: folderName };
  }

  /**
   * Delete a file or directory
   */
  async deleteItem(rawPath) {
    const sanitized = this.sanitizePath(rawPath);

    if (PROTECTED_PATHS.has(sanitized)) {
      throw new Error(`Cannot delete protected storage root '${sanitized}'`);
    }

    // Delete file or folder recursively
    const res = await adbService.shell(`rm -rf "${sanitized}"`, 10000);
    return { success: true, path: sanitized, output: res.trim() };
  }

  /**
   * Push uploaded file to remote path
   */
  async uploadFile(localTempPath, rawDestDir, originalName) {
    const destDir = this.sanitizePath(rawDestDir);
    const safeName = this.sanitizeName(originalName);
    const remoteDest = path.posix.join(destDir, safeName);

    await adbService.pushFile(localTempPath, remoteDest);
    return { success: true, path: remoteDest, name: safeName };
  }

  /**
   * Pull file from TV to local temp file for download
   */
  async downloadFile(rawRemotePath, localTempPath) {
    const remotePath = this.sanitizePath(rawRemotePath);
    await adbService.pullFile(remotePath, localTempPath);
    return { success: true, remotePath, localTempPath };
  }
}

module.exports = new FileService();
