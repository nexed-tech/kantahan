import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../../shared/useWebSocket';
import logoUrl from './assets/logo-marquee-primary-animated.svg';
import { CDGRenderer } from './cdgRenderer';

function loadYouTubeAPI() {
  return new Promise((resolve) => {
    if (window.YT?.Player) { resolve(); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });
}

function parseBgUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    const list = u.searchParams.get('list');
    const v = u.searchParams.get('v') || (u.hostname === 'youtu.be' ? u.pathname.slice(1) : null);
    if (list) return { list };
    if (v) return { video: v };
  } catch {}
  return null;
}

function QrImg({ url, size = 200 }) {
  if (!url) return null;
  return (
    <img src={`/api/qr?url=${encodeURIComponent(url)}`} alt="QR" width={size} height={size} />
  );
}

function IdleScreen({ requestUrl }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <div className="text-center space-y-2">
        <p className="text-brand-dim font-mono uppercase tracking-[0.35em] text-sm">
          Scan to request a song
        </p>
        <p className="text-brand-ink/60 text-xl">Pick a song &amp; get in the queue</p>
      </div>
      {requestUrl && (
        <div className="bg-white rounded-2xl p-5 shadow-2xl shadow-brand-purple/20">
          <QrImg url={requestUrl} size={240} />
        </div>
      )}
      {requestUrl && <p className="text-brand-dim font-mono text-base">{requestUrl}</p>}
    </div>
  );
}

function BetweenScreen({ countdown, queue, requestUrl }) {
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

      {requestUrl && (
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

  // ── YouTube karaoke player ───────────────────────────────────────────────
  const ytDivRef        = useRef(null);
  const playerRef       = useRef(null);
  const playerReadyRef  = useRef(false);
  const pendingCmdRef   = useRef(null);
  const lastCmdTs       = useRef(0);
  const [ytError, setYtError] = useState(null);

  // ── Local file player ────────────────────────────────────────────────────
  const localVideoRef   = useRef(null);  // <video> for mkv/mp4
  const localAudioRef   = useRef(null);  // <audio> for cdg
  const localCanvasRef  = useRef(null);  // <canvas> for cdg graphics
  const cdgRendererRef  = useRef(null);
  const cdgAnimRef      = useRef(null);
  const loadedLocalId   = useRef(null);
  const [localError, setLocalError]  = useState(null);

  // ── Background music player (YouTube) ────────────────────────────────────
  const bgDivRef        = useRef(null);
  const bgPlayerRef     = useRef(null);
  const bgPlayerReadyRef = useRef(false);
  const lastBgUrlRef    = useRef('');

  // ── Background music player (local) ──────────────────────────────────────
  const localBgAudioRef   = useRef(null);
  const localBgTracksRef  = useRef([]);
  const localBgIdxRef     = useRef(0);
  const localBgLoadedRef  = useRef('');

  // Always-current refs (safe for stale closures)
  const modeRef = useRef('idle');
  const bgmRef  = useRef(null);

  const [info, setInfo] = useState(null);

  useEffect(() => {
    fetch('/api/info').then((r) => r.json()).then(setInfo).catch(() => {});
  }, []);

  const mode          = state?.mode || 'idle';
  const bgm           = state?.background_music;
  const nowPlaying    = state?.now_playing;
  const nowSong       = nowPlaying?.song;
  const isLocalSong   = nowSong?.source === 'local';
  const localType     = nowSong?.file_type;
  const isLocalVideo  = localType === 'mkv' || localType === 'mp4';
  const isLocalCdg    = localType === 'cdg' || localType === 'mp3cdg_zip';

  modeRef.current = mode;
  bgmRef.current  = bgm;

  // ── YouTube player setup ──────────────────────────────────────────────────

  function execYtCmd(cmd) {
    if (!playerRef.current || !playerReadyRef.current) {
      pendingCmdRef.current = cmd;
      return;
    }
    setYtError(null);
    const p = playerRef.current;
    if (cmd.action === 'load')  p.loadVideoById(cmd.video_id);
    else if (cmd.action === 'play')  p.playVideo();
    else if (cmd.action === 'pause') p.pauseVideo();
    else if (cmd.action === 'stop')  p.stopVideo();
  }

  useEffect(() => {
    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled || !ytDivRef.current || playerRef.current) return;
      playerRef.current = new window.YT.Player(ytDivRef.current, {
        height: '100%', width: '100%', videoId: '',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, fs: 0,
                      iv_load_policy: 3, modestbranding: 1, rel: 0, playsinline: 1 },
        events: {
          onReady: () => {
            playerReadyRef.current = true;
            if (pendingCmdRef.current) {
              const cmd = pendingCmdRef.current;
              pendingCmdRef.current = null;
              execYtCmd(cmd);
            }
          },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED)
              fetch('/api/playback/ended', { method: 'POST' }).catch(() => {});
          },
          onError: (e) => {
            setYtError(e.data);
            setTimeout(() => fetch('/api/playback/ended', { method: 'POST' }).catch(() => {}), 2500);
          },
        },
      });
    });
    return () => {
      cancelled = true;
      playerReadyRef.current = false;
      if (playerRef.current) {
        try { playerRef.current.destroy(); } catch {}
        playerRef.current = null;
      }
    };
  }, []);

  // ── Local player: load when song changes ─────────────────────────────────

  useEffect(() => {
    if (!nowSong || nowSong.source !== 'local' || mode !== 'playing') {
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

    // Guard: only the first error wins (play() rejection + onerror can both fire)
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
      // Set onerror before src so we catch early load errors
      vid.onerror = () => {
        const e = vid.error;
        onLocalError(e ? `Video error (${e.code}): ${e.message}` : 'Video codec not supported');
      };
      vid.src = `/api/media/file/${nowSong.id}`;
      vid.play()
        .then(() => { vid.muted = false; })
        .catch((err) => {
          // Delay so onerror (DOM event) can fire and win if it's a media error
          setTimeout(() => onLocalError(`Video: ${err.message || err.name}`), 80);
        });
    }

    if (isLocalCdg) {
      if (!cdgRendererRef.current) cdgRendererRef.current = new CDGRenderer();
      const songId = nowSong.id;

      // Start audio immediately — parallel with CDG fetch
      const audio = localAudioRef.current;
      if (audio) {
        audio.muted = true;
        audio.onerror = () => onLocalError('Audio file error');
        audio.src = `/api/media/file/${songId}`;
        audio.play()
          .then(() => { audio.muted = false; })
          .catch((err) => {
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
              cdgRendererRef.current.renderToCanvas(
                localCanvasRef.current,
                localAudioRef.current.currentTime
              );
            }
            cdgAnimRef.current = requestAnimationFrame(loop);
          };
          cdgAnimRef.current = requestAnimationFrame(loop);
        })
        .catch((err) => {
          if (loadedLocalId.current === songId) onLocalError(err.message);
        });
    }

    return () => cancelAnimationFrame(cdgAnimRef.current);
  }, [nowSong?.id, nowSong?.source, mode]);

  // ── Player command routing ────────────────────────────────────────────────

  useEffect(() => {
    const cmd = state?.player_command;
    if (!cmd || cmd.timestamp <= lastCmdTs.current) return;
    lastCmdTs.current = cmd.timestamp;

    if (nowSong?.source === 'local') {
      // 'load' is handled by the useEffect above (triggers on nowSong.id change)
      const el = isLocalVideo ? localVideoRef.current : localAudioRef.current;
      if (!el) return;
      if (cmd.action === 'play')  el.play().catch(() => {});
      if (cmd.action === 'pause') el.pause();
      if (cmd.action === 'stop')  { el.pause(); el.currentTime = 0; }
    } else {
      execYtCmd(cmd);
    }
  }, [state?.player_command]);

  // ── Background music player ───────────────────────────────────────────────

  function applyBgMusic() {
    const bm = bgmRef.current;
    const currentMode = modeRef.current;
    if (!bgPlayerReadyRef.current || !bm) return;
    bgPlayerRef.current.setVolume(Math.round((bm.volume ?? 0.4) * 100));
    const shouldPlay = bm.playing && !!bm.url && (currentMode === 'idle' || currentMode === 'between');
    if (shouldPlay) {
      if (bm.url !== lastBgUrlRef.current) {
        lastBgUrlRef.current = bm.url;
        const parsed = parseBgUrl(bm.url);
        if (parsed?.list) bgPlayerRef.current.loadPlaylist({ list: parsed.list, listType: 'playlist', index: 0 });
        else if (parsed?.video) bgPlayerRef.current.loadVideoById(parsed.video);
      } else {
        if (bgPlayerRef.current.getPlayerState() !== 1) bgPlayerRef.current.playVideo();
      }
    } else {
      bgPlayerRef.current.pauseVideo();
    }
  }

  useEffect(() => {
    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled || !bgDivRef.current || bgPlayerRef.current) return;
      bgPlayerRef.current = new window.YT.Player(bgDivRef.current, {
        height: '100%', width: '100%', videoId: '',
        playerVars: { controls: 0, disablekb: 1, fs: 0, playsinline: 1 },
        events: {
          onReady: (e) => { bgPlayerReadyRef.current = true; e.target.setLoop(true); applyBgMusic(); },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              bgPlayerRef.current?.seekTo(0, true);
              bgPlayerRef.current?.playVideo();
            }
          },
        },
      });
    });
    return () => {
      cancelled = true;
      bgPlayerReadyRef.current = false;
      if (bgPlayerRef.current) {
        try { bgPlayerRef.current.destroy(); } catch {}
        bgPlayerRef.current = null;
      }
    };
  }, []);

  useEffect(() => { applyBgMusic(); }, [mode, bgm?.playing, bgm?.url, bgm?.volume]);

  // ── Local background music ────────────────────────────────────────────────

  function applyLocalBgMusic() {
    const bm = bgmRef.current;
    const currentMode = modeRef.current;
    const audio = localBgAudioRef.current;
    if (!audio || bm?.source !== 'local') return;
    const tracks = localBgTracksRef.current;
    const shouldPlay = bm.playing && tracks.length > 0 && (currentMode === 'idle' || currentMode === 'between');
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
    if (bgm?.source !== 'local') return;
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
  }, [bgm?.source, bgm?.local_path]);

  useEffect(() => {
    if (bgm?.source === 'local') applyLocalBgMusic();
    else if (localBgAudioRef.current) localBgAudioRef.current.pause();
  }, [mode, bgm?.playing, bgm?.volume, bgm?.source]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const requestUrl    = info?.urls?.request;
  const isPlaying     = mode === 'playing';
  const hasError      = isPlaying && (ytError != null || localError != null);
  const pos           = state?.playback_position;
  const elapsed       = pos?.elapsed_seconds || 0;
  const duration      = pos?.duration_seconds || 0;
  const nextQueue     = state?.queue || [];
  const showUpNext    = isPlaying && !hasError && nextQueue.length > 0
                        && duration > 60 && (duration - elapsed) <= 60 && elapsed > 0;
  const displayMsg    = state?.display_message;
  const showMessage   = displayMsg?.active && displayMsg?.text && !isPlaying;
  const errorMsg   = localError || (ytError === 101 || ytError === 150
    ? 'Embedding disabled for this video'
    : ytError != null ? 'Video not found or playback error' : null);

  return (
    <div className="w-screen h-screen bg-brand-bg relative overflow-hidden">

      {/* Subtle grid texture */}
      <div className="absolute inset-0 pointer-events-none opacity-30"
           style={{
             backgroundImage:
               'linear-gradient(rgba(168,85,247,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(168,85,247,0.06) 1px,transparent 1px)',
             backgroundSize: '48px 48px',
           }} />

      {/* Local background music (hidden audio) */}
      <audio ref={localBgAudioRef} onEnded={handleLocalBgEnded} style={{ display: 'none' }} />

      {/* Background video (idle/between) — YouTube only */}
      <div className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
        bgm?.source !== 'local' && bgm?.playing && bgm?.url && !isPlaying ? 'opacity-100' : 'opacity-0'
      }`}>
        <div ref={bgDivRef} className="w-full h-full" />
      </div>
      <div className={`absolute inset-0 bg-black pointer-events-none transition-opacity duration-1000 ${
        bgm?.source !== 'local' && bgm?.playing && bgm?.url && !isPlaying ? 'opacity-75' : 'opacity-0'
      }`} />

      {/* YouTube karaoke player — only for YouTube songs */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${
        isPlaying && !isLocalSong && !ytError ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}>
        <div ref={ytDivRef} className="w-full h-full" />
      </div>

      {/* Local video player — mkv/mp4 */}
      <div className={`absolute inset-0 transition-opacity duration-300 ${
        isPlaying && isLocalSong && isLocalVideo && !localError ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
        isPlaying && isLocalSong && isLocalCdg && !localError ? 'opacity-100' : 'opacity-0 pointer-events-none'
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
      {hasError && <PlaybackErrorOverlay message={errorMsg} />}

      {/* Idle / between screens */}
      {mode === 'idle' && <IdleScreen requestUrl={requestUrl} />}
      {mode === 'between' && (
        <BetweenScreen countdown={state?.countdown} queue={state?.queue} requestUrl={requestUrl} />
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

      {/* Corner QR — playing: top-right, idle/between: bottom-right */}
      {isPlaying && !hasError && requestUrl && (
        <div className="absolute top-4 right-4 bg-white rounded-lg p-1.5 opacity-50 hover:opacity-90 transition-opacity z-20">
          <QrImg url={requestUrl} size={84} />
        </div>
      )}
      {!isPlaying && requestUrl && (
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
