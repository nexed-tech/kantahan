import { useState, useEffect, useRef } from 'react';
import { djFetch } from '../lib/djFetch';

const LAST_SINGER_KEY = 'kantahan_dj_last_singer';
const LIMIT = 50;

const TYPE_BADGE = {
  cdg:        { label: 'CDG',     cls: 'bg-green-950/60 text-green-400 border-green-800/40' },
  mp3cdg_zip: { label: 'ZIP CDG', cls: 'bg-purple-950/60 text-purple-300 border-purple-800/40' },
  mkv:        { label: 'MKV',     cls: 'bg-blue-950/60 text-blue-400 border-blue-800/40' },
  mp4:        { label: 'MP4',     cls: 'bg-sky-950/60 text-sky-400 border-sky-800/40' },
  mp3:        { label: 'MP3',     cls: 'bg-teal-950/60 text-teal-400 border-teal-800/40' },
};

function TypeBadge({ source, fileType }) {
  if (source === 'youtube') {
    return (
      <span className="text-[10px] font-mono bg-red-950/60 text-red-400 px-1 py-0.5 rounded border border-red-800/40 shrink-0">
        YT
      </span>
    );
  }
  const info = TYPE_BADGE[fileType] || {
    label: (fileType || 'LOCAL').toUpperCase(),
    cls: 'bg-white/10 text-brand-dim/50 border-white/10',
  };
  return (
    <span className={`text-[10px] font-mono px-1 py-0.5 rounded border shrink-0 ${info.cls}`}>
      {info.label}
    </span>
  );
}

// Shared singer-name confirm row used by both library and YouTube results.
function SingerInput({ onConfirm, onCancel }) {
  const [singerName, setSingerName] = useState(
    () => localStorage.getItem(LAST_SINGER_KEY) || ''
  );
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 40); }, []);

  function confirm() {
    if (!singerName.trim()) return;
    localStorage.setItem(LAST_SINGER_KEY, singerName.trim());
    onConfirm(singerName.trim());
  }

  return (
    <div className="flex gap-2 px-2.5 pb-2">
      <input
        ref={inputRef}
        type="text"
        value={singerName}
        onChange={(e) => setSingerName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') confirm(); if (e.key === 'Escape') onCancel(); }}
        placeholder="Singer name..."
        className="flex-1 bg-white/5 text-brand-ink text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-purple border border-white/10 placeholder:text-brand-dim/30"
      />
      <button
        onClick={confirm}
        disabled={!singerName.trim()}
        className="bg-brand-purple hover:bg-brand-purple/80 disabled:opacity-40 text-white text-sm px-3 py-2 rounded-lg transition-colors"
      >
        Add
      </button>
      <button
        onClick={onCancel}
        className="bg-white/10 hover:bg-white/15 text-brand-dim text-sm px-3 py-2 rounded-lg transition-colors"
      >
        ✕
      </button>
    </div>
  );
}

function SongRow({ song, onAddToQueue }) {
  const [adding, setAdding]   = useState(false);
  const [success, setSuccess] = useState(false);

  async function confirm(singerName) {
    await onAddToQueue(song, singerName);
    setSuccess(true);
    setAdding(false);
    setTimeout(() => setSuccess(false), 2500);
  }

  const subtitle = [song.artist, song.source === 'youtube' ? song.channel_name : null]
    .filter(Boolean).join(' · ') || '—';

  return (
    <li className="bg-white/5 rounded-lg border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-2.5 px-2.5 py-2">
        {song.thumbnail_url ? (
          <img src={song.thumbnail_url} alt="" className="w-9 h-6 object-cover rounded shrink-0" />
        ) : (
          <div className="w-9 h-6 bg-white/10 rounded flex items-center justify-center text-brand-dim/50 text-xs shrink-0">♪</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-brand-ink text-xs font-medium truncate leading-snug">{song.title}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <p className="text-brand-dim/50 text-[11px] truncate leading-tight min-w-0">{subtitle}</p>
            <TypeBadge source={song.source} fileType={song.file_type} />
          </div>
        </div>
        {success ? (
          <span className="text-green-400 text-xs font-mono shrink-0">Added ✓</span>
        ) : (
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 text-xs bg-brand-purple/20 hover:bg-brand-purple/40 text-brand-purple px-2 py-1.5 rounded-lg transition-colors font-medium"
          >
            + Queue
          </button>
        )}
      </div>
      {adding && <SingerInput onConfirm={confirm} onCancel={() => setAdding(false)} />}
    </li>
  );
}

// Parses a YouTube URL or bare video ID → returns the 11-char video ID or null.
function parseYouTubeId(input) {
  const s = (input || '').trim();
  const urlMatch = s.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (urlMatch) return urlMatch[1];
  const shortMatch = s.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];
  if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
  return null;
}

// ── URL-paste widget ──────────────────────────────────────────────────────────
function UrlPaste({ onAddToQueue }) {
  const [open, setOpen]       = useState(false);
  const [url, setUrl]         = useState('');
  const [video, setVideo]     = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [adding, setAdding]   = useState(false);
  const [success, setSuccess] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 40); }, [open]);

  function reset() { setUrl(''); setVideo(null); setError(''); setAdding(false); setSuccess(false); }
  function close() { setOpen(false); reset(); }

  async function lookup() {
    const id = parseYouTubeId(url);
    if (!id) { setError('Not a valid YouTube URL or video ID'); return; }
    setLoading(true); setError(''); setVideo(null);
    try {
      const res = await djFetch(`/api/youtube/video/${id}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Video not found'); return; }
      setVideo(data);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  async function confirm(singerName) {
    await onAddToQueue(video, singerName);
    setSuccess(true);
    setAdding(false);
    setTimeout(() => { setSuccess(false); close(); }, 1500);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-brand-dim/60 hover:text-brand-dim px-2.5 py-1.5 rounded-lg transition-colors font-mono"
        title="Add YouTube video by URL"
      >
        + YT URL
      </button>
    );
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-2">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={url}
          onChange={(e) => { setUrl(e.target.value); setVideo(null); setError(''); }}
          onKeyDown={(e) => { if (e.key === 'Enter') lookup(); if (e.key === 'Escape') close(); }}
          placeholder="https://youtube.com/watch?v=..."
          className="flex-1 bg-white/5 text-brand-ink text-xs rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-purple border border-white/10 placeholder:text-brand-dim/30 font-mono"
        />
        <button
          onClick={lookup}
          disabled={loading || !url.trim()}
          className="bg-brand-purple hover:bg-brand-purple/80 disabled:opacity-40 text-white text-xs px-3 py-2 rounded-lg transition-colors"
        >
          {loading ? '...' : 'Look up'}
        </button>
        <button onClick={close} className="bg-white/10 hover:bg-white/15 text-brand-dim text-xs px-2 py-2 rounded-lg transition-colors">✕</button>
      </div>
      {error && <p className="text-brand-pink text-xs font-mono">{error}</p>}
      {video && !adding && !success && (
        <div className="flex items-center gap-2.5 bg-white/5 rounded-lg px-2.5 py-2 border border-white/10">
          {video.thumbnail_url && <img src={video.thumbnail_url} alt="" className="w-9 h-6 object-cover rounded shrink-0" />}
          <div className="min-w-0 flex-1">
            <p className="text-brand-ink text-xs font-medium truncate">{video.title}</p>
            <p className="text-brand-dim/50 text-[11px] truncate">{video.channel_name}</p>
          </div>
          <button
            onClick={() => setAdding(true)}
            className="shrink-0 text-xs bg-brand-purple/20 hover:bg-brand-purple/40 text-brand-purple px-2 py-1.5 rounded-lg transition-colors"
          >
            + Queue
          </button>
        </div>
      )}
      {video && adding && <SingerInput onConfirm={confirm} onCancel={() => setAdding(false)} />}
      {success && <p className="text-green-400 text-xs font-mono">Added ✓</p>}
    </div>
  );
}

// ── Inline YouTube search results ─────────────────────────────────────────────
function YouTubeResults({ query, onAddToQueue }) {
  const [expanded, setExpanded] = useState(false);
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const lastQueryRef = useRef('');

  async function search() {
    if (!query.trim()) return;
    setExpanded(true);
    if (query === lastQueryRef.current && results.length) return; // don't re-fetch same query
    lastQueryRef.current = query;
    setLoading(true); setError(''); setResults([]);
    try {
      const res  = await djFetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Search failed'); return; }
      setResults(data);
    } catch { setError('Network error'); }
    finally { setLoading(false); }
  }

  // Collapse when query changes so the user sees the trigger row again
  useEffect(() => { setExpanded(false); setResults([]); lastQueryRef.current = ''; }, [query]);

  return (
    <div className="border-t border-white/5 pt-1 mt-1">
      {!expanded ? (
        <button
          onClick={search}
          disabled={!query.trim()}
          className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors text-left group disabled:opacity-40"
        >
          <span className="w-4 h-4 rounded-full bg-red-600 flex items-center justify-center shrink-0">
            <span className="text-white text-[8px] font-bold">▶</span>
          </span>
          <span className="text-brand-dim/60 text-xs group-hover:text-brand-dim transition-colors">
            Search YouTube for <span className="text-brand-dim italic">"{query}"</span>
          </span>
          <span className="ml-auto text-brand-dim/30 text-xs">→</span>
        </button>
      ) : (
        <div className="space-y-1">
          <div className="flex items-center justify-between px-1 pb-1">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-600 flex items-center justify-center shrink-0">
                <span className="text-white text-[7px] font-bold">▶</span>
              </span>
              <span className="text-brand-dim/50 text-[11px] font-mono">YouTube results</span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-brand-dim/30 hover:text-brand-dim text-xs transition-colors"
            >
              ✕
            </button>
          </div>
          {loading && (
            <p className="text-center text-brand-dim/40 text-xs py-4 font-mono">Searching YouTube…</p>
          )}
          {error && <p className="text-brand-pink text-xs font-mono px-1">{error}</p>}
          {!loading && !error && results.length === 0 && (
            <p className="text-center text-brand-dim/40 text-xs py-4">No results found</p>
          )}
          {results.length > 0 && (
            <ul className="space-y-1">
              {results.map((song) => (
                <SongRow key={song.id} song={song} onAddToQueue={onAddToQueue} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Library component ────────────────────────────────────────────────────
export default function Library() {
  const [query, setQuery]       = useState('');
  const [source, setSource]     = useState('');
  const [channelId, setChannel] = useState('');
  const [sort, setSort]         = useState('recent');
  const [songs, setSongs]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [offset, setOffset]     = useState(0);
  const [hasMore, setHasMore]   = useState(false);
  const [channels, setChannels] = useState([]);
  const debounceRef = useRef(null);
  const reqIdRef    = useRef(0);

  useEffect(() => {
    fetch('/api/channels').then((r) => r.json()).then(setChannels).catch(() => {});
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const id = ++reqIdRef.current;
      setLoading(true); setSongs([]); setOffset(0);
      try {
        const data = await fetchSongs(query, source, channelId, sort, 0);
        if (id !== reqIdRef.current) return;
        setSongs(data); setOffset(data.length); setHasMore(data.length === LIMIT);
      } finally {
        if (id === reqIdRef.current) setLoading(false);
      }
    }, query ? 200 : 0);
  }, [query, source, channelId, sort]);

  async function fetchSongs(q, src, chan, srt, off) {
    const params = new URLSearchParams({ limit: LIMIT, offset: off, sort: srt });
    if (q.trim()) params.set('q', q.trim());
    if (src)  params.set('source', src);
    if (chan) params.set('channel_id', chan);
    const res = await fetch(`/api/library?${params}`);
    return res.json();
  }

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    try {
      const data = await fetchSongs(query, source, channelId, sort, offset);
      setSongs((prev) => [...prev, ...data]);
      setOffset((o) => o + data.length);
      setHasMore(data.length === LIMIT);
    } finally { setLoading(false); }
  }

  // Library songs always use add-direct (they already exist in the DB, whether YouTube or local).
  // Library queries exclude ephemeral rows so there is no ambiguity here.
  async function handleAddToQueue(song, singerName) {
    await djFetch('/api/queue/add-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song_id: song.id, singer_name: singerName }),
    });
  }

  // YouTube search results always use add-youtube (they're never in the library)
  async function handleAddYouTube(song, singerName) {
    await djFetch('/api/queue/add-youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        video_id:         song.id,
        title:            song.title,
        artist:           song.artist,
        channel_name:     song.channel_name,
        thumbnail_url:    song.thumbnail_url,
        duration_seconds: song.duration_seconds,
        singer_name:      singerName,
      }),
    });
  }

  return (
    <div className="space-y-2.5">
      {/* Search bar + URL paste button */}
      <div className="flex gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search songs..."
          className="flex-1 bg-white/5 text-brand-ink text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple border border-white/10 placeholder:text-brand-dim/30 transition-colors"
        />
        <UrlPaste onAddToQueue={handleAddYouTube} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {['', 'youtube', 'local'].map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setSource(s)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              source === s
                ? 'bg-brand-purple/30 border-brand-purple/60 text-brand-purple'
                : 'bg-white/5 border-white/10 text-brand-dim hover:border-white/20'
            }`}
          >
            {s === '' ? 'All' : s === 'youtube' ? 'YouTube' : 'Local'}
          </button>
        ))}
        {channels.length > 0 && (
          <select
            value={channelId}
            onChange={(e) => setChannel(e.target.value)}
            className="text-xs px-2 py-1 rounded-full border bg-brand-bg border-white/10 text-brand-dim focus:outline-none focus:ring-1 focus:ring-brand-purple"
          >
            <option value="">All channels</option>
            {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-1">
        <span className="text-brand-dim/40 text-[10px] font-mono">Sort:</span>
        {[['recent', 'Recent'], ['title', 'Title'], ['artist', 'Artist']].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setSort(v)}
            className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
              sort === v
                ? 'bg-brand-amber/20 border-brand-amber/50 text-brand-amber'
                : 'bg-white/5 border-white/10 text-brand-dim/60 hover:border-white/20'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Library results */}
      {loading && songs.length === 0 ? (
        <p className="text-center text-brand-dim/50 text-xs py-8 font-mono">Loading...</p>
      ) : !loading && songs.length === 0 ? (
        <p className="text-center text-brand-dim/50 text-xs py-4">
          {query ? `No results for "${query}"` : 'No songs in library'}
        </p>
      ) : (
        <>
          <ul className="space-y-1">
            {songs.map((song) => (
              <SongRow key={song.id} song={song} onAddToQueue={handleAddToQueue} />
            ))}
          </ul>
          {hasMore && (
            <button
              onClick={loadMore}
              disabled={loading}
              className="w-full py-2 text-brand-dim/50 text-xs font-mono hover:text-brand-dim transition-colors disabled:opacity-40"
            >
              {loading ? 'Loading...' : 'Load more'}
            </button>
          )}
          {!hasMore && songs.length > 0 && (
            <p className="text-center text-brand-dim/30 text-xs font-mono py-1">
              {songs.length} song{songs.length !== 1 ? 's' : ''}
            </p>
          )}
        </>
      )}

      {/* YouTube search — always shown when there's a query */}
      {query.trim().length >= 2 && (
        <YouTubeResults query={query.trim()} onAddToQueue={handleAddYouTube} />
      )}
    </div>
  );
}
