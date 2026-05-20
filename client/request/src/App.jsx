import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from '../../shared/useWebSocket';

const NAME_KEY = 'kantahan_singer_name';

function SearchResult({ song, onSelect }) {
  return (
    <button
      onClick={() => onSelect(song)}
      className="w-full flex items-center gap-3 p-3 rounded-xl bg-gray-800 hover:bg-gray-700 active:bg-gray-600 transition-colors text-left"
    >
      {song.thumbnail_url ? (
        <img src={song.thumbnail_url} alt="" className="w-12 h-9 object-cover rounded shrink-0" />
      ) : (
        <div className="w-12 h-9 bg-gray-700 rounded flex items-center justify-center text-gray-500 text-sm shrink-0">
          🎵
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-medium truncate">{song.title}</p>
        <p className="text-gray-400 text-xs truncate">
          {song.artist || song.channel_name || song.source}
        </p>
      </div>
    </button>
  );
}

function ConfirmDialog({ song, singerName, onConfirm, onCancel, submitting, success, submittedData }) {
  if (success) {
    return (
      <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50">
        <div className="bg-gray-800 rounded-2xl p-8 text-center space-y-4 max-w-sm w-full shadow-2xl">
          <div className="text-5xl">🎤</div>
          <h2 className="text-white text-xl font-bold">Request sent!</h2>
          <p className="text-gray-300 text-sm">
            <span className="font-semibold">{singerName}</span>
            <span className="text-gray-500"> — </span>
            {song.title}
          </p>

          {submittedData?.queued && submittedData?.queue_position != null && (
            <div className="bg-purple-900/50 border border-purple-700/50 rounded-xl px-4 py-3">
              <p className="text-purple-200 text-2xl font-bold">
                #{submittedData.queue_position}
              </p>
              <p className="text-purple-400 text-sm">in the queue</p>
            </div>
          )}

          {!submittedData?.queued && (
            <p className="text-gray-400 text-sm bg-gray-700/50 rounded-xl px-4 py-3">
              The DJ will review your request
            </p>
          )}

          <button
            onClick={onCancel}
            className="w-full bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/85 flex items-center justify-center p-6 z-50">
      <div className="bg-gray-800 rounded-2xl p-6 space-y-5 max-w-sm w-full shadow-2xl">
        <h2 className="text-white text-lg font-bold">Confirm request</h2>
        <div className="bg-gray-700 rounded-xl p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Singer</p>
            <p className="text-white font-semibold">{singerName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400 mb-0.5">Song</p>
            <p className="text-white">{song.title}</p>
            {song.artist && <p className="text-gray-400 text-sm">{song.artist}</p>}
          </div>
        </div>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="flex-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white py-3 rounded-xl font-semibold transition-colors"
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
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submittedData, setSubmittedData] = useState(null);
  const debounceRef = useRef(null);

  function saveName(value) {
    setName(value);
    localStorage.setItem(NAME_KEY, value);
  }

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/library/search?q=${encodeURIComponent(query)}`);
        setResults(await res.json());
      } finally {
        setSearching(false);
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
    setResults([]);
  }

  const queue = state?.queue || [];

  return (
    <div className="min-h-screen bg-gray-900 text-white pb-10">
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

      <div className="max-w-lg mx-auto px-4 pt-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Request a song</h1>
          <p className="text-gray-400 text-sm mt-1">Search and submit — we'll call you up</p>
        </div>

        {/* Step 7: Name field — persisted to localStorage */}
        <div>
          <label className="text-sm text-gray-400 mb-1.5 block">Your name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => saveName(e.target.value)}
            placeholder="Enter your name"
            className="w-full bg-gray-800 text-white text-base rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </div>

        {/* Search */}
        <div>
          <label className="text-sm text-gray-400 mb-1.5 block">Search for a song</label>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Song title or artist..."
            disabled={!name.trim()}
            className="w-full bg-gray-800 text-white text-base rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-40"
          />
          {!name.trim() && (
            <p className="text-gray-600 text-xs mt-1.5">Enter your name first</p>
          )}
        </div>

        {/* Results */}
        {searching && (
          <p className="text-gray-500 text-sm text-center py-4">Searching...</p>
        )}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <div className="text-center py-6">
            <p className="text-gray-500 text-sm">No songs found for "{query}"</p>
            <p className="text-gray-600 text-xs mt-1">
              The library may still be empty — ask the DJ to index some channels
            </p>
          </div>
        )}
        {results.length > 0 && (
          <ul className="space-y-2">
            {results.map((song) => (
              <li key={song.id}>
                <SearchResult song={song} onSelect={setSelected} />
              </li>
            ))}
          </ul>
        )}

        {/* Queue preview */}
        {queue.length > 0 && (
          <div className="pt-4 border-t border-gray-800">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">
              {queue.length} in queue
            </p>
            <ul className="space-y-1.5">
              {queue.slice(0, 6).map((item) => (
                <li key={item.id} className="flex justify-between text-sm gap-4">
                  <span className="text-gray-300 shrink-0">{item.singer}</span>
                  <span className="text-gray-500 truncate text-right">{item.song.title}</span>
                </li>
              ))}
              {queue.length > 6 && (
                <li className="text-gray-600 text-xs">+{queue.length - 6} more</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
