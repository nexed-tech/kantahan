import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from '../../shared/useWebSocket';
import Settings from './components/Settings';
import RequestsInbox from './components/RequestsInbox';
import Library from './components/Library';
import PinOverlay from './components/PinOverlay';
import logoUrl from './assets/logo-marquee-primary-animated.svg';

const KOFI_LABELS = [
  'Buy me a Red Horse',
  'Buy me a Coffee',
  'Support the project',
  'Keep karaoke free',
  'Buy the DJ a round',
  'Keep the mic on',
];

const QUICK_MESSAGES = [
  'Get a drink! 🍺',
  'Request a song! 📱',
  'Taking a short break ☕',
  'Karaoke night! 🎤',
  'Sign up at the bar!',
];

// Settings moved to cog overlay — no tabs needed

function fmt(secs) {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Toggle({ label, value, onChange, disabled }) {
  return (
    <label className={`flex items-center justify-between gap-2 py-1.5 select-none ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className="text-xs text-brand-dim leading-tight">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && onChange(!value)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          value ? 'bg-brand-purple' : 'bg-white/15'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </label>
  );
}

function BeerBottle({ className }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M13.5 2h-3a.5.5 0 0 0-.5.5v2.64a4 4 0 0 0-1.5 3.1V19a3 3 0 0 0 3 3h1a3 3 0 0 0 3-3V8.24a4 4 0 0 0-1.5-3.1V2.5a.5.5 0 0 0-.5-.5z" />
      <rect x="9.5" y="1" width="5" height="1.25" rx="0.5" />
    </svg>
  );
}

function NowPlayingSection({ state, onPlay, onPause, onSkip }) {
  const mode = state?.mode;
  const nowPlaying = state?.now_playing;
  const countdown = state?.countdown;
  const pos = state?.playback_position;
  const elapsed = pos?.elapsed_seconds || 0;
  const duration = pos?.duration_seconds || 0;
  const progress = duration > 0 ? Math.min(elapsed / duration, 1) : 0;
  const remaining = Math.max(duration - elapsed, 0);

  if (mode === 'between') {
    const waiting = !countdown?.active || countdown.seconds_remaining === 0;
    return (
      <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-brand-purple/30">
        <div>
          <p className="text-xs text-brand-purple font-mono uppercase tracking-widest">Up next</p>
          <p className="text-brand-ink font-semibold mt-1 text-lg">
            {countdown?.next_song?.title || '—'}
          </p>
          <p className="text-brand-dim text-sm">{countdown?.next_singer}</p>
        </div>

        {waiting ? (
          <p className="text-brand-dim/60 text-sm font-mono">Countdown paused — waiting for manual start</p>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-brand-amber text-4xl font-mono font-bold tabular-nums"
                  style={{ textShadow: '0 0 20px #ffb627' }}>
              {countdown.seconds_remaining}s
            </span>
            <span className="text-brand-dim/60 text-sm font-mono">auto-starting...</span>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onPlay}
            className="flex-1 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white text-sm py-3 rounded-lg font-bold transition-colors"
          >
            ▶ Start Now
          </button>
          <button
            onClick={onSkip}
            className="bg-brand-pink/20 hover:bg-brand-pink/30 text-brand-pink text-sm px-4 py-3 rounded-lg transition-colors"
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (mode !== 'playing' || !nowPlaying) {
    const queue = state?.queue || [];
    return (
      <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/10">
        <p className="text-brand-dim/60 text-sm font-mono">No song playing</p>
        {queue.length > 0 && (
          <>
            <p className="text-brand-dim text-xs">
              Next up: <span className="text-brand-ink">{queue[0].song.title}</span>
              <span className="text-brand-dim/50"> — {queue[0].singer}</span>
              {queue.length > 1 && <span className="text-brand-dim/40"> (+{queue.length - 1} more)</span>}
            </p>
            <div className="flex gap-2">
              <button
                onClick={onPlay}
                className="flex-1 bg-green-600 hover:bg-green-500 active:bg-green-700 text-white text-sm py-2.5 rounded-lg font-bold transition-colors"
              >
                ▶ Start Queue
              </button>
              <button
                onClick={onSkip}
                className="bg-white/10 hover:bg-white/15 text-brand-dim text-sm px-4 py-2.5 rounded-lg transition-colors"
              >
                Skip
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-brand-pink/20">
      <div>
        <p className="text-xs text-brand-pink font-mono uppercase tracking-widest">Now playing</p>
        <p className="text-brand-ink font-semibold mt-1">{nowPlaying.song?.title || '—'}</p>
        <p className="text-brand-dim text-sm">{nowPlaying.singer}</p>
      </div>

      {duration > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-brand-pink rounded-full transition-all duration-1000"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-brand-dim/60 font-mono tabular-nums">
            <span>{fmt(elapsed)}</span>
            <span>-{fmt(remaining)}</span>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onPlay}
          className="flex-1 bg-brand-purple/80 hover:bg-brand-purple active:bg-brand-purple/60 text-white text-sm py-2 rounded-lg transition-colors"
        >
          ▶ Play
        </button>
        <button
          onClick={onPause}
          className="flex-1 bg-white/10 hover:bg-white/15 text-brand-dim text-sm py-2 rounded-lg transition-colors"
        >
          ⏸ Pause
        </button>
        <button
          onClick={onSkip}
          className="flex-1 bg-brand-pink/20 hover:bg-brand-pink/30 text-brand-pink text-sm py-2 rounded-lg transition-colors"
        >
          ⏭ Skip
        </button>
      </div>
    </div>
  );
}


function DisplayMessageCard({ displayMsg }) {
  const active   = displayMsg?.active || false;
  const text     = displayMsg?.text || '';
  const position = displayMsg?.position || 'bottom';
  const scroll   = displayMsg?.scroll || false;
  const [customText, setCustomText] = useState(text);
  const debounceRef = useRef(null);

  useEffect(() => { setCustomText(text); }, [text]);

  async function applySettings(updates) {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  }

  function setActive(v) { applySettings({ display_message_active: String(v) }); }
  function setPosition(v) { applySettings({ display_message_position: v }); }
  function setScroll(v) { applySettings({ display_message_scroll: String(v) }); }

  function selectChip(msg) {
    setCustomText(msg);
    applySettings({ display_message: msg, display_message_active: 'true' });
  }

  function onTextChange(val) {
    setCustomText(val);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      applySettings({ display_message: val });
    }, 500);
  }

  return (
    <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-brand-dim font-medium">Display message</p>
        <button
          type="button"
          onClick={() => setActive(!active)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${active ? 'bg-brand-purple' : 'bg-white/15'}`}
        >
          <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? 'translate-x-6' : 'translate-x-1'}`} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {QUICK_MESSAGES.map((msg) => (
          <button
            key={msg}
            onClick={() => selectChip(msg)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors ${
              customText === msg
                ? 'bg-brand-purple/30 border-brand-purple/60 text-brand-purple'
                : 'bg-white/5 border-white/10 text-brand-dim hover:border-white/20'
            }`}
          >
            {msg}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={customText}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="Custom message..."
        className="w-full bg-white/5 text-brand-ink text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-brand-purple border border-white/10 placeholder:text-brand-dim/30"
      />

      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-xs text-brand-dim/60">Position:</span>
        {['top', 'center', 'bottom'].map((p) => (
          <button
            key={p}
            onClick={() => setPosition(p)}
            className={`text-xs px-2 py-1 rounded-full border transition-colors capitalize ${
              position === p
                ? 'bg-brand-amber/20 border-brand-amber/50 text-brand-amber'
                : 'bg-white/5 border-white/10 text-brand-dim/60 hover:border-white/20'
            }`}
          >
            {p}
          </button>
        ))}
        <label className="flex items-center gap-1.5 cursor-pointer ml-auto">
          <span className="text-xs text-brand-dim/60">Scroll</span>
          <button
            type="button"
            onClick={() => setScroll(!scroll)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${scroll ? 'bg-brand-purple' : 'bg-white/15'}`}
          >
            <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${scroll ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </label>
      </div>
    </div>
  );
}

function QueueTab({ queue, onRemove, onBump, onReorder }) {
  const dragItem = useRef(null);
  const dragOverItem = useRef(null);

  if (queue.length === 0) {
    return (
      <div className="flex items-center justify-center h-40 text-brand-dim/50 text-sm font-mono">
        Queue is empty
      </div>
    );
  }

  function handleDragStart(idx) { dragItem.current = idx; }
  function handleDragEnter(idx) { dragOverItem.current = idx; }

  function handleDragEnd() {
    if (dragItem.current === null || dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }
    const reordered = [...queue];
    const [moved] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, moved);
    dragItem.current = null;
    dragOverItem.current = null;
    onReorder(reordered.map((i) => i.id));
  }

  return (
    <ul className="space-y-2">
      {queue.map((item, idx) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragEnter={() => handleDragEnter(idx)}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => e.preventDefault()}
          className="bg-white/5 rounded-lg px-3 py-2.5 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing active:opacity-50 select-none border border-white/5 hover:border-brand-purple/30 transition-colors"
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-brand-dim/40 text-base shrink-0">⠿</span>
            <span className="text-brand-dim/50 text-xs w-4 shrink-0 tabular-nums font-mono">
              {item.position}
            </span>
            <div className="min-w-0">
              <p className="text-brand-ink text-xs font-medium truncate">{item.song.title}</p>
              <p className="text-brand-dim text-xs truncate">{item.singer}</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onBump(item.id)}
              className="text-xs bg-brand-amber/20 hover:bg-brand-amber/30 text-brand-amber px-1.5 py-1 rounded"
            >
              Next
            </button>
            <button
              onClick={() => onRemove(item.id)}
              className="text-xs bg-brand-pink/15 hover:bg-brand-pink/25 text-brand-pink px-1.5 py-1 rounded"
            >
              ✕
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function App() {
  const { state, connected } = useWebSocket();
  const [showSettings, setShowSettings] = useState(false);

  const apiFetch = useCallback(
    (url, opts = {}) =>
      fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts }),
    []
  );

  async function updateSetting(key, value) {
    await apiFetch('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ [key]: String(value) }),
    });
  }

  async function handlePlay() { await apiFetch('/api/playback/play', { method: 'POST' }); }
  async function handlePause() { await apiFetch('/api/playback/pause', { method: 'POST' }); }
  async function handleSkip() { await apiFetch('/api/playback/skip', { method: 'POST' }); }

  async function handleRemove(id) { await apiFetch(`/api/queue/${id}`, { method: 'DELETE' }); }
  async function handleBump(id) { await apiFetch(`/api/queue/${id}/bump`, { method: 'POST' }); }
  async function handleReorder(ids) {
    await apiFetch('/api/queue/reorder', {
      method: 'PUT',
      body: JSON.stringify({ order: ids }),
    });
  }

  async function handleApprove(id) { await apiFetch(`/api/requests/${id}/approve`, { method: 'POST' }); }
  async function handleReject(id) { await apiFetch(`/api/requests/${id}/reject`, { method: 'POST' }); }
  async function handleEditRequest(id, singerName) {
    await apiFetch(`/api/requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ singer_name: singerName }),
    });
  }

  const settings = state?.settings || {};
  const requestsBadge = state?.requests_pending || 0;
  const requests = state?.requests || [];
  const modeLabel = state?.mode || '—';
  const displayConnected = state?.display_connected || false;
  const bgm = state?.background_music;
  const bgHasSource = bgm?.source === 'local' ? !!bgm?.local_path : !!bgm?.url;
  const [bgVol, setBgVol] = useState(0.4);
  const [pinUnlocked, setPinUnlocked] = useState(null); // null = loading
  const [kofiIdx, setKofiIdx] = useState(0);
  const [kofiVisible, setKofiVisible] = useState(true);

  useEffect(() => { setBgVol(bgm?.volume ?? 0.4); }, [bgm?.volume]);

  useEffect(() => {
    const id = setInterval(() => {
      setKofiVisible(false);
      setTimeout(() => {
        setKofiIdx((i) => (i + 1) % KOFI_LABELS.length);
        setKofiVisible(true);
      }, 300);
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  async function handleBgToggle() {
    await apiFetch(`/api/bgmusic/${bgm?.playing ? 'pause' : 'play'}`, { method: 'POST' });
  }
  async function commitBgVolume(v) {
    await apiFetch('/api/bgmusic/volume', { method: 'PUT', body: JSON.stringify({ volume: v }) });
  }

  if (pinUnlocked === null) {
    return <PinOverlay onUnlock={() => setPinUnlocked(true)} />;
  }

  return (
    <div className="bg-brand-bg text-brand-ink flex flex-col h-screen overflow-hidden">
      <header className="bg-black/40 border-b border-white/10 px-4 py-3 flex items-center justify-between shrink-0 z-10 backdrop-blur-sm">
        <img src={logoUrl} alt="Kantahan" style={{ width: 140, height: 'auto' }} />
        <div className="flex items-center gap-3 text-sm">
          <a
            href="https://ko-fi.com/stephancraane"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border border-brand-amber/20 text-brand-amber/40 hover:text-brand-amber hover:border-brand-amber/50 transition-colors"
          >
            <BeerBottle className="w-3.5 h-3.5 shrink-0" />
            <span style={{ transition: 'opacity 0.3s', opacity: kofiVisible ? 1 : 0 }}>
              {KOFI_LABELS[kofiIdx]}
            </span>
          </a>
          <div className="flex items-center gap-1.5" title={displayConnected ? 'Display connected' : 'No display connected'}>
            <span className={`w-2 h-2 rounded-full ${displayConnected ? 'bg-green-400' : 'bg-red-500'}`} />
            <span className="text-brand-dim/60 text-xs font-mono">display</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
            <span className="text-brand-dim font-mono capitalize">{modeLabel}</span>
          </div>
          <button
            onClick={() => window.open(window.location.origin + '/display', '_blank', 'noopener')}
            title="Open display screen in new window (F11 or double-click for fullscreen)"
            className="text-xs px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-brand-dim/60 hover:text-brand-dim transition-colors font-mono"
          >
            Display ↗
          </button>
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="p-1.5 rounded-lg hover:bg-white/10 text-brand-dim hover:text-brand-ink transition-colors text-base leading-none"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Settings overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative bg-brand-bg border-l border-white/10 w-full max-w-lg flex flex-col z-10">
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0 bg-black/40 backdrop-blur-sm">
              <p className="text-brand-ink font-medium">Settings</p>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 text-brand-dim hover:text-brand-ink transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <Settings indexing={state?.indexing} scanning={state?.scanning} />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden grid" style={{ gridTemplateColumns: '40% 30% 30%' }}>
        {/* Library column */}
        <div className="overflow-y-auto border-r border-white/10 p-3">
          <p className="text-brand-dim/40 text-[10px] font-mono uppercase tracking-widest mb-2">Library</p>
          <Library />
        </div>

        {/* Controls column */}
        <div className="overflow-y-auto border-r border-white/10 p-3 space-y-3">
          <NowPlayingSection
            state={state}
            onPlay={handlePlay}
            onPause={handlePause}
            onSkip={handleSkip}
          />

          <DisplayMessageCard displayMsg={state?.display_message} />

          <div className="bg-white/5 rounded-xl p-3 border border-white/10 space-y-2">
            <div className="grid grid-cols-2 gap-x-4">
              <Toggle
                label="Auto Approve"
                value={settings.auto_approve === true}
                onChange={(v) => updateSetting('auto_approve', v)}
              />
              <Toggle
                label="Singer Rotation"
                value={settings.singer_rotation !== false}
                onChange={(v) => updateSetting('singer_rotation', v)}
              />
              <Toggle
                label="Auto Play"
                value={settings.auto_play !== false}
                onChange={(v) => updateSetting('auto_play', v)}
              />
              <Toggle
                label="Auto Queue"
                value={settings.auto_queue !== false}
                onChange={(v) => updateSetting('auto_queue', v)}
              />
              <Toggle
                label="Auto Start"
                value={settings.auto_start === true}
                onChange={(v) => updateSetting('auto_start', v)}
              />
              <Toggle
                label="BG Music"
                value={bgm?.playing === true && bgHasSource}
                onChange={() => handleBgToggle()}
                disabled={!bgHasSource}
              />
            </div>
            {bgHasSource && (
              <div className="flex items-center gap-2 pt-1 border-t border-white/10">
                <span className="text-brand-dim/40 text-[10px] font-mono">
                  {bgm?.source === 'local' ? 'Local' : 'YT'} 🔈
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={bgVol}
                  onChange={(e) => setBgVol(parseFloat(e.target.value))}
                  onMouseUp={(e) => commitBgVolume(parseFloat(e.target.value))}
                  onTouchEnd={(e) => commitBgVolume(parseFloat(e.target.value))}
                  className="flex-1 accent-brand-purple"
                />
                <span className="text-brand-dim/40 text-[10px] font-mono w-7 text-right tabular-nums">
                  {Math.round(bgVol * 100)}%
                </span>
              </div>
            )}
          </div>

          <div>
            <p className="text-brand-dim/40 text-[10px] font-mono uppercase tracking-widest mb-2 flex items-center gap-2">
              Requests
              {requestsBadge > 0 && (
                <span className="bg-brand-pink text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                  {requestsBadge > 9 ? '9+' : requestsBadge}
                </span>
              )}
            </p>
            <RequestsInbox
              requests={requests}
              onApprove={handleApprove}
              onReject={handleReject}
              onEditName={handleEditRequest}
            />
          </div>
        </div>

        {/* Queue column */}
        <div className="overflow-y-auto p-3">
          <p className="text-brand-dim/40 text-[10px] font-mono uppercase tracking-widest mb-2">
            Queue {state?.queue?.length > 0 && <span className="text-brand-dim/30">({state.queue.length})</span>}
          </p>
          <QueueTab
            queue={state?.queue || []}
            onRemove={handleRemove}
            onBump={handleBump}
            onReorder={handleReorder}
          />
        </div>
      </div>
    </div>
  );
}
