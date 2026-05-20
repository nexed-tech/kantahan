import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from '../../shared/useWebSocket';
import Settings from './components/Settings';
import RequestsInbox from './components/RequestsInbox';
import Library from './components/Library';
import logoUrl from './assets/logo-marquee-primary-animated.svg';

const TABS = ['queue', 'requests', 'library', 'settings'];

function fmt(secs) {
  const s = Math.max(0, Math.floor(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function Tab({ label, active, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 text-sm font-medium rounded-t transition-colors ${
        active
          ? 'bg-white/10 text-brand-ink'
          : 'text-brand-dim hover:text-brand-ink'
      }`}
    >
      {label}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-brand-pink text-white text-xs rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
      <span className="text-sm text-brand-dim">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors ${
          value ? 'bg-brand-purple' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
            value ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
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

function BgMusicCard({ bgm }) {
  const playing = bgm?.playing || false;
  const url = bgm?.url || '';
  const [localVol, setLocalVol] = useState(bgm?.volume ?? 0.4);

  useEffect(() => { setLocalVol(bgm?.volume ?? 0.4); }, [bgm?.volume]);

  async function toggle() {
    await fetch(`/api/bgmusic/${playing ? 'pause' : 'play'}`, { method: 'POST' });
  }

  async function commitVolume(v) {
    await fetch('/api/bgmusic/volume', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume: v }),
    });
  }

  return (
    <div className="bg-white/5 rounded-xl px-4 py-3 space-y-2 border border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-brand-dim font-medium">Background Music</p>
          {!url && (
            <p className="text-brand-dim/40 text-xs mt-0.5 font-mono">Set a YouTube URL in Settings</p>
          )}
        </div>
        <button
          onClick={toggle}
          disabled={!url}
          className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-30 ${
            playing && url ? 'bg-brand-purple' : 'bg-white/15'
          }`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
              playing && url ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      {url && (
        <div className="flex items-center gap-3">
          <span className="text-brand-dim/60 text-xs">🔈</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={localVol}
            onChange={(e) => setLocalVol(parseFloat(e.target.value))}
            onMouseUp={(e) => commitVolume(parseFloat(e.target.value))}
            onTouchEnd={(e) => commitVolume(parseFloat(e.target.value))}
            className="flex-1 accent-brand-purple"
          />
          <span className="text-brand-dim/60 text-xs w-8 text-right font-mono">
            {Math.round(localVol * 100)}%
          </span>
        </div>
      )}
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
          className="bg-white/5 rounded-lg px-4 py-3 flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing active:opacity-50 select-none border border-white/5 hover:border-brand-purple/30 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-brand-dim/40 text-base shrink-0">⠿</span>
            <span className="text-brand-dim/50 text-sm w-5 shrink-0 tabular-nums font-mono">
              {item.position}
            </span>
            <div className="min-w-0">
              <p className="text-brand-ink text-sm font-medium truncate">{item.song.title}</p>
              <p className="text-brand-dim text-xs">{item.singer}</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onBump(item.id)}
              className="text-xs bg-brand-amber/20 hover:bg-brand-amber/30 text-brand-amber px-2 py-1 rounded"
            >
              Next
            </button>
            <button
              onClick={() => onRemove(item.id)}
              className="text-xs bg-brand-pink/15 hover:bg-brand-pink/25 text-brand-pink px-2 py-1 rounded"
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
  const [activeTab, setActiveTab] = useState('queue');

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

  return (
    <div className="min-h-screen bg-brand-bg text-brand-ink flex flex-col">
      <header className="bg-black/40 border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm">
        <img src={logoUrl} alt="Kantahan" style={{ width: 140, height: 'auto' }} />
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`}
          />
          <span className="text-brand-dim font-mono capitalize">{modeLabel}</span>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 max-w-2xl mx-auto w-full space-y-4 pb-8">
        <NowPlayingSection
          state={state}
          onPlay={handlePlay}
          onPause={handlePause}
          onSkip={handleSkip}
        />

        <div className="bg-white/5 rounded-xl px-4 divide-y divide-white/10 border border-white/10">
          <Toggle
            label="Auto Approve requests"
            value={settings.auto_approve === true}
            onChange={(v) => updateSetting('auto_approve', v)}
          />
          <Toggle
            label="Singer Rotation"
            value={settings.singer_rotation !== false}
            onChange={(v) => updateSetting('singer_rotation', v)}
          />
          <Toggle
            label="Auto Play after countdown"
            value={settings.auto_play !== false}
            onChange={(v) => updateSetting('auto_play', v)}
          />
          <Toggle
            label="Auto Queue approved requests"
            value={settings.auto_queue !== false}
            onChange={(v) => updateSetting('auto_queue', v)}
          />
        </div>

        <BgMusicCard bgm={state?.background_music} />

        <div>
          <div className="flex gap-1 border-b border-white/10 mb-3">
            {TABS.map((tab) => (
              <Tab
                key={tab}
                label={tab.charAt(0).toUpperCase() + tab.slice(1)}
                active={activeTab === tab}
                badge={tab === 'requests' ? requestsBadge : 0}
                onClick={() => setActiveTab(tab)}
              />
            ))}
          </div>

          {activeTab === 'queue' && (
            <QueueTab
              queue={state?.queue || []}
              onRemove={handleRemove}
              onBump={handleBump}
              onReorder={handleReorder}
            />
          )}
          {activeTab === 'requests' && (
            <RequestsInbox
              requests={requests}
              onApprove={handleApprove}
              onReject={handleReject}
              onEditName={handleEditRequest}
            />
          )}
          {activeTab === 'library' && <Library />}
          {activeTab === 'settings' && <Settings indexing={state?.indexing} />}
        </div>
      </div>
    </div>
  );
}
