/**
 * TvMaster - Remote File Manager & Storage Security Test Suite
 * Tests Path Traversal, Root Storage Confinement, File/Folder Name Sanitization,
 * Output Parsing, and Deletion Protection.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const fileService = require('../src/services/fileService');
const { server } = require('../src/server');

const TEST_PORT = 3297;
const baseUrl = `http://localhost:${TEST_PORT}`;

describe('TvMaster Remote File Manager & Security Suite', () => {
  before((done) => {
    server.listen(TEST_PORT, done);
  });

  after((done) => {
    server.close(done);
  });

  // --- 1. Path Traversal & Root Confinement Security ---
  test('Path Sanitization: allows valid Android TV storage locations', () => {
    const validPaths = [
      '/sdcard',
      '/sdcard/Download',
      '/sdcard/Movies/2026',
      '/storage/emulated/0',
      '/storage/emulated/0/DCIM',
      '/storage/usbotg'
    ];

    for (const p of validPaths) {
      const sanitized = fileService.sanitizePath(p);
      assert.ok(sanitized.startsWith('/sdcard') || sanitized.startsWith('/storage') || sanitized.startsWith('/mnt'));
    }
  });

  test('Path Sanitization: blocks path traversal attacks and system directories', () => {
    const maliciousPaths = [
      '../../etc/passwd',
      '/sdcard/../../../system/bin/sh',
      '/system',
      '/vendor/lib',
      '/data/data/com.example',
      '/proc/1/cmdline',
      '/sys/kernel',
      '/dev/block',
      '/etc/hosts',
      '/sdcard/..',
      '/sdcard/../..'
    ];

    for (const p of maliciousPaths) {
      assert.throws(() => {
        fileService.sanitizePath(p);
      }, /Access denied|Forbidden/i);
    }
  });

  test('Path Sanitization: rejects null bytes and control characters', () => {
    const dirty = ['/sdcard/test\0.txt', '/sdcard/test\r\nfolder'];
    for (const p of dirty) {
      assert.throws(() => {
        fileService.sanitizePath(p);
      });
    }
  });

  // --- 2. Folder and File Name Sanitization ---
  test('Name Sanitization: sanitizes clean and boundary file/folder names', () => {
    assert.strictEqual(fileService.sanitizeName('Movies_2026'), 'Movies_2026');
    assert.strictEqual(fileService.sanitizeName('My File-1.2.mp4'), 'My File-1.2.mp4');
  });

  test('Name Sanitization: strips or rejects path separators and dangerous shell characters', () => {
    const badNames = [
      '../escape',
      'folder/subfolder',
      'folder\\subfolder',
      'test;rm -rf /',
      'test`whoami`',
      'test$(id)',
      'test|sh',
      'test&touch pwned'
    ];

    for (const name of badNames) {
      assert.throws(() => {
        fileService.sanitizeName(name);
      }, /Invalid.*name/i);
    }
  });

  // --- 3. Protection of Storage Roots Against Deletion ---
  test('Deletion Protection: blocks deletion of root storage directories', async () => {
    const rootPaths = [
      '/',
      '/sdcard',
      '/sdcard/',
      '/storage',
      '/storage/',
      '/storage/emulated',
      '/storage/emulated/0',
      '/storage/emulated/0/'
    ];

    for (const root of rootPaths) {
      await assert.rejects(
        async () => {
          await fileService.deleteItem(root);
        },
        /Cannot delete protected storage root|Access denied/i
      );
    }
  });

  // --- 4. `ls -la` Parsing & File Classification ---
  test('Parser: parseLsLine parses directories and files accurately', () => {
    const dirLine = 'drwxrwxr-x  4 root sdcard_rw     4096 2026-11-20 18:22 Download';
    const parsedDir = fileService.parseLsLine(dirLine, '/sdcard');
    assert.ok(parsedDir);
    assert.strictEqual(parsedDir.name, 'Download');
    assert.strictEqual(parsedDir.path, '/sdcard/Download');
    assert.strictEqual(parsedDir.isDirectory, true);
    assert.strictEqual(parsedDir.category, 'folder');
    assert.strictEqual(parsedDir.icon, '📁');

    const fileLine = '-rw-rw-r--  1 u0_a15 sdcard_rw 15728640 2026-11-21 14:05 sample_video.mp4';
    const parsedFile = fileService.parseLsLine(fileLine, '/sdcard');
    assert.ok(parsedFile);
    assert.strictEqual(parsedFile.name, 'sample_video.mp4');
    assert.strictEqual(parsedFile.path, '/sdcard/sample_video.mp4');
    assert.strictEqual(parsedFile.isDirectory, false);
    assert.strictEqual(parsedFile.category, 'video');
    assert.strictEqual(parsedFile.icon, '🎬');
    assert.strictEqual(parsedFile.size, 15728640);
    assert.strictEqual(parsedFile.sizeFormatted, '15 MB');

    // Filenames with spaces
    const spaceLine = '-rw-rw-r--  1 root sdcard_rw    1024 2026-11-22 09:12 My Document 2026.pdf';
    const parsedSpace = fileService.parseLsLine(spaceLine, '/sdcard/Documents');
    assert.ok(parsedSpace);
    assert.strictEqual(parsedSpace.name, 'My Document 2026.pdf');
    assert.strictEqual(parsedSpace.path, '/sdcard/Documents/My Document 2026.pdf');

    // Toybox trailing slash from ls -p
    const slashLine = 'drwxrwxr-x  4 root sdcard_rw     4096 2026-11-20 18:22 Download/';
    const parsedSlash = fileService.parseLsLine(slashLine, '/sdcard');
    assert.ok(parsedSlash);
    assert.strictEqual(parsedSlash.name, 'Download');
    assert.strictEqual(parsedSlash.path, '/sdcard/Download');
    assert.strictEqual(parsedSlash.isDirectory, true);

    // Toybox ./ and ../ filtered out
    assert.strictEqual(fileService.parseLsLine('drwxrwxr-x  4 root sdcard_rw 4096 2026-11-20 18:22 ./', '/sdcard'), null);
    assert.strictEqual(fileService.parseLsLine('drwxrwxr-x  4 root sdcard_rw 4096 2026-11-20 18:22 ../', '/sdcard'), null);

    // Symlinks to storage/emulated directories
    const symlinkDirLine = 'lrwxrwxrwx  1 root root           21 2008-12-31 19:00 sdcard -> /storage/emulated/0';
    const parsedSymlink = fileService.parseLsLine(symlinkDirLine, '/');
    assert.ok(parsedSymlink);
    assert.strictEqual(parsedSymlink.name, 'sdcard');
    assert.strictEqual(parsedSymlink.isDirectory, true);
    assert.strictEqual(parsedSymlink.category, 'folder');
  });

  // --- 5. HTTP API Endpoints Validation ---
  test('API: GET /api/files rejects path traversal with 400', async () => {
    const res = await fetch(`${baseUrl}/api/files?path=../../etc/passwd`);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Access denied') || data.error.includes('Forbidden'));
  });

  test('API: POST /api/files/mkdir rejects malicious directory names with 400', async () => {
    const res = await fetch(`${baseUrl}/api/files/mkdir`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentPath: '/sdcard', name: '../evil_folder' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error);
  });

  test('API: DELETE /api/files rejects deletion of /sdcard with 400', async () => {
    const res = await fetch(`${baseUrl}/api/files`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/sdcard' })
    });
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('protected storage root'));
  });

  test('API: GET /api/files/download rejects unauthorized system file downloads with 400', async () => {
    const res = await fetch(`${baseUrl}/api/files/download?path=/system/build.prop`);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.ok(data.error.includes('Access denied') || data.error.includes('Forbidden'));
  });
});
