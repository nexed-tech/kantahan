import { useState, useEffect, useRef } from 'react';
import { djFetch } from '../lib/djFetch';

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-brand-dim">{label}</label>
      {hint && <p className="text-xs text-brand-dim/50">{hint}</p>}
      {children}
    </div>
  );
}

// Single-line summary row shown when a section is configured and collapsed.
function CollapsedRow({ dot, label, sublabel, onExpand }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} />
        <span className="text-sm text-brand-dim">{label}</span>
        {sublabel && <span className="text-brand-dim/40 font-mono text-xs">· {sublabel}</span>}
      </div>
      <button
        onClick={onExpand}
        className="text-brand-dim/40 hover:text-brand-dim transition-colors text-base leading-none px-1"
        title="Edit"
      >
        ⚙
      </button>
    </div>
  );
}

const inputCls =
  'bg-white/5 text-brand-ink text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-purple border border-white/10 focus:border-brand-purple/50 placeholder:text-brand-dim/30 transition-colors';

export default function Settings({ indexing, scanning }) {
  // ── API key ──────────────────────────────────────────────────────────────────
  const [apiKey, setApiKey]           = useState('');
  const [apiKeySet, setApiKeySet]     = useState(false);
  const [apiKeyMsg, setApiKeyMsg]     = useState('');
  const [apiKeyExpanded, setApiKeyExpanded] = useState(true); // collapses once key is confirmed set

  // ── PIN ───────────────────────────────────────────────────────────────────────
  const [pinSet, setPinSet]           = useState(false);
  const [newPin, setNewPin]           = useState('');
  const [pinMsg, setPinMsg]           = useState('');
  const [pinExpanded, setPinExpanded] = useState(true);

  // ── General ───────────────────────────────────────────────────────────────────
  const [localPath, setLocalPath]           = useState('');
  const [bgMusicUrl, setBgMusicUrl]         = useState('');
  const [bgMusicSource, setBgMusicSource]   = useState('youtube');
  const [bgMusicLocalPath, setBgMusicLocalPath] = useState('');
  const [countdown, setCountdown]           = useState('10');
  const [hostUrl, setHostUrl]               = useState('');
  const [saving, setSaving]                 = useState(false);

  // ── Channels ──────────────────────────────────────────────────────────────────
  const [channels, setChannels]         = useState([]);
  const [channelUrl, setChannelUrl]     = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [channelError, setChannelError] = useState('');
  const prevIndexingActiveRef           = useRef(false);
  const [skippedOpen, setSkippedOpen]   = useState(false);

  // ── Info / network ────────────────────────────────────────────────────────────
  const [info, setInfo] = useState(null);

  // ── Close behaviour (Electron only) ──────────────────────────────────────────
  const [closeBehaviour, setCloseBehaviourState] = useState('quit');

  // ── Mount ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    djFetch('/api/settings/youtube-api-key/status')
      .then((r) => r.json())
      .then((d) => { setApiKeySet(d.set); setApiKeyExpanded(!d.set); });

    djFetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        setLocalPath(s.local_media_path || '');
        setBgMusicUrl(s.background_music_url || '');
        setBgMusicSource(s.background_music_source || 'youtube');
        setBgMusicLocalPath(s.background_music_local_path || '');
        setCountdown(s.countdown_seconds || '10');
        setHostUrl(s.host_url || '');
      });

    djFetch('/api/info')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});

    djFetch('/api/settings/dj-pin/status')
      .then((r) => r.json())
      .then((d) => { setPinSet(d.set); setPinExpanded(!d.set); })
      .catch(() => {});

    // Close behaviour — only available when running inside Electron
    if (typeof window.electronAPI !== 'undefined') {
      window.electronAPI.getCloseBehaviour().then(setCloseBehaviourState);
    }

    loadChannels();
  }, []);

  // Reload channel list when indexing finishes
  useEffect(() => {
    if (prevIndexingActiveRef.current && !indexing?.active) loadChannels();
    prevIndexingActiveRef.current = indexing?.active ?? false;
  }, [indexing?.active]);

  // ── Actions ───────────────────────────────────────────────────────────────────

  function loadChannels() {
    djFetch('/api/channels').then((r) => r.json()).then(setChannels).catch(() => {});
  }

  async function reindexAll() {
    await djFetch('/api/channels/reindex-all', { method: 'POST' });
  }

  async function saveApiKey() {
    setSaving(true);
    try {
      const res  = await djFetch('/api/settings/youtube-api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey }),
      });
      const data = await res.json();
      setApiKeySet(data.set);
      setApiKey('');
      setApiKeyExpanded(!data.set); // collapse if saved, expand (to re-enter) if cleared
      setApiKeyMsg(data.set ? 'API key saved.' : 'Key cleared.');
      setTimeout(() => setApiKeyMsg(''), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function clearApiKey() {
    setSaving(true);
    try {
      await djFetch('/api/settings/youtube-api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: '' }),
      });
      setApiKeySet(false);
      setApiKey('');
      setApiKeyExpanded(true);
      setApiKeyMsg('Key cleared.');
      setTimeout(() => setApiKeyMsg(''), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function saveGeneralSettings() {
    setSaving(true);
    try {
      await djFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local_media_path: localPath,
          background_music_url: bgMusicUrl,
          background_music_source: bgMusicSource,
          background_music_local_path: bgMusicLocalPath,
          countdown_seconds: countdown,
          host_url: hostUrl,
        }),
      });
    } finally {
      setSaving(false);
    }
  }

  async function addChannel() {
    if (!channelUrl.trim()) return;
    setAddingChannel(true);
    setChannelError('');
    try {
      const res  = await djFetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: channelUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setChannelError(data.error || 'Failed to add channel');
      else { setChannelUrl(''); loadChannels(); }
    } finally {
      setAddingChannel(false);
    }
  }

  async function reindexChannel(id) {
    await djFetch(`/api/channels/${id}/reindex`, { method: 'POST' });
  }

  async function deleteChannel(id) {
    await djFetch(`/api/channels/${id}`, { method: 'DELETE' });
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }

  async function scanLocal() {
    await djFetch('/api/media/scan', { method: 'POST' });
  }

  async function savePin(pinOverride) {
    const pin = pinOverride !== undefined ? pinOverride : newPin;
    if (pin && !/^\d{4}$/.test(pin)) {
      setPinMsg('PIN must be exactly 4 digits.');
      setTimeout(() => setPinMsg(''), 3000);
      return;
    }
    const res  = await djFetch('/api/settings/dj-pin', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    setPinSet(data.set);
    setNewPin('');
    setPinExpanded(!data.set); // collapse if PIN was set, expand if removed
    setPinMsg(pin ? 'PIN saved.' : 'PIN removed.');
    setTimeout(() => setPinMsg(''), 3000);
  }

  async function handleCloseBehaviourChange(value) {
    setCloseBehaviourState(value);
    if (typeof window.electronAPI !== 'undefined') {
      await window.electronAPI.setCloseBehaviour(value);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────────
  const isIndexing = indexing?.active;
  const isScanning = scanning?.active;
  const scanDone   = !isScanning && scanning?.processed > 0 && !scanning?.error;

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">

      {/* Network info */}
      {info && (
        <div className="bg-white/5 rounded-xl p-4 space-y-2 text-sm border border-white/10">
          <p className="text-brand-dim/60 text-xs font-mono uppercase tracking-widest mb-2">Network</p>
          {[['Display', info.urls.display], ['DJ', info.urls.dj], ['Request', info.urls.request]].map(
            ([label, url]) => (
              <p key={label}>
                <span className="text-brand-dim/60">{label}: </span>
                <span className="text-brand-purple font-mono">{url}</span>
              </p>
            )
          )}
          {info.baseUrl && (
            <p className="text-brand-dim/40 text-xs font-mono mt-1">Base: {info.baseUrl}</p>
          )}
        </div>
      )}

      {/* ── YouTube API key ── */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        {apiKeySet && !apiKeyExpanded ? (
          <div className="px-4 py-3">
            <CollapsedRow
              dot="bg-green-400"
              label="YouTube API key"
              sublabel="configured"
              onExpand={() => setApiKeyExpanded(true)}
            />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-brand-dim/60 text-xs font-mono uppercase tracking-widest">YouTube</p>
              {apiKeySet && (
                <button
                  onClick={() => setApiKeyExpanded(false)}
                  className="text-brand-dim/40 hover:text-brand-dim transition-colors text-xs font-mono"
                >
                  collapse ↑
                </button>
              )}
            </div>
            <Field
              label="API Key"
              hint={apiKeySet
                ? 'A key is saved. Enter a new one to replace it.'
                : 'Required for YouTube channel indexing and search.'}
            >
              <div className="flex gap-2 mt-1">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={apiKeySet ? '••••••••••••' : 'AIza...'}
                  className={`flex-1 ${inputCls}`}
                />
                <button
                  onClick={saveApiKey}
                  disabled={saving}
                  className="bg-brand-purple hover:bg-brand-purple/80 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  Save
                </button>
                {apiKeySet && (
                  <button
                    onClick={clearApiKey}
                    disabled={saving}
                    className="bg-brand-pink/20 hover:bg-brand-pink/30 disabled:opacity-50 text-brand-pink text-sm px-3 py-2 rounded-lg transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              {apiKeyMsg && <p className="text-green-400 text-xs mt-1 font-mono">{apiKeyMsg}</p>}
            </Field>
          </div>
        )}
      </div>

      {/* ── YouTube channels ── */}
      <div className="bg-white/5 rounded-xl p-4 space-y-4 border border-white/10">
        <div className="flex items-center justify-between">
          <p className="text-brand-dim/60 text-xs font-mono uppercase tracking-widest">YouTube Channels</p>
          <button
            onClick={reindexAll}
            disabled={isIndexing || channels.length === 0}
            className="text-xs bg-brand-purple/20 hover:bg-brand-purple/30 disabled:opacity-40 text-brand-purple px-2.5 py-1 rounded-lg transition-colors"
            title="Re-index all channels"
          >
            ↻ Re-index all
          </button>
        </div>

        {isIndexing && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-brand-dim/60 font-mono">
              <span>Indexing {indexing.channel_name}...</span>
              <span>{indexing.processed} videos</span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-brand-purple animate-pulse w-full" />
            </div>
          </div>
        )}
        {!isIndexing && indexing?.error && (
          <p className="text-brand-pink text-xs font-mono">Error: {indexing.error}</p>
        )}
        {!isIndexing && indexing?.processed > 0 && !indexing?.error && (
          <p className="text-green-400 text-xs font-mono">
            Indexed {indexing.processed} songs from {indexing.channel_name}
            {indexing.skipped > 0 && (
              <span className="text-brand-dim/60">, skipped {indexing.skipped} (embedding disabled)</span>
            )}
            {indexing.removed > 0 && (
              <span className="text-brand-dim/60">, removed {indexing.removed} deleted</span>
            )}
          </p>
        )}

        {channels.length > 0 && (
          <ul className="space-y-2">
            {channels.map((ch) => {
              const isPending = ch.id.startsWith('pending_');
              return (
                <li
                  key={ch.id}
                  className="flex items-center justify-between gap-3 bg-white/5 rounded-lg px-3 py-2 border border-white/5"
                >
                  <div className="min-w-0">
                    <p className="text-brand-ink text-sm truncate">{ch.name}</p>
                    {isPending ? (
                      <p className="text-brand-amber/60 text-xs font-mono">Not indexed — press ↻ to add</p>
                    ) : ch.video_count > 0 ? (
                      <p className="text-brand-dim/50 text-xs font-mono">{ch.video_count} videos</p>
                    ) : null}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button
                      onClick={() => reindexChannel(ch.id)}
                      disabled={isIndexing}
                      className="text-xs bg-brand-purple/20 hover:bg-brand-purple/30 disabled:opacity-40 text-brand-purple px-2 py-1 rounded"
                      title="Re-index"
                    >
                      ↻
                    </button>
                    <button
                      onClick={() => deleteChannel(ch.id)}
                      disabled={isIndexing}
                      className="text-xs bg-brand-pink/15 hover:bg-brand-pink/25 disabled:opacity-40 text-brand-pink px-2 py-1 rounded"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Field label="Add channel" hint="YouTube channel URL or handle (e.g. @channelname)">
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChannel()}
              placeholder="https://youtube.com/@..."
              disabled={isIndexing}
              className={`flex-1 disabled:opacity-40 ${inputCls}`}
            />
            <button
              onClick={addChannel}
              disabled={addingChannel || isIndexing || !channelUrl.trim()}
              className="bg-brand-purple hover:bg-brand-purple/80 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {addingChannel ? '...' : 'Add'}
            </button>
          </div>
          {channelError && <p className="text-brand-pink text-xs mt-1 font-mono">{channelError}</p>}
        </Field>
      </div>

      {/* ── General settings ── */}
      <div className="bg-white/5 rounded-xl p-4 space-y-4 border border-white/10">
        <p className="text-brand-dim/60 text-xs font-mono uppercase tracking-widest">General</p>

        <div className="space-y-2">
          <label className="text-sm font-medium text-brand-dim">Background music source</label>
          <div className="flex gap-2">
            {[['youtube', 'YouTube'], ['local', 'Local files']].map(([val, lbl]) => (
              <button
                key={val}
                onClick={() => setBgMusicSource(val)}
                className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                  bgMusicSource === val
                    ? 'bg-brand-purple/20 border-brand-purple/50 text-brand-purple'
                    : 'bg-white/5 border-white/10 text-brand-dim hover:border-white/20'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>
          {bgMusicSource === 'youtube' && (
            <input
              type="text"
              value={bgMusicUrl}
              onChange={(e) => setBgMusicUrl(e.target.value)}
              placeholder="https://youtube.com/playlist?list=..."
              className={`w-full ${inputCls}`}
            />
          )}
          {bgMusicSource === 'local' && (
            <input
              type="text"
              value={bgMusicLocalPath}
              onChange={(e) => setBgMusicLocalPath(e.target.value)}
              placeholder="C:\music\background"
              className={`w-full ${inputCls}`}
            />
          )}
          <p className="text-brand-dim/40 text-xs font-mono">
            {bgMusicSource === 'youtube'
              ? 'YouTube video or playlist to play between songs'
              : 'Folder with MP3/MP4 files to shuffle between songs'}
          </p>
        </div>

        <Field label="Countdown duration (seconds)">
          <input
            type="number"
            min="3"
            max="60"
            value={countdown}
            onChange={(e) => setCountdown(e.target.value)}
            className={`w-24 ${inputCls}`}
          />
        </Field>

        <Field
          label="Host URL override"
          hint="Leave blank to use kantahan.local (recommended). Set to e.g. http://192.168.1.50:3000 for Docker or networks without mDNS."
        >
          <input
            type="text"
            value={hostUrl}
            onChange={(e) => setHostUrl(e.target.value)}
            placeholder="http://192.168.1.50:3000"
            className={`w-full ${inputCls}`}
          />
        </Field>

        <Field
          label="Local media folder"
          hint="Path to folder with .mp3/.cdg pairs or .mkv/.mp4 files"
        >
          <input
            type="text"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="C:\karaoke\files"
            className={`w-full ${inputCls}`}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={saveGeneralSettings}
            disabled={saving}
            className="bg-white/10 hover:bg-white/15 disabled:opacity-50 text-brand-dim text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Save settings
          </button>
          <button
            onClick={scanLocal}
            disabled={isScanning || !localPath.trim()}
            className="bg-brand-purple/20 hover:bg-brand-purple/30 disabled:opacity-40 text-brand-purple text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {isScanning ? 'Scanning...' : 'Scan local files'}
          </button>
        </div>

        {/* Scan progress */}
        {isScanning && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-brand-dim/60 font-mono">
              <span>
                {scanning.phase === 'discovering' && 'Discovering files…'}
                {scanning.phase === 'indexing'    && 'Indexing CDG / ZIP pairs…'}
                {scanning.phase === 'probing'     && 'Checking video codecs…'}
                {!scanning.phase                  && 'Scanning files…'}
              </span>
              <span>
                {scanning.phase === 'discovering'
                  ? `${(scanning.discovered ?? 0).toLocaleString()} found`
                  : `${(scanning.processed ?? 0).toLocaleString()}${scanning.total ? ` / ${scanning.total.toLocaleString()}` : ''}`}
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-purple transition-all duration-300"
                style={{
                  width: scanning.total
                    ? `${Math.min((scanning.processed / scanning.total) * 100, 100)}%`
                    : '100%',
                  animation: scanning.total ? 'none' : 'pulse 1.5s infinite',
                }}
              />
            </div>
          </div>
        )}
        {scanDone && (
          <div className="space-y-2">
            <p className="text-green-400 text-xs font-mono">
              Found {scanning.processed} files
              {scanning.skipped?.length > 0 && (
                <span className="text-brand-dim/60">, skipped {scanning.skipped.length}</span>
              )}
              {scanning.removed > 0 && (
                <span className="text-brand-dim/60">, removed {scanning.removed} stale</span>
              )}
            </p>
            {scanning.skipped?.length > 0 && (
              <div>
                <button
                  onClick={() => setSkippedOpen((v) => !v)}
                  className="text-xs text-brand-dim/50 font-mono hover:text-brand-dim transition-colors"
                >
                  {skippedOpen ? '▼' : '▶'} Skipped files ({scanning.skipped.length})
                </button>
                {skippedOpen && (
                  <ul className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {scanning.skipped.map((s, i) => (
                      <li key={i} className="text-[11px] font-mono text-brand-dim/40 truncate">
                        <span className="text-brand-pink/60">{s.reason}:</span> {s.path}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
        {scanning?.error && (
          <p className="text-brand-pink text-xs font-mono">Scan error: {scanning.error}</p>
        )}
      </div>

      {/* ── DJ PIN ── */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        {pinSet && !pinExpanded ? (
          <div className="px-4 py-3">
            <CollapsedRow
              dot="bg-green-400"
              label="DJ PIN"
              sublabel="set"
              onExpand={() => setPinExpanded(true)}
            />
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-brand-dim/60 text-xs font-mono uppercase tracking-widest">DJ PIN</p>
              {pinSet && (
                <button
                  onClick={() => setPinExpanded(false)}
                  className="text-brand-dim/40 hover:text-brand-dim transition-colors text-xs font-mono"
                >
                  collapse ↑
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${pinSet ? 'bg-green-400' : 'bg-white/20'}`} />
              <span className="text-xs text-brand-dim/60 font-mono">
                {pinSet ? 'PIN is set' : 'No PIN — open access'}
              </span>
            </div>
            <Field label={pinSet ? 'Change PIN' : 'Set PIN'} hint="4-digit PIN. Leave blank to remove PIN.">
              <div className="flex gap-2 mt-1">
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder="1234"
                  className={`w-28 font-mono tracking-widest ${inputCls}`}
                />
                <button
                  onClick={() => savePin()}
                  className="bg-brand-purple hover:bg-brand-purple/80 text-white text-sm px-4 py-2 rounded-lg transition-colors"
                >
                  {pinSet ? 'Change' : 'Set PIN'}
                </button>
                {pinSet && (
                  <button
                    onClick={() => savePin('')}
                    className="bg-brand-pink/20 hover:bg-brand-pink/30 text-brand-pink text-sm px-3 py-2 rounded-lg transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
              {pinMsg && <p className="text-green-400 text-xs mt-1 font-mono">{pinMsg}</p>}
            </Field>
          </div>
        )}
      </div>

      {/* ── App behaviour (Electron only) ── */}
      {info?.electron && (
        <div className="bg-white/5 rounded-xl p-4 space-y-3 border border-white/10">
          <p className="text-brand-dim/60 text-xs font-mono uppercase tracking-widest">App</p>
          <div className="space-y-1">
            <label className="text-sm font-medium text-brand-dim">When closing the window</label>
            <div className="flex gap-2 mt-2">
              {[
                ['quit', 'Quit Kantahan'],
                ['tray', 'Minimise to tray'],
              ].map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => handleCloseBehaviourChange(val)}
                  className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    closeBehaviour === val
                      ? 'bg-brand-purple/20 border-brand-purple/50 text-brand-purple'
                      : 'bg-white/5 border-white/10 text-brand-dim hover:border-white/20'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
            {closeBehaviour === 'tray' && (
              <p className="text-brand-dim/40 text-xs font-mono pt-1">
                The server keeps running in the background. Right-click the tray icon to quit.
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
