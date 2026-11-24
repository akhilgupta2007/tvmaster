/**
 * TvMaster - Remote File Manager Controller
 * Request handling for file browsing, directory operations, uploads and downloads
 * Version: 1.0.0
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const fileService = require('../services/fileService');
const adbService = require('../services/adbService');

class FileController {
  /**
   * List files in directory
   */
  async listFiles(req, res) {
    try {
      const targetPath = fileService.sanitizePath(req.query.path || '/sdcard');
      if (!adbService.connected) {
        return res.status(400).json({ error: 'Device not connected' });
      }
      const result = await fileService.listFiles(targetPath);
      return res.json({ success: true, ...result });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  /**
   * Create a new folder
   */
  async createDirectory(req, res) {
    try {
      const { path: parentPath, name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Folder name is required' });
      }
      const cleanParent = fileService.sanitizePath(parentPath || '/sdcard');
      const cleanName = fileService.sanitizeName(name);

      if (!adbService.connected) {
        return res.status(400).json({ error: 'Device not connected' });
      }
      const result = await fileService.createDirectory(cleanParent, cleanName);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  /**
   * Delete a file or directory
   */
  async deleteItem(req, res) {
    try {
      const { path: itemPath } = req.body;
      if (!itemPath) {
        return res.status(400).json({ error: 'Path is required' });
      }
      const cleanPath = fileService.sanitizePath(itemPath);
      const PROTECTED_ROOTS = new Set([
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
      if (PROTECTED_ROOTS.has(cleanPath)) {
        return res.status(400).json({ error: `Cannot delete protected storage root '${cleanPath}'` });
      }

      if (!adbService.connected) {
        return res.status(400).json({ error: 'Device not connected' });
      }
      const result = await fileService.deleteItem(cleanPath);
      return res.json(result);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }

  /**
   * Upload file to TV
   */
  async uploadFile(req, res) {
    let tempPath = null;
    try {
      if (!adbService.connected) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Device not connected' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      tempPath = req.file.path;
      const destDir = req.body.destinationPath || '/sdcard/Download';
      const originalName = req.file.originalname || path.basename(tempPath);

      const result = await fileService.uploadFile(tempPath, destDir, originalName);
      
      // Clean up local temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }

      return res.json({
        success: true,
        message: `Successfully uploaded ${result.name}`,
        ...result
      });
    } catch (err) {
      if (tempPath && fs.existsSync(tempPath)) {
        fs.unlink(tempPath, () => {});
      }
      return res.status(400).json({ error: err.message });
    }
  }

  /**
   * Download file from TV
   */
  async downloadFile(req, res) {
    let localTempPath = null;
    try {
      const remotePath = req.query.path;
      if (!remotePath) {
        return res.status(400).json({ error: 'Path query parameter is required' });
      }
      const safePath = fileService.sanitizePath(remotePath);

      if (!adbService.connected) {
        return res.status(400).json({ error: 'Device not connected' });
      }
      const filename = path.posix.basename(safePath);
      const tempDir = path.join(os.tmpdir(), 'tvmaster-downloads');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      localTempPath = path.join(tempDir, `dl-${Date.now()}-${filename}`);
      await fileService.downloadFile(safePath, localTempPath);

      // Stream file to user browser
      res.download(localTempPath, filename, (err) => {
        // Clean up temporary local file after transfer completes
        if (localTempPath && fs.existsSync(localTempPath)) {
          fs.unlink(localTempPath, () => {});
        }
      });
    } catch (err) {
      if (localTempPath && fs.existsSync(localTempPath)) {
        fs.unlink(localTempPath, () => {});
      }
      return res.status(400).json({ error: err.message });
    }
  }
}

module.exports = new FileController();
