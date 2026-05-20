const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ffmpeg = require('fluent-ffmpeg');
const ffprobeStatic = require('ffprobe-static');
const AdmZip = require('adm-zip');
const { parseSongTitle } = require('./youtube');

ffmpeg.setFfprobePath(ffprobeStatic.path);

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

function getVideoCodec(filePath) {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(filePath, (err, metadata) => {
      if (err) { resolve(null); return; }
      const video = (metadata.streams || []).find((s) => s.codec_type === 'video');
      resolve(video?.codec_name || null);
    });
  });
}

function extractCdgPairFromZip(zipPath) {
  try {
    const zip = new AdmZip(zipPath);
    const entries = zip.getEntries().map((e) => e.entryName);
    const mp3Entry = entries.find((e) => e.toLowerCase().endsWith('.mp3'));
    const cdgEntry = entries.find((e) => e.toLowerCase().endsWith('.cdg'));
    if (!mp3Entry || !cdgEntry) return null;
    const mp3Base = mp3Entry.toLowerCase().replace(/\.mp3$/, '');
    const cdgBase = cdgEntry.toLowerCase().replace(/\.cdg$/, '');
    if (mp3Base !== cdgBase) return null;
    return { mp3EntryName: mp3Entry, cdgEntryName: cdgEntry };
  } catch {
    return null;
  }
}

async function scanLocalMedia(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(`Folder not found: ${folderPath}`);
  }

  const mp3Map = new Map(); // base (no ext) → full path
  const cdgSet = new Set(); // base (no ext)
  const videoFiles = [];
  const zipFiles = [];
  const results = [];
  const skipped = [];

  for (const filePath of walkDir(folderPath)) {
    const ext = path.extname(filePath).toLowerCase();
    const base = filePath.slice(0, -ext.length);

    if (ext === '.mp3') mp3Map.set(base, filePath);
    else if (ext === '.cdg') cdgSet.add(base);
    else if (ext === '.mkv' || ext === '.mp4') videoFiles.push({ filePath, ext });
    else if (ext === '.zip') zipFiles.push(filePath);
  }

  // MP3 + CDG pairs (filesystem level)
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
        zip_mp3_entry: null,
        zip_cdg_entry: null,
      });
    }
  }

  // ZIP files containing MP3+CDG pairs
  for (const zipPath of zipFiles) {
    const pair = extractCdgPairFromZip(zipPath);
    if (!pair) continue;
    const baseName = path.basename(pair.mp3EntryName, '.mp3');
    const { artist, title } = parseSongTitle(baseName);
    results.push({
      id: `local_${hashPath(zipPath)}`,
      title,
      artist,
      source: 'local',
      file_path: zipPath,
      file_type: 'mp3cdg_zip',
      duration_seconds: null,
      thumbnail_url: null,
      zip_mp3_entry: pair.mp3EntryName,
      zip_cdg_entry: pair.cdgEntryName,
    });
  }

  // Video files — probe codec to filter HEVC
  for (const { filePath, ext } of videoFiles) {
    const codec = await getVideoCodec(filePath);
    if (codec === 'hevc' || codec === 'h265') {
      skipped.push({ path: filePath, reason: 'H.265/HEVC not supported in Chromium' });
      continue;
    }
    if (codec === null) {
      skipped.push({ path: filePath, reason: 'Could not read codec — file may be unreadable' });
      continue;
    }
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
      zip_mp3_entry: null,
      zip_cdg_entry: null,
    });
  }

  return { results, skipped };
}

module.exports = { scanLocalMedia };
