const BASE = 'https://www.googleapis.com/youtube/v3';

async function ytFetch(endpoint, params) {
  const url = new URL(`${BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err.error?.message || res.statusText;
    throw new Error(`YouTube API ${res.status}: ${msg}`);
  }
  return res.json();
}

function parseChannelUrl(raw) {
  const s = raw.trim();
  if (/^UC[\w-]{22}$/.test(s)) return { type: 'id', value: s };
  if (s.startsWith('@')) return { type: 'handle', value: s };
  try {
    const u = new URL(s.startsWith('http') ? s : `https://${s}`);
    const p = u.pathname;
    const idM = p.match(/\/channel\/(UC[\w-]{22})/);
    if (idM) return { type: 'id', value: idM[1] };
    const handleM = p.match(/\/@([^/]+)/);
    if (handleM) return { type: 'handle', value: `@${handleM[1]}` };
    const cM = p.match(/\/(?:c|user)\/([^/]+)/);
    if (cM) return { type: 'username', value: cM[1] };
  } catch {}
  return { type: 'handle', value: s.startsWith('@') ? s : `@${s}` };
}

async function resolveChannelId(urlOrHandle, apiKey) {
  const parsed = parseChannelUrl(urlOrHandle);

  if (parsed.type === 'id') {
    const d = await ytFetch('channels', { id: parsed.value, part: 'snippet', key: apiKey });
    if (!d.items?.length) throw new Error('Channel not found');
    return { id: parsed.value, name: d.items[0].snippet.title };
  }

  if (parsed.type === 'handle') {
    const d = await ytFetch('channels', { forHandle: parsed.value, part: 'snippet', key: apiKey });
    if (!d.items?.length) throw new Error(`Channel not found for handle ${parsed.value}`);
    return { id: d.items[0].id, name: d.items[0].snippet.title };
  }

  if (parsed.type === 'username') {
    const d = await ytFetch('channels', {
      forUsername: parsed.value,
      part: 'snippet',
      key: apiKey,
    });
    if (!d.items?.length) throw new Error(`Channel not found for username ${parsed.value}`);
    return { id: d.items[0].id, name: d.items[0].snippet.title };
  }
}

function parseISO8601(dur) {
  if (!dur) return null;
  const m = dur.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return (parseInt(m[1] || 0) * 3600) + (parseInt(m[2] || 0) * 60) + parseInt(m[3] || 0);
}

// Tries to split "Artist - Title" or "Title - Artist Karaoke" into parts.
function parseSongTitle(raw) {
  let t = raw
    .replace(/\s*\|\s*karaoke.*/gi, '')
    .replace(/\s*[([](karaoke\s*(?:version|track)?)[)\]]/gi, '')
    .replace(/\s+karaoke\s*(?:version|track)?\s*$/gi, '')
    .trim();

  const sep = t.match(/\s*[-–]\s+/);
  if (sep) {
    const idx = t.search(/\s*[-–]\s+/);
    const left = t.slice(0, idx).trim();
    const right = t.slice(idx).replace(/^\s*[-–]\s+/, '').trim();
    if (left && right) return { artist: left, title: right };
  }

  return { artist: null, title: t };
}

async function* fetchChannelVideos(channelId, apiKey) {
  // Get the uploads playlist ID
  const ch = await ytFetch('channels', {
    id: channelId,
    part: 'contentDetails',
    key: apiKey,
  });
  if (!ch.items?.length) throw new Error('Channel not found when fetching uploads playlist');
  const uploadsId = ch.items[0].contentDetails.relatedPlaylists.uploads;

  let pageToken;
  do {
    const params = { playlistId: uploadsId, part: 'snippet', maxResults: 50, key: apiKey };
    if (pageToken) params.pageToken = pageToken;

    const page = await ytFetch('playlistItems', params);
    const items = (page.items || []).filter(
      (i) => i.snippet.resourceId?.kind === 'youtube#video'
    );

    if (items.length === 0) { pageToken = page.nextPageToken; continue; }

    // Batch-fetch video details (duration + HD thumbnail)
    const videoIds = items.map((i) => i.snippet.resourceId.videoId).join(',');
    const details = await ytFetch('videos', {
      id: videoIds,
      part: 'contentDetails,snippet,status',
      key: apiKey,
    });
    const detailMap = Object.fromEntries((details.items || []).map((v) => [v.id, v]));

    for (const item of items) {
      const vid = item.snippet.resourceId.videoId;
      const d = detailMap[vid];
      if (!d) continue; // private / deleted

      const { artist, title } = parseSongTitle(item.snippet.title);
      const thumb =
        d.snippet?.thumbnails?.medium?.url ||
        d.snippet?.thumbnails?.default?.url ||
        null;

      yield {
        id: vid,
        title,
        artist,
        source: 'youtube',
        channel_id: channelId,
        duration_seconds: parseISO8601(d.contentDetails?.duration),
        thumbnail_url: thumb,
        embeddable: d.status?.embeddable !== false,
      };
    }

    pageToken = page.nextPageToken;
  } while (pageToken);
}

// Search YouTube and return song-shaped results (non-embeddable videos filtered out).
// Costs ~101 API units per call (100 for search.list + 1 for videos.list batch).
async function searchYouTube(query, apiKey, maxResults = 10) {
  const searchData = await ytFetch('search', {
    part: 'snippet',
    q: query,
    type: 'video',
    maxResults,
    key: apiKey,
  });

  if (!searchData.items?.length) return [];

  const ids = searchData.items.map((i) => i.id.videoId).join(',');
  const videoData = await ytFetch('videos', {
    part: 'contentDetails,status',
    id: ids,
    key: apiKey,
  });

  const details = {};
  for (const v of (videoData.items || [])) {
    details[v.id] = {
      duration:   parseISO8601(v.contentDetails?.duration),
      embeddable: v.status?.embeddable !== false,
    };
  }

  return searchData.items
    .filter((i) => details[i.id.videoId]?.embeddable !== false)
    .map((i) => {
      const { artist, title } = parseSongTitle(i.snippet.title);
      return {
        id:               i.id.videoId,
        title,
        artist,
        source:           'youtube',
        channel_name:     i.snippet.channelTitle,
        thumbnail_url:    i.snippet.thumbnails?.default?.url || null,
        duration_seconds: details[i.id.videoId]?.duration || null,
      };
    });
}

// Fetch details for a single video by ID (for the URL-paste flow).
// Costs 1 API unit.
async function getVideoDetails(videoId, apiKey) {
  const data = await ytFetch('videos', {
    part: 'snippet,contentDetails,status',
    id:   videoId,
    key:  apiKey,
  });
  const v = data.items?.[0];
  if (!v) throw new Error('Video not found');
  if (v.status?.embeddable === false) throw new Error('Video is not embeddable');
  const { artist, title } = parseSongTitle(v.snippet.title);
  return {
    id:               v.id,
    title,
    artist,
    source:           'youtube',
    channel_name:     v.snippet.channelTitle,
    thumbnail_url:    v.snippet.thumbnails?.default?.url || null,
    duration_seconds: parseISO8601(v.contentDetails?.duration),
  };
}

module.exports = { resolveChannelId, fetchChannelVideos, parseSongTitle, searchYouTube, getVideoDetails };
