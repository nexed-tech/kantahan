import { useState, useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

// # first so numbers/symbols sit above A-Z in the strip
const ALL_LETTERS = ['#','A','B','C','D','E','F','G','H','I','J','K','L','M',
                     'N','O','P','Q','R','S','T','U','V','W','X','Y','Z'];

const AZ = ALL_LETTERS.filter((l) => l !== '#');

async function fetchLetter(mode, letter) {
  const res = await fetch(
    `/api/library/browse?mode=${mode}&letter=${encodeURIComponent(letter)}&limit=500&offset=0`
  );
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

// Flat row list from ALL loaded letters — continuous, book-like.
function buildRows(songs) {
  const rows = [];
  for (const letter of ALL_LETTERS) {
    const list = songs[letter];
    if (!list || list.length === 0) continue;
    rows.push({ type: 'header', letter });
    for (const song of list) rows.push({ type: 'song', song });
  }
  return rows;
}

export function Songbook({ onSelect, onBack, nameEntered }) {
  const [mode, setMode]             = useState('song');
  const [available, setAvailable]   = useState({}); // { A: count, ... }
  const [songs, setSongs]           = useState({}); // { A: [...], ... }
  const [activeLetter, setActive]   = useState(null);
  const [loading, setLoading]       = useState(null);

  const parentRef    = useRef(null);
  const headerIdxRef = useRef({});   // letter → row index, rebuilt each render
  const loadingRef   = useRef(null); // mirror of loading state for async guards
  const songsRef     = useRef({});
  songsRef.current   = songs;

  // ── Load letter counts, then auto-open first A-Z letter ──────────────────
  useEffect(() => {
    setAvailable({});
    setSongs({});
    setSongs({});
    setActive(null);
    setLoading(null);
    loadingRef.current = null;

    fetch(`/api/library/letters?mode=${mode}`)
      .then((r) => r.json())
      .then((rows) => {
        const map = {};
        for (const r of rows) map[r.letter] = r.count;
        setAvailable(map);
        // Auto-load first A-Z letter with content (never #)
        const first = AZ.find((l) => map[l]);
        if (first) loadLetter(first, map, true);
      })
      .catch(() => {});
  }, [mode]);

  // ── Core load function (uses refs so it's safe to call from effects) ──────
  async function loadLetter(letter, availableMap, isAuto = false) {
    const avail = availableMap ?? available;
    if (!avail[letter]) return;
    if (songsRef.current[letter]) {
      // Already loaded — just highlight and scroll
      setActive(letter);
      if (!isAuto) scrollTo(letter);
      return;
    }
    if (loadingRef.current === letter) return; // already in-flight
    loadingRef.current = letter;
    setLoading(letter);
    setActive(letter);
    try {
      const data = await fetchLetter(mode, letter);
      setSongs((prev) => ({ ...prev, [letter]: data }));
      // After state update, scroll in next tick via jumpRef
      if (!isAuto) jumpRef.current = letter;
    } catch {}
    loadingRef.current = null;
    setLoading(null);
  }

  // ── Jump-after-load ───────────────────────────────────────────────────────
  const jumpRef = useRef(null);

  // ── Build rows & virtualizer ──────────────────────────────────────────────
  const rows = buildRows(songs);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (rows[i]?.type === 'header' ? 40 : 64),
    overscan: 12,
  });

  // Rebuild header index every render (rows change as letters load)
  headerIdxRef.current = {};
  rows.forEach((row, i) => {
    if (row.type === 'header') headerIdxRef.current[row.letter] = i;
  });

  // Execute pending jump after rows re-render
  useEffect(() => {
    if (!jumpRef.current) return;
    const letter = jumpRef.current;
    jumpRef.current = null;
    const idx = headerIdxRef.current[letter];
    if (idx != null) virtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
  });

  function scrollTo(letter) {
    const idx = headerIdxRef.current[letter];
    if (idx != null) virtualizer.scrollToIndex(idx, { align: 'start', behavior: 'smooth' });
  }

  function handleLetterTap(letter) {
    loadLetter(letter, null, false);
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const items = virtualizer.getVirtualItems();

  return (
    <div className="flex flex-col h-screen bg-brand-bg text-brand-ink overflow-hidden">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3 shrink-0">
        <button
          onClick={onBack}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 active:bg-white/15 text-brand-dim text-lg transition-colors"
          aria-label="Back"
        >
          ←
        </button>
        <h1 className="flex-1 text-brand-ink font-bold text-lg">Songbook</h1>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-2 px-4 pb-3 shrink-0">
        {['song', 'artist'].map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              mode === m
                ? 'bg-brand-purple text-white'
                : 'bg-white/5 text-brand-dim active:bg-white/15'
            }`}
          >
            {m === 'song' ? 'By Song' : 'By Artist'}
          </button>
        ))}
      </div>

      {/* List + letter strip */}
      <div className="flex flex-1 min-h-0 relative">

        {/* Virtual list */}
        <div
          ref={parentRef}
          className="flex-1 overflow-y-auto pr-10"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          {/* Loading skeleton on first open */}
          {rows.length === 0 && loading && (
            <div className="flex items-center justify-center pt-16">
              <p className="text-brand-dim/50 text-sm font-mono">Loading…</p>
            </div>
          )}

          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
            {items.map((vItem) => {
              const row = rows[vItem.index];
              return (
                <div
                  key={vItem.key}
                  data-index={vItem.index}
                  ref={virtualizer.measureElement}
                  style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    transform: `translateY(${vItem.start}px)`,
                  }}
                >
                  {row.type === 'header' ? (
                    <LetterHeader letter={row.letter} loading={loading === row.letter} />
                  ) : (
                    <SongbookRow
                      song={row.song}
                      mode={mode}
                      onSelect={nameEntered ? onSelect : null}
                      nameRequired={!nameEntered}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Letter strip */}
        <LetterStrip available={available} active={activeLetter} onTap={handleLetterTap} />
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LetterHeader({ letter, loading }) {
  return (
    <div className="flex items-center gap-2 px-4 py-1.5 bg-brand-bg sticky top-0 z-10">
      <span className="text-brand-purple font-bold font-mono text-sm w-5">{letter}</span>
      <div className="flex-1 h-px bg-white/10" />
      {loading && <span className="text-brand-dim/50 text-xs font-mono">loading…</span>}
    </div>
  );
}

function SongbookRow({ song, mode, onSelect, nameRequired }) {
  const primary   = mode === 'artist'
    ? (song.artist || song.channel_name || '—')
    : song.title;
  const secondary = mode === 'artist'
    ? song.title
    : (song.artist || song.channel_name || '');

  return (
    <button
      onClick={() => onSelect?.(song)}
      disabled={!onSelect}
      className={`w-full flex items-center gap-3 px-4 border-b border-white/5 text-left transition-colors ${
        onSelect ? 'active:bg-white/10' : 'opacity-60 cursor-not-allowed'
      }`}
      style={{ minHeight: 64 }}
      title={nameRequired ? 'Enter your name on the home screen first' : undefined}
    >
      <div className="min-w-0 flex-1">
        <p className="text-brand-ink text-sm font-medium truncate leading-snug">{primary}</p>
        {secondary
          ? <p className="text-brand-dim text-xs truncate leading-snug">{secondary}</p>
          : null}
      </div>
    </button>
  );
}

function LetterStrip({ available, active, onTap }) {
  return (
    <div
      className="absolute right-0 top-0 bottom-0 w-9 flex flex-col justify-center items-center py-1 bg-brand-bg/80 backdrop-blur-sm z-20"
      style={{ touchAction: 'none' }}
    >
      {ALL_LETTERS.map((letter) => {
        const has      = !!available[letter];
        const isActive = letter === active;
        return (
          <button
            key={letter}
            onClick={() => onTap(letter)}
            disabled={!has}
            className={`w-7 rounded text-center font-mono font-bold transition-colors select-none ${
              isActive
                ? 'bg-brand-purple text-white'
                : has
                  ? 'text-brand-dim active:text-brand-ink active:bg-white/10'
                  : 'text-brand-dim/20 cursor-default'
            }`}
            style={{ fontSize: 11, minHeight: 20, lineHeight: '20px' }}
          >
            {letter}
          </button>
        );
      })}
    </div>
  );
}
