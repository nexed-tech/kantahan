import { useState, useEffect } from 'react';
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

export default function Settings({ scanning }) {
  // ── PIN ───────────────────────────────────────────────────────────────────────
  const [pinSet, setPinSet]           = useState(false);
  const [newPin, setNewPin]           = useState('');
  const [pinMsg, setPinMsg]           = useState('');
  const [pinExpanded, setPinExpanded] = useState(true);

  // ── General ───────────────────────────────────────────────────────────────────
  const [localPath, setLocalPath]               = useState('');
  const [bgMusicLocalPath, setBgMusicLocalPath] = useState('');
  const [countdown, setCountdown]               = useState('10');
  const [hostUrl, setHostUrl]                   = useState('');
  const [qrEnabled, setQrEnabled]               = useState(true);
  const [saving, setSaving]                     = useState(false);
  const [skippedOpen, setSkippedOpen]           = useState(false);

  // ── Info / network ────────────────────────────────────────────────────────────
  const [info, setInfo] = useState(null);

  // ── Close behaviour (Electron only) ──────────────────────────────────────────
  const [closeBehaviour, setCloseBehaviourState] = useState('quit');

  // ── Mount ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    djFetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        setLocalPath(s.local_media_path || '');
        setBgMusicLocalPath(s.background_music_local_path || '');
        setCountdown(s.countdown_seconds || '10');
        setHostUrl(s.host_url || '');
        setQrEnabled(s.qr_enabled !== 'false');
      });

    djFetch('/api/info')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});

    djFetch('/api/settings/dj-pin/status')
      .then((r) => r.json())
      .then((d) => { setPinSet(d.set); setPinExpanded(!d.set); })
      .catch(() => {});

    if (typeof window.electronAPI !== 'undefined') {
      window.electronAPI.getCloseBehaviour().then(setCloseBehaviourState);
    }
  }, []);

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function saveGeneralSettings() {
    setSaving(true);
    try {
      await djFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local_media_path: localPath,
          background_music_local_path: bgMusicLocalPath,
          countdown_seconds: countdown,
          host_url: hostUrl,
          qr_enabled: String(qrEnabled),
        }),
      });
    } finally {
      setSaving(false);
    }
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
    setPinExpanded(!data.set);
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

      {/* ── General settings ── */}
      <div className="bg-white/5 rounded-xl p-4 space-y-4 border border-white/10">
        <p className="text-brand-dim/60 text-xs font-mono uppercase tracking-widest">General</p>

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

        <Field
          label="Background music folder"
          hint="Folder with MP3/MP4 files to shuffle between songs"
        >
          <input
            type="text"
            value={bgMusicLocalPath}
            onChange={(e) => setBgMusicLocalPath(e.target.value)}
            placeholder="C:\music\background"
            className={`w-full ${inputCls}`}
          />
        </Field>

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

        {/* QR code toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-brand-dim">QR code on display</p>
            <p className="text-xs text-brand-dim/50">
              {qrEnabled ? 'Guests scan to request songs' : 'Hidden — use paper slips instead'}
            </p>
          </div>
          <button
            onClick={() => setQrEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              qrEnabled ? 'bg-brand-purple' : 'bg-white/20'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                qrEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

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
