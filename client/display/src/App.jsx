import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../../shared/useWebSocket';
import logoUrl from './assets/logo-marquee-primary-animated.svg';
import { CDGRenderer } from './cdgRenderer';

function QrImg({ url, size = 200 }) {
  if (!url) return null;
  return (
    <img src={`/api/qr?url=${encodeURIComponent(url)}`} alt="QR" width={size} height={size} />
  );
}

function IdleScreen({ requestUrl, qrEnabled }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <div className="text-center space-y-2">
        <p className="text-brand-dim font-mono uppercase tracking-[0.35em] text-sm">
          {qrEnabled ? 'Scan to request a song' : 'Request a song from the DJ'}
        </p>
        <p className="text-brand-ink/60 text-xl">Pick a song &amp; get in the queue</p>
      </div>
      {qrEnabled && requestUrl && (
        <div className="bg-white rounded-2xl p-5 shadow-2xl shadow-brand-purple/20">
          <QrImg url={requestUrl} size={240} />
        </div>
      )}
      {qrEnabled && requestUrl && <p className="text-brand-dim font-mono text-base">{requestUrl}</p>}
    </div>
  );
}

function BetweenScreen({ countdown, queue, requestUrl, qrEnabled }) {
  const nextSong   = countdown?.next_song;
  const nextSinger = countdown?.next_singer;
  const upcoming   = (queue || []).slice(1, 5);
  const waiting    = !countdown?.active || countdown.seconds_remaining === 0;

  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-5 px-12">
      <p className="text-brand-dim font-mono text-sm uppercase tracking-[0.35em]">Up next</p>
      <h2 className="font-display font-black text-6xl text-brand-ink text-center leading-tight"
          style={{ fontStretch: '125%' }}>
        {nextSinger || '—'}
      </h2>
      <p className="text-4xl text-brand-purple text-center">{nextSong?.title || '—'}</p>

      <div className="mt-2 h-28 flex items-center justify-center">
        {!waiting ? (
          <span className="text-9xl font-mono font-bold text-brand-amber tabular-nums"
                style={{ textShadow: '0 0 40px #ffb627, 0 0 80px #ffb62760' }}>
            {countdown.seconds_remaining}
          </span>
        ) : (
          <p className="text-brand-dim font-mono text-2xl">Waiting for DJ...</p>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="mt-4 w-full max-w-lg">
          <p className="text-brand-dim/60 font-mono text-xs uppercase tracking-[0.35em] mb-3 text-center">
            Coming up
          </p>
          <ul className="space-y-2">
            {upcoming.map((item) => (
              <li key={item.id} className="flex justify-between text-brand-dim text-lg px-2">
                <span>{item.singer}</span>
                <span className="text-brand-dim/50 truncate max-w-xs text-right ml-6">
                  {item.song?.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {qrEnabled && requestUrl && (
        <div className="absolute bottom-6 right-6 bg-white rounded-xl p-2 opacity-60">
          <QrImg url={requestUrl} size={100} />
        </div>
      )}
    </div>
  );
}

function NowPlayingOverlay({ nowPlaying }) {
  if (!nowPlaying) return null;
  return (
    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-10 py-8 pointer-events-none">
      <p className="text-brand-dim font-mono text-sm uppercase tracking-[0.3em] mb-1">Now singing</p>
      <p className="font-display font-black text-5xl text-brand-ink leading-tight drop-shadow-xl"
         style={{ fontStretch: '125%' }}>
        {nowPlaying.song?.title || '—'}
      </p>
      <p className="text-brand-dim text-2xl mt-1 drop-shadow-lg">{nowPlaying.singer}</p>
    </div>
  );
}

function UpNextOverlay({ nextItem }) {
  if (!nextItem) return null;
  return (
    <div className="absolute bottom-0 right-0 bg-gradient-to-l from-black/90 via-black/50 to-transparent px-10 py-8 pointer-events-none text-right">
      <p className="text-brand-dim font-mono text-sm uppercase tracking-[0.3em] mb-1">Up next</p>
      <p className="font-display font-black text-5xl text-brand-ink leading-tight drop-shadow-xl"
         style={{ fontStretch: '125%' }}>
        {nextItem.song?.title || '—'}
      </p>
      <p className="text-brand-dim text-2xl mt-1 drop-shadow-lg">{nextItem.singer}</p>
    </div>
  );
}

function MessageOverlay({ message }) {
  const { text, position, scroll } = message;
  if (!text) return null;

  const posClass = {
    top:    'absolute top-8 inset-x-0',
    center: 'absolute inset-0 flex items-center',
    bottom: 'absolute bottom-20 inset-x-0',
  }[position] || 'absolute bottom-20 inset-x-0';

  const textContent = (
    <p className="text-3xl font-bold text-white/90 drop-shadow-xl px-8 text-center">
      {text}
    </p>
  );

  if (scroll) {
    const duration = Math.max(8, text.length * 0.15);
    return (
      <div className={`${posClass} overflow-hidden pointer-events-none z-30`}>
        <div
          className="whitespace-nowrap"
          style={{
            animation: `marquee ${duration}s linear infinite`,
          }}
        >
          <p className="text-3xl font-bold text-white/90 drop-shadow-xl px-8 inline">
            {text}&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{text}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${posClass} pointer-events-none z-30`}>
      {textContent}
    </div>
  );
}

function PlaybackErrorOverlay({ message }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-brand-bg z-10">
      <p className="text-brand-pink text-3xl font-bold">Playback error</p>
      <p className="text-brand-dim mt-3 text-xl">{message}</p>
      <p className="text-brand-dim/50 mt-6 text-lg">Skipping to next song...</p>
    </div>
  );
}

export default function App() {
  const { state, connected } = useWebSocket();

  // ── Local file player ────────────────────────────────────────────────────
  const localVideoRef   = useRef(null);
  const localAudioRef   = useRef(null);
  const localCanvasRef  = useRef(null);
  const cdgRendererRef  = useRef(null);
  const cdgAnimRef      = useRef(null);
  const loadedLocalId   = useRef(null);
  const [localError, setLocalError] = useState(null);

  // ── Background music player (local) ──────────────────────────────────────
  const localBgAudioRef   = useRef(null);
  const localBgTracksRef  = useRef([]);
  const localBgIdxRef     = useRef(0);
  const localBgLoadedRef  = useRef('');

  // Always-current refs (safe for stale closures)
  const modeRef = useRef('idle');
  const bgmRef  = useRef(null);

  const lastCmdTs = useRef(0);

  const [info, setInfo] = useState(null);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    fetch('/api/info').then((r) => r.json()).then(setInfo).catch(() => {});
  }, []);

  // ── Audio interaction gate ────────────────────────────────────────────────
  useEffect(() => {
    if (audioUnlocked) return;
    const unlock = () => {
      setAudioUnlocked(true);
      try { new AudioContext().resume(); } catch {}
    };
    document.addEventListener('click',   unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    document.addEventListener('touchend',unlock, { once: true });
    return () => {
      document.removeEventListener('click',   unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('touchend',unlock);
    };
  }, [audioUnlocked]);

  useEffect(() => {
    function toggleFullscreen() {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    }
    function onKey(e) {
      if (e.key === 'F11') { e.preventDefault(); toggleFullscreen(); }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const mode       = state?.mode || 'idle';
  const bgm        = state?.background_music;
  const nowPlaying = state?.now_playing;
  const nowSong    = nowPlaying?.song;
  const localType  = nowSong?.file_type;
  const isLocalVideo = localType === 'mkv' || localType === 'mp4';
  const isLocalCdg   = localType === 'cdg' || localType === 'mp3cdg_zip';

  modeRef.current = mode;
  bgmRef.current  = bgm;

  // ── Local player: load when song changes ─────────────────────────────────

  useEffect(() => {
    if (!nowSong || mode !== 'playing') {
      cancelAnimationFrame(cdgAnimRef.current);
      if (mode !== 'playing') {
        loadedLocalId.current = null;
        if (localVideoRef.current) localVideoRef.current.pause();
        if (localAudioRef.current) localAudioRef.current.pause();
      }
      return;
    }
    if (loadedLocalId.current === nowSong.id) return;

    loadedLocalId.current = nowSong.id;
    setLocalError(null);
    cancelAnimationFrame(cdgAnimRef.current);

    let errorFired = false;
    function onLocalEnded() {
      fetch('/api/playback/ended', { method: 'POST' }).catch(() => {});
    }
    function onLocalError(msg) {
      if (errorFired) return;
      errorFired = true;
      setLocalError(msg);
      setTimeout(onLocalEnded, 2500);
    }

    if (isLocalVideo && localVideoRef.current) {
      const vid = localVideoRef.current;
      vid.muted = true;
      vid.onerror = () => {
        const e = vid.error;
        onLocalError(e ? `Video error (${e.code}): ${e.message}` : 'Video codec not supported');
      };
      vid.src = `/api/media/file/${nowSong.id}`;
      vid.play()
        .then(() => { vid.muted = false; })
        .catch((err) => {
          setTimeout(() => onLocalError(`Video: ${err.message || err.name}`), 80);
        });
    }

    if (isLocalCdg) {
      if (!cdgRendererRef.current) cdgRendererRef.current = new CDGRenderer();
      const songId = nowSong.id;

      const audio = localAudioRef.current;
      if (audio) {
        audio.muted = true;
        audio.onerror = () => onLocalError('Audio file error');
        audio.src = `/api/media/file/${songId}`;
        audio.play()
          .then(() => { audio.muted = false; })
          .catch((err) => {
            if (err.name === 'AbortError') return;
            if (err.name === 'NotAllowedError') {
              const retry = () => {
                if (loadedLocalId.current !== songId) return;
                audio.play()
                  .then(() => { audio.muted = false; })
                  .catch(() => onLocalError('Audio: autoplay blocked. Tap the screen to enable audio.'));
              };
              document.addEventListener('click',   retry, { once: true });
              document.addEventListener('touchend', retry, { once: true });
              return;
            }
            setTimeout(() => onLocalError(`Audio: ${err.message || err.name}`), 80);
          });
      }

      fetch(`/api/media/cdg/${songId}`)
        .then((r) => {
          if (!r.ok) throw new Error(`CDG fetch failed (${r.status})`);
          return r.arrayBuffer();
        })
        .then((buf) => {
          if (loadedLocalId.current !== songId) return;
          cdgRendererRef.current.load(buf);

          const loop = () => {
            if (localAudioRef.current && localCanvasRef.current && cdgRendererRef.current) {
              cdgRendererRef.current.renderToCanvas(localCanvasRef.current, localAudioRef.current.currentTime);
            }
            cdgAnimRef.current = requestAnimationFrame(loop);
          };
          cdgAnimRef.current = requestAnimationFrame(loop);
        })
        .catch((err) => {
          console.error('[CDG] fetch/load error:', err.message);
          if (loadedLocalId.current === songId) onLocalError(err.message);
        });
    }

    return () => cancelAnimationFrame(cdgAnimRef.current);
  }, [nowSong?.id, mode]);

  // ── Player command routing ────────────────────────────────────────────────

  useEffect(() => {
    const cmd = state?.player_command;
    if (!cmd || cmd.timestamp <= lastCmdTs.current) return;
    lastCmdTs.current = cmd.timestamp;

    const el = isLocalVideo ? localVideoRef.current : localAudioRef.current;
    if (!el) return;
    if (cmd.action === 'play')  el.play().catch(() => {});
    if (cmd.action === 'pause') el.pause();
    if (cmd.action === 'stop')  { el.pause(); el.currentTime = 0; }
  }, [state?.player_command]);

  // ── Local background music ────────────────────────────────────────────────

  function applyLocalBgMusic() {
    const bm = bgmRef.current;
    const currentMode = modeRef.current;
    const audio = localBgAudioRef.current;
    if (!audio) return;
    const tracks = localBgTracksRef.current;
    const shouldPlay = bm?.playing && tracks.length > 0 && (currentMode === 'idle' || currentMode === 'between');
    audio.volume = Math.max(0, Math.min(1, bm?.volume ?? 0.4));
    if (shouldPlay) {
      if (!audio.src || audio.ended) {
        const idx = localBgIdxRef.current % tracks.length;
        audio.src = `/api/bgmusic/file/${tracks[idx].idx}`;
      }
      if (audio.paused) audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }

  function handleLocalBgEnded() {
    const tracks = localBgTracksRef.current;
    if (!tracks.length) return;
    localBgIdxRef.current = (localBgIdxRef.current + 1) % tracks.length;
    if (localBgAudioRef.current) {
      localBgAudioRef.current.src = `/api/bgmusic/file/${tracks[localBgIdxRef.current].idx}`;
      localBgAudioRef.current.play().catch(() => {});
    }
  }

  useEffect(() => {
    const localPath = bgm?.local_path || '';
    if (localBgLoadedRef.current === localPath) {
      applyLocalBgMusic();
      return;
    }
    localBgLoadedRef.current = localPath;
    fetch('/api/bgmusic/tracks')
      .then((r) => r.json())
      .then((tracks) => {
        localBgTracksRef.current = tracks;
        localBgIdxRef.current = 0;
        applyLocalBgMusic();
      })
      .catch(() => {});
  }, [bgm?.local_path]);

  useEffect(() => { applyLocalBgMusic(); }, [mode, bgm?.playing, bgm?.volume]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const requestUrl  = info?.urls?.request;
  const qrEnabled   = state?.settings?.qr_enabled !== false;
  const isPlaying   = mode === 'playing';
  const hasError    = isPlaying && localError != null;
  const pos         = state?.playback_position;
  const elapsed     = pos?.elapsed_seconds || 0;
  const duration    = pos?.duration_seconds || 0;
  const nextQueue   = state?.queue || [];
  const showUpNext  = isPlaying && !hasError && nextQueue.length > 0
                      && duration > 60 && (duration - elapsed) <= 60 && elapsed > 0;
  const displayMsg  = state?.display_message;
  const showMessage = displayMsg?.active && displayMsg?.text && !isPlaying;

  return (
    <div
      className="w-screen h-screen bg-brand-bg relative overflow-hidden"
      onDoubleClick={() => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen().catch(() => {});
      }}
    >

      {/* Subtle grid texture */}
      <div className="absolute inset-0 pointer-events-none opacity-30"
           style={{
             backgroundImage:
               'linear-gradient(rgba(168,85,247,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(168,85,247,0.06) 1px,transparent 1px)',
             backgroundSize: '48px 48px',
           }} />

      {/* Local background music (hidden audio) */}
      <audio ref={localBgAudioRef} onEnded={handleLocalBgEnded} style={{ display: 'none' }} />

      {/* Local video player — mkv/mp4 */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${
        isPlaying && isLocalVideo && !localError ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <video
          ref={localVideoRef}
          className="w-full h-full object-contain bg-black"
          onEnded={() => fetch('/api/playback/ended', { method: 'POST' }).catch(() => {})}
          playsInline
        />
      </div>

      {/* CDG karaoke player — mp3+cdg */}
      <div className={`absolute inset-0 bg-black flex items-center justify-center transition-opacity duration-300 ${
        isPlaying && isLocalCdg && !localError ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <audio
          ref={localAudioRef}
          onEnded={() => fetch('/api/playback/ended', { method: 'POST' }).catch(() => {})}
        />
        <canvas
          ref={localCanvasRef}
          width={288}
          height={192}
          style={{ imageRendering: 'pixelated', height: '100%', width: 'auto' }}
        />
      </div>

      {/* Error overlay */}
      {hasError && <PlaybackErrorOverlay message={localError} />}

      {/* Idle / between screens */}
      {mode === 'idle' && <IdleScreen requestUrl={requestUrl} qrEnabled={qrEnabled} />}
      {mode === 'between' && (
        <BetweenScreen
          countdown={state?.countdown}
          queue={state?.queue}
          requestUrl={requestUrl}
          qrEnabled={qrEnabled}
        />
      )}

      {/* Now singing / Up next — crossfade at 1 min remaining */}
      {isPlaying && !hasError && (
        <>
          <div className={`transition-opacity duration-700 ${showUpNext ? 'opacity-0' : 'opacity-100'}`}>
            <NowPlayingOverlay nowPlaying={nowPlaying} />
          </div>
          <div className={`transition-opacity duration-700 ${showUpNext ? 'opacity-100' : 'opacity-0'}`}>
            <UpNextOverlay nextItem={nextQueue[0]} />
          </div>
        </>
      )}

      {/* Logo — top-left, dims while playing */}
      <div className={`absolute top-5 left-6 z-20 pointer-events-none transition-opacity duration-700 ${
        isPlaying ? 'opacity-25' : 'opacity-90'
      }`}>
        <img src={logoUrl} alt="Kantahan" style={{ width: 220, height: 'auto' }} />
      </div>

      {/* Corner QR */}
      {qrEnabled && isPlaying && !hasError && requestUrl && (
        <div className="absolute top-4 right-4 bg-white rounded-lg p-1.5 opacity-50 hover:opacity-90 transition-opacity z-20">
          <QrImg url={requestUrl} size={84} />
        </div>
      )}
      {qrEnabled && !isPlaying && requestUrl && (
        <div className="absolute bottom-6 right-6 bg-white rounded-xl p-2 opacity-75 z-20">
          <QrImg url={requestUrl} size={100} />
        </div>
      )}

      {/* Configurable message overlay */}
      {showMessage && <MessageOverlay message={displayMsg} />}

      {/* Connection status */}
      <div className="absolute bottom-3 left-4 flex items-center gap-1.5 z-50 opacity-20 hover:opacity-70 transition-opacity">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
        <span className="text-xs font-mono text-brand-dim">{mode}</span>
      </div>
    </div>
  );
}
