import { useState, useEffect } from 'react';

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <label className="text-sm font-medium text-gray-300">{label}</label>
      {hint && <p className="text-xs text-gray-500">{hint}</p>}
      {children}
    </div>
  );
}

export default function Settings({ indexing }) {
  const [apiKey, setApiKey] = useState('');
  const [apiKeySet, setApiKeySet] = useState(false);
  const [apiKeyMsg, setApiKeyMsg] = useState('');

  const [localPath, setLocalPath] = useState('');
  const [bgMusicUrl, setBgMusicUrl] = useState('');
  const [countdown, setCountdown] = useState('10');
  const [info, setInfo] = useState(null);
  const [saving, setSaving] = useState(false);

  const [channels, setChannels] = useState([]);
  const [channelUrl, setChannelUrl] = useState('');
  const [addingChannel, setAddingChannel] = useState(false);
  const [channelError, setChannelError] = useState('');

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  useEffect(() => {
    fetch('/api/settings/youtube-api-key/status')
      .then((r) => r.json())
      .then((d) => setApiKeySet(d.set));

    fetch('/api/settings')
      .then((r) => r.json())
      .then((s) => {
        setLocalPath(s.local_media_path || '');
        setBgMusicUrl(s.background_music_url || '');
        setCountdown(s.countdown_seconds || '10');
      });

    fetch('/api/info')
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});

    loadChannels();
  }, []);

  function loadChannels() {
    fetch('/api/channels')
      .then((r) => r.json())
      .then(setChannels)
      .catch(() => {});
  }

  async function saveApiKey() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/youtube-api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKey }),
      });
      const data = await res.json();
      setApiKeySet(data.set);
      setApiKey('');
      setApiKeyMsg(data.set ? 'API key saved.' : 'Key cleared.');
      setTimeout(() => setApiKeyMsg(''), 3000);
    } finally {
      setSaving(false);
    }
  }

  async function saveGeneralSettings() {
    setSaving(true);
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          local_media_path: localPath,
          background_music_url: bgMusicUrl,
          countdown_seconds: countdown,
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
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: channelUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setChannelError(data.error || 'Failed to add channel');
      } else {
        setChannelUrl('');
        loadChannels();
      }
    } finally {
      setAddingChannel(false);
    }
  }

  async function reindexChannel(id) {
    await fetch(`/api/channels/${id}/reindex`, { method: 'POST' });
  }

  async function deleteChannel(id) {
    await fetch(`/api/channels/${id}`, { method: 'DELETE' });
    setChannels((prev) => prev.filter((c) => c.id !== id));
  }

  async function scanLocal() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch('/api/media/scan', { method: 'POST' });
      const data = await res.json();
      setScanResult(res.ok ? data.count : `Error: ${data.error}`);
    } finally {
      setScanning(false);
    }
  }

  const isIndexing = indexing?.active;

  return (
    <div className="space-y-6">
      {/* Network info */}
      {info && (
        <div className="bg-gray-800 rounded-xl p-4 space-y-1 text-sm">
          <p className="text-gray-400 text-xs uppercase tracking-widest mb-2">Network</p>
          <p>
            <span className="text-gray-400">Display: </span>
            <span className="text-purple-300 font-mono">{info.urls.display}</span>
          </p>
          <p>
            <span className="text-gray-400">DJ: </span>
            <span className="text-purple-300 font-mono">{info.urls.dj}</span>
          </p>
          <p>
            <span className="text-gray-400">Request: </span>
            <span className="text-purple-300 font-mono">{info.urls.request}</span>
          </p>
        </div>
      )}

      {/* YouTube API key */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-4">
        <p className="text-gray-400 text-xs uppercase tracking-widest">YouTube</p>
        <Field
          label="API Key"
          hint={
            apiKeySet
              ? 'A key is currently saved. Enter a new one to replace it, or leave blank to clear.'
              : 'Required for YouTube channel indexing and search.'
          }
        >
          <div className="flex gap-2 mt-1">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={apiKeySet ? '••••••••••••' : 'AIza...'}
              className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <button
              onClick={saveApiKey}
              disabled={saving}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              Save
            </button>
          </div>
          {apiKeyMsg && <p className="text-green-400 text-xs mt-1">{apiKeyMsg}</p>}
          <div className="flex items-center gap-2 mt-2">
            <span
              className={`w-2 h-2 rounded-full ${apiKeySet ? 'bg-green-400' : 'bg-gray-600'}`}
            />
            <span className="text-xs text-gray-400">
              {apiKeySet ? 'Key is configured' : 'No key set'}
            </span>
          </div>
        </Field>
      </div>

      {/* YouTube channels */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-4">
        <p className="text-gray-400 text-xs uppercase tracking-widest">YouTube Channels</p>

        {/* Indexing progress */}
        {isIndexing && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-400">
              <span>Indexing {indexing.channel_name}...</span>
              <span>{indexing.processed} videos</span>
            </div>
            <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 animate-pulse w-full" />
            </div>
          </div>
        )}
        {!isIndexing && indexing?.error && (
          <p className="text-red-400 text-xs">Error: {indexing.error}</p>
        )}
        {!isIndexing && indexing?.processed > 0 && !indexing?.error && (
          <p className="text-green-400 text-xs">
            Indexed {indexing.processed} videos from {indexing.channel_name}
          </p>
        )}

        {/* Channel list */}
        {channels.length > 0 && (
          <ul className="space-y-2">
            {channels.map((ch) => (
              <li
                key={ch.id}
                className="flex items-center justify-between gap-3 bg-gray-700 rounded-lg px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm truncate">{ch.name}</p>
                  {ch.video_count > 0 && (
                    <p className="text-gray-400 text-xs">{ch.video_count} videos</p>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => reindexChannel(ch.id)}
                    disabled={isIndexing}
                    className="text-xs bg-blue-800 hover:bg-blue-700 disabled:opacity-40 text-white px-2 py-1 rounded"
                    title="Re-index"
                  >
                    ↻
                  </button>
                  <button
                    onClick={() => deleteChannel(ch.id)}
                    disabled={isIndexing}
                    className="text-xs bg-red-800 hover:bg-red-700 disabled:opacity-40 text-white px-2 py-1 rounded"
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {channels.length === 0 && !isIndexing && (
          <p className="text-gray-500 text-xs">No channels added yet</p>
        )}

        {/* Add channel */}
        <Field label="Add channel" hint="YouTube channel URL or handle (e.g. @channelname)">
          <div className="flex gap-2 mt-1">
            <input
              type="text"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addChannel()}
              placeholder="https://youtube.com/@..."
              disabled={isIndexing}
              className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-40"
            />
            <button
              onClick={addChannel}
              disabled={addingChannel || isIndexing || !channelUrl.trim()}
              className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
            >
              {addingChannel ? '...' : 'Add'}
            </button>
          </div>
          {channelError && <p className="text-red-400 text-xs mt-1">{channelError}</p>}
        </Field>
      </div>

      {/* General settings */}
      <div className="bg-gray-800 rounded-xl p-4 space-y-4">
        <p className="text-gray-400 text-xs uppercase tracking-widest">General</p>
        <Field
          label="Background music URL"
          hint="YouTube video or playlist to play between songs (idle/between modes)"
        >
          <input
            type="text"
            value={bgMusicUrl}
            onChange={(e) => setBgMusicUrl(e.target.value)}
            placeholder="https://youtube.com/playlist?list=..."
            className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>
        <Field label="Countdown duration (seconds)">
          <input
            type="number"
            min="3"
            max="60"
            value={countdown}
            onChange={(e) => setCountdown(e.target.value)}
            className="w-24 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>
        <Field
          label="Local media folder"
          hint="Path to folder containing .mp3/.cdg pairs or .mkv/.mp4 files"
        >
          <input
            type="text"
            value={localPath}
            onChange={(e) => setLocalPath(e.target.value)}
            placeholder="C:\karaoke\files"
            className="w-full bg-gray-700 text-white text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
        </Field>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={saveGeneralSettings}
            disabled={saving}
            className="bg-gray-600 hover:bg-gray-500 disabled:opacity-50 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Save settings
          </button>
          <button
            onClick={scanLocal}
            disabled={scanning || !localPath.trim()}
            className="bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            {scanning ? 'Scanning...' : 'Scan local files'}
          </button>
          {scanResult !== null && (
            <span className="text-xs text-green-400">
              {typeof scanResult === 'number' ? `Found ${scanResult} files` : scanResult}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
