const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseSongTitle } = require('./youtube');

function hashPath(filePath) {
  return crypto.createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}

function* walkDir(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(full);
    } else {
      yield full;
    }
  }
}

function scanLocalMedia(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Folder not found: ${folderPath}`);
  }

  const mp3Map = new Map(); // base (no ext) → full path
  const cdgSet = new Set(); // base (no ext)
  const videoFiles = [];
  const results = [];

  for (const filePath of walkDir(folderPath)) {
    const ext = path.extname(filePath).toLowerCase();
    const base = filePath.slice(0, -ext.length);

    if (ext === '.mp3') mp3Map.set(base, filePath);
    else if (ext === '.cdg') cdgSet.add(base);
    else if (ext === '.mkv' || ext === '.mp4') videoFiles.push({ filePath, ext });
  }

  // MP3 + CDG pairs
  for (const [base, mp3Path] of mp3Map) {
    if (cdgSet.has(base)) {
      const name = path.basename(base);
      const { artist, title } = parseSongTitle(name);
      results.push({
        id: `local_${hashPath(mp3Path)}`,
        title,
        artist,
        source: 'local',
        file_path: mp3Path,
        file_type: 'cdg',
        duration_seconds: null,
        thumbnail_url: null,
      });
    }
  }

  // Video files (.mkv, .mp4)
  for (const { filePath, ext } of videoFiles) {
    const name = path.basename(filePath, ext);
    const { artist, title } = parseSongTitle(name);
    results.push({
      id: `local_${hashPath(filePath)}`,
      title,
      artist,
      source: 'local',
      file_path: filePath,
      file_type: ext.slice(1),
      duration_seconds: null,
      thumbnail_url: null,
    });
  }

  return results;
}

module.exports = { scanLocalMedia };
