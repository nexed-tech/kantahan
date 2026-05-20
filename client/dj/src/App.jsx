import { useState, useCallback, useRef, useEffect } from 'react';
import { useWebSocket } from '../../shared/useWebSocket';
import Settings from './components/Settings';
import RequestsInbox from './components/RequestsInbox';

const TABS = ['queue', 'requests', 'settings'];

function Tab({ label, active, badge, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`relative px-4 py-2 text-sm font-medium rounded-t transition-colors ${
        active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white'
      }`}
    >
      {label}
      {badge > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 py-2 cursor-pointer">
      <span className="text-sm text-gray-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors ${
          value ? 'bg-purple-600' : 'bg-gray-600'
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

  if (mode === 'between') {
    const waiting = !countdown?.active || countdown.seconds_remaining === 0;
    return (
      <div className="bg-gray-800 rounded-xl p-4 space-y-3 border border-purple-700/40">
        <div>
          <p className="text-xs text-purple-300 uppercase tracking-widest">Up next</p>
          <p className="text-white font-semibold mt-1 text-lg">
            {countdown?.next_song?.title || '—'}
          </p>
          <p className="text-gray-400 text-sm">{countdown?.next_singer}</p>
        </div>

        {waiting ? (
          <p className="text-gray-500 text-sm">Countdown paused — waiting for manual start</p>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-yellow-400 text-4xl font-mono font-bold tabular-nums">
              {countdown.seconds_remaining}s
            </span>
            <span className="text-gray-500 text-sm">auto-starting...</span>
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
            className="bg-red-800 hover:bg-red-700 active:bg-red-900 text-white text-sm px-4 py-3 rounded-lg transition-colors"
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
      <div className="bg-gray-800 rounded-xl p-4 space-y-3">
        <p className="text-gray-500 text-sm">No song playing</p>
        {queue.length > 0 && (
          <>
            <p className="text-gray-400 text-xs">
              Next up: <span className="text-white">{queue[0].song.title}</span>
              <span className="text-gray-500"> — {queue[0].singer}</span>
              {queue.length > 1 && <span className="text-gray-600"> (+{queue.length - 1} more)</span>}
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
                className="bg-gray-700 hover:bg-gray-600 text-white text-sm px-4 py-2.5 rounded-lg transition-colors"
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
    <div className="bg-gray-800 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-xs text-gray-400 uppercase tracking-widest">Now playing</p>
        <p className="text-white font-semibold mt-1">{nowPlaying.song?.title || '—'}</p>
        <p className="text-gray-400 text-sm">{nowPlaying.singer}</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onPlay}
          className="flex-1 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white text-sm py-2 rounded-lg transition-colors"
        >
          ▶ Play
        </button>
        <button
          onClick={onPause}
          className="flex-1 bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded-lg transition-colors"
        >
          ⏸ Pause
        </button>
        <button
          onClick={onSkip}
          className="flex-1 bg-red-700 hover:bg-red-600 text-white text-sm py-2 rounded-lg transition-colors"
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
    <div className="bg-gray-800 rounded-xl px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-300 font-medium">Background Music</p>
          {!url && (
            <p className="text-gray-600 text-xs mt-0.5">Set a YouTube URL in Settings</p>
          )}
        </div>
        <button
          onClick={toggle}
          disabled={!url}
          className={`relative w-10 h-6 rounded-full transition-colors disabled:opacity-30 ${
            playing && url ? 'bg-purple-600' : 'bg-gray-600'
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
          <span className="text-gray-500 text-xs">🔈</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={localVol}
            onChange={(e) => setLocalVol(parseFloat(e.target.value))}
            onMouseUp={(e) => commitVolume(parseFloat(e.target.value))}
            onTouchEnd={(e) => commitVolume(parseFloat(e.target.value))}
            className="flex-1 accent-purple-500"
          />
          <span className="text-gray-400 text-xs w-8 text-right">
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
      <div className="flex items-center justify-center h-40 text-gray-500 text-sm">
        Queue is empty
      </div>
    );
  }

  function handleDragStart(idx) {
    dragItem.current = idx;
  }

  function handleDragEnter(idx) {
    dragOverItem.current = idx;
  }

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
          className="bg-gray-800 rounded-lg px-4 py-3 flex items-center justify-between gap-3 cursor-grab active:cursor-grabbing active:opacity-50 select-none"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-gray-600 text-base shrink-0">⠿</span>
            <span className="text-gray-500 text-sm w-5 shrink-0 tabular-nums">
              {item.position}
            </span>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium truncate">{item.song.title}</p>
              <p className="text-gray-400 text-xs">{item.singer}</p>
            </div>
          </div>
          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => onBump(item.id)}
              className="text-xs bg-yellow-700 hover:bg-yellow-600 text-white px-2 py-1 rounded"
            >
              Next
            </button>
            <button
              onClick={() => onRemove(item.id)}
              className="text-xs bg-red-800 hover:bg-red-700 text-white px-2 py-1 rounded"
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

  async function handlePlay() {
    await apiFetch('/api/playback/play', { method: 'POST' });
  }
  async function handlePause() {
    await apiFetch('/api/playback/pause', { method: 'POST' });
  }
  async function handleSkip() {
    await apiFetch('/api/playback/skip', { method: 'POST' });
  }

  async function handleRemove(id) {
    await apiFetch(`/api/queue/${id}`, { method: 'DELETE' });
  }
  async function handleBump(id) {
    await apiFetch(`/api/queue/${id}/bump`, { method: 'POST' });
  }
  async function handleReorder(ids) {
    await apiFetch('/api/queue/reorder', {
      method: 'PUT',
      body: JSON.stringify({ order: ids }),
    });
  }

  async function handleApprove(id) {
    await apiFetch(`/api/requests/${id}/approve`, { method: 'POST' });
  }
  async function handleReject(id) {
    await apiFetch(`/api/requests/${id}/reject`, { method: 'POST' });
  }
  async function handleEditRequest(id, singerName) {
    await apiFetch(`/api/requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ singer_name: singerName }),
    });
  }

  const settings = state?.settings || {};
  const requestsBadge = state?.requests_pending || 0;
  const requests = state?.requests || [];

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <h1 className="font-bold text-lg">Kantahan DJ</h1>
        <div className="flex items-center gap-2 text-sm">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`}
          />
          <span className="text-gray-400 capitalize">{state?.mode || '—'}</span>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-4 max-w-2xl mx-auto w-full space-y-4 pb-8">
        <NowPlayingSection
          state={state}
          onPlay={handlePlay}
          onPause={handlePause}
          onSkip={handleSkip}
        />

        <div className="bg-gray-800 rounded-xl px-4 divide-y divide-gray-700">
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
          <div className="flex gap-1 border-b border-gray-700 mb-3">
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
          {activeTab === 'settings' && <Settings indexing={state?.indexing} />}
        </div>
      </div>
    </div>
  );
}
