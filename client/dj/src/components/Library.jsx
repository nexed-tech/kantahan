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

function TypeBadge({ fileType }) {
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

// Singer-name confirm row shown when adding a song to the queue.
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

  const subtitle = song.artist || '—';

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
            <TypeBadge fileType={song.file_type} />
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

// ── Main Library component ────────────────────────────────────────────────────
export default function Library() {
  const [query, setQuery]     = useState('');
  const [sort, setSort]       = useState('recent');
  const [songs, setSongs]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset]   = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef(null);
  const reqIdRef    = useRef(0);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const id = ++reqIdRef.current;
      setLoading(true); setSongs([]); setOffset(0);
      try {
        const data = await fetchSongs(query, sort, 0);
        if (id !== reqIdRef.current) return;
        setSongs(data); setOffset(data.length); setHasMore(data.length === LIMIT);
      } finally {
        if (id === reqIdRef.current) setLoading(false);
      }
    }, query ? 200 : 0);
  }, [query, sort]);

  async function fetchSongs(q, srt, off) {
    const params = new URLSearchParams({ limit: LIMIT, offset: off, sort: srt });
    if (q.trim()) params.set('q', q.trim());
    const res = await fetch(`/api/library?${params}`);
    return res.json();
  }

  async function loadMore() {
    if (loading) return;
    setLoading(true);
    try {
      const data = await fetchSongs(query, sort, offset);
      setSongs((prev) => [...prev, ...data]);
      setOffset((o) => o + data.length);
      setHasMore(data.length === LIMIT);
    } finally { setLoading(false); }
  }

  async function handleAddToQueue(song, singerName) {
    await djFetch('/api/queue/add-direct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ song_id: song.id, singer_name: singerName }),
    });
  }

  return (
    <div className="space-y-2.5">
      {/* Search bar */}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search songs..."
        className="w-full bg-white/5 text-brand-ink text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple border border-white/10 placeholder:text-brand-dim/30 transition-colors"
      />

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
    </div>
  );
}
