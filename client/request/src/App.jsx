import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../../shared/useWebSocket';
import logoUrl from './assets/logo-marquee-primary-animated.svg';
import { Songbook } from './Songbook';

const NAME_KEY = 'kantahan_singer_name';

function SongRow({ song, onSelect }) {
  return (
    <button
      onClick={() => onSelect(song)}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-white/5 active:bg-white/15 transition-colors text-left border border-white/5 active:border-brand-purple/30"
      style={{ minHeight: 64 }}
    >
      {song.thumbnail_url ? (
        <img src={song.thumbnail_url} alt="" className="w-12 h-9 object-cover rounded shrink-0" />
      ) : (
        <div className="w-12 h-9 bg-white/10 rounded flex items-center justify-center text-brand-dim text-sm shrink-0">
          ♪
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-brand-ink text-sm font-medium truncate">{song.title}</p>
        <p className="text-brand-dim text-xs truncate">
          {song.artist || song.channel_name || song.source}
        </p>
      </div>
    </button>
  );
}

function ConfirmDialog({ song, singerName, onConfirm, onCancel, submitting, success, submittedData }) {
  if (success) {
    return (
      <div className="fixed inset-0 bg-brand-bg/90 flex items-center justify-center p-6 z-50">
        <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 text-center space-y-4 max-w-sm w-full shadow-2xl border border-white/10">
          <div className="text-5xl">🎤</div>
          <h2 className="text-brand-ink text-xl font-bold">Request sent!</h2>
          <p className="text-brand-dim text-sm">
            <span className="font-semibold text-brand-ink">{singerName}</span>
            <span className="text-brand-dim/50"> — </span>
            {song.title}
          </p>

          {submittedData?.queued && submittedData?.queue_position != null && (
            <div className="bg-brand-purple/20 border border-brand-purple/40 rounded-xl px-4 py-3">
              <p className="text-brand-ink text-2xl font-bold font-mono">
                #{submittedData.queue_position}
              </p>
              <p className="text-brand-dim text-sm">in the queue</p>
            </div>
          )}

          {!submittedData?.queued && (
            <p className="text-brand-dim text-sm bg-white/5 rounded-xl px-4 py-3 border border-white/10">
              The DJ will review your request
            </p>
          )}

          <button
            onClick={onCancel}
            className="w-full bg-brand-purple hover:bg-brand-purple/80 active:bg-brand-purple/60 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-brand-bg/90 flex items-center justify-center p-6 z-50">
      <div className="bg-white/10 backdrop-blur-md rounded-2xl p-6 space-y-5 max-w-sm w-full shadow-2xl border border-white/10">
        <h2 className="text-brand-ink text-lg font-bold">Confirm request</h2>
        <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/10">
          <div>
            <p className="text-xs text-brand-dim font-mono mb-0.5">Singer</p>
            <p className="text-brand-ink font-semibold">{singerName}</p>
          </div>
          <div>
            <p className="text-xs text-brand-dim font-mono mb-0.5">Song</p>
            <p className="text-brand-ink">{song.title}</p>
            {song.artist && <p className="text-brand-dim text-sm">{song.artist}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-white/10 hover:bg-white/15 text-brand-dim py-3 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 bg-brand-purple hover:bg-brand-purple/80 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            {submitting ? 'Sending...' : 'Send request'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { state } = useWebSocket();
  const [name, setName] = useState(() => localStorage.getItem(NAME_KEY) || '');
  const [query, setQuery] = useState('');
  const [randomSongs, setRandomSongs] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);
  const [listVisible, setListVisible] = useState(true);
  const [view, setView] = useState('home'); // 'home' | 'songbook'
  const debounceRef = useRef(null);

  // Load random songs on mount
  useEffect(() => {
    fetch('/api/library/random?limit=25')
      .then((r) => r.json())
      .then(setRandomSongs)
      .catch(() => {});
  }, []);

  function saveName(value) {
    setName(value);
    localStorage.setItem(NAME_KEY, value);
  }

  // Search with crossfade effect
  useEffect(() => {
    clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      // Fade out, switch to random, fade in
      if (searchResults.length > 0) {
        setListVisible(false);
        setTimeout(() => { setSearchResults([]); setListVisible(true); }, 150);
      }
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setListVisible(false);
      setSearching(true);
      try {
        const res = await fetch(`/api/library/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSearchResults(data);
      } finally {
        setSearching(false);
        setListVisible(true);
      }
    }, 300);
  }, [query]);

  async function handleSubmit() {
    if (!selected || !name.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song_id: selected.id, singer_name: name.trim() }),
      });
      const data = await res.json();
      setSubmittedData(data);
      setSuccess(true);
    } finally {
      setSubmitting(false);
    }
  }

  function handleDone() {
    setSelected(null);
    setSuccess(false);
    setSubmittedData(null);
    setQuery('');
    setSearchResults([]);
    setListVisible(true);
  }

  const isSearching = query.trim().length >= 2;
  const displayList = isSearching ? searchResults : randomSongs;
  const listLabel = isSearching ? 'Results' : 'Suggested songs';
  const queue = state?.queue || [];

  // Songbook song selection re-uses the same confirm flow
  function handleSongbookSelect(song) {
    setSelected(song);
  }

  if (view === 'songbook') {
    return (
      <>
        {selected && (
          <ConfirmDialog
            song={selected}
            singerName={name.trim()}
            onConfirm={handleSubmit}
            onCancel={handleDone}
            submitting={submitting}
            success={success}
            submittedData={submittedData}
          />
        )}
        <Songbook
          onSelect={handleSongbookSelect}
          onBack={() => setView('home')}
          nameEntered={!!name.trim()}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink pb-10">
      {selected && (
        <ConfirmDialog
          song={selected}
          singerName={name.trim()}
          onConfirm={handleSubmit}
          onCancel={handleDone}
          submitting={submitting}
          success={success}
          submittedData={submittedData}
        />
      )}

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">
        {/* Logo header with songbook icon */}
        <div className="flex items-center pt-2">
          <div className="w-10" /> {/* spacer to keep logo centred */}
          <div className="flex-1 flex justify-center">
            <img src={logoUrl} alt="Kantahan" style={{ width: 180, height: 'auto' }} />
          </div>
          <button
            onClick={() => setView('songbook')}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 active:bg-white/15 text-brand-dim hover:text-brand-ink transition-colors"
            aria-label="Open songbook"
            title="Browse all songs"
          >
            {/* Book icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
            </svg>
          </button>
        </div>

        {/* Name field */}
        <div>
          <label className="text-xs text-brand-dim font-mono uppercase tracking-widest mb-2 block">Your name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => saveName(e.target.value)}
            placeholder="Enter your name"
            className="w-full bg-white/5 text-brand-ink text-base rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-purple border border-white/10 focus:border-brand-purple/50 placeholder:text-brand-dim/30 transition-colors"
          />
        </div>

        {/* Search */}
        <div>
          <label className="text-xs text-brand-dim font-mono uppercase tracking-widest mb-2 block">Search for a song</label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Song title or artist..."
            disabled={!name.trim()}
            className="w-full bg-white/5 text-brand-ink text-base rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-purple border border-white/10 focus:border-brand-purple/50 placeholder:text-brand-dim/30 disabled:opacity-40 transition-colors"
          />
          {!name.trim() && (
            <p className="text-brand-dim/40 text-xs mt-1.5 font-mono">Enter your name first</p>
          )}
        </div>

        {/* Song list — random or search results */}
        {name.trim() && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-brand-dim/60 font-mono uppercase tracking-widest">
                {listLabel}
              </p>
              {searching && (
                <p className="text-brand-dim/50 text-xs font-mono">Searching...</p>
              )}
            </div>

            {isSearching && !searching && searchResults.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-brand-dim/60 text-sm">No songs found for "{query}"</p>
                <p className="text-brand-dim/40 text-xs mt-1 font-mono">
                  Ask the DJ to index some channels
                </p>
              </div>
            ) : (
              <ul
                className="space-y-2 transition-opacity duration-150"
                style={{ opacity: listVisible ? 1 : 0 }}
              >
                {displayList.map((song) => (
                  <li key={song.id}>
                    <SongRow song={song} onSelect={setSelected} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Queue preview */}
        {queue.length > 0 && (
          <div className="pt-4 border-t border-white/10">
            <p className="text-xs text-brand-dim/50 font-mono uppercase tracking-widest mb-3">
              {queue.length} in queue
            </p>
            <ul className="space-y-1.5">
              {queue.slice(0, 6).map((item) => (
                <li key={item.id} className="flex justify-between text-sm gap-4">
                  <span className="text-brand-dim shrink-0">{item.singer}</span>
                  <span className="text-brand-dim/40 truncate text-right">{item.song.title}</span>
                </li>
              ))}
              {queue.length > 6 && (
                <li className="text-brand-dim/40 text-xs font-mono">+{queue.length - 6} more</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
