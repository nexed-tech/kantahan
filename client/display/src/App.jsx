import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from '../../shared/useWebSocket';

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
    <img
      src={`/api/qr?url=${encodeURIComponent(url)}`}
      alt="QR"
      width={size}
      height={size}
    />
  );
}

function IdleScreen({ requestUrl }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-8">
      <h1 className="text-8xl font-bold tracking-tight text-white select-none">Kantahan</h1>
      <p className="text-2xl text-gray-400">Scan to request a song</p>
      {requestUrl && (
        <div className="bg-white rounded-2xl p-4 shadow-2xl">
          <QrImg url={requestUrl} size={220} />
        </div>
      )}
      {requestUrl && (
        <p className="text-gray-600 font-mono text-base">{requestUrl}</p>
      )}
    </div>
  );
}

function BetweenScreen({ countdown, queue, requestUrl }) {
  const nextSong = countdown?.next_song;
  const nextSinger = countdown?.next_singer;
  const upcoming = (queue || []).slice(1, 5);
  const waiting = !countdown?.active || countdown.seconds_remaining === 0;

  return (
    <div className="relative flex flex-col items-center justify-center h-full gap-5 px-12">
      <p className="text-gray-500 text-xl uppercase tracking-widest">Up next</p>
      <h2 className="text-6xl font-bold text-white text-center leading-tight">
        {nextSinger || '—'}
      </h2>
      <p className="text-4xl text-purple-300 text-center">{nextSong?.title || '—'}</p>

      <div className="mt-2 h-24 flex items-center justify-center">
        {!waiting ? (
          <span className="text-9xl font-mono font-bold text-yellow-400 tabular-nums">
            {countdown.seconds_remaining}
          </span>
        ) : (
          <p className="text-gray-500 text-2xl">Waiting for DJ...</p>
        )}
      </div>

      {upcoming.length > 0 && (
        <div className="mt-4 w-full max-w-lg">
          <p className="text-gray-600 text-sm uppercase tracking-widest mb-3 text-center">
            Coming up
          </p>
          <ul className="space-y-2">
            {upcoming.map((item) => (
              <li key={item.id} className="flex justify-between text-gray-400 text-lg px-2">
                <span>{item.singer}</span>
                <span className="text-gray-600 truncate max-w-xs text-right ml-6">
                  {item.song?.title}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {requestUrl && (
        <div className="absolute bottom-6 right-6 bg-white rounded-xl p-2 opacity-70">
          <QrImg url={requestUrl} size={100} />
        </div>
      )}
    </div>
  );
}

function NowPlayingOverlay({ nowPlaying }) {
  if (!nowPlaying) return null;
  return (
    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black via-black/60 to-transparent px-10 py-8 pointer-events-none">
      <p className="text-white text-5xl font-bold leading-tight drop-shadow-xl">
        {nowPlaying.song?.title || '—'}
      </p>
      <p className="text-gray-300 text-3xl mt-2 drop-shadow-lg">{nowPlaying.singer}</p>
    </div>
  );
}

function EmbedErrorOverlay({ code }) {
  const msg =
    code === 101 || code === 150
      ? 'Embedding disabled for this video'
      : 'Video not found or playback error';
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950">
      <p className="text-red-400 text-3xl font-bold">Video unavailable</p>
      <p className="text-gray-400 mt-3 text-xl">{msg}</p>
      <p className="text-gray-600 mt-6 text-lg">Skipping to next song...</p>
    </div>
  );
}

export default function App() {
  const { state, connected } = useWebSocket();

  // Karaoke player
  const ytDivRef = useRef(null);
  const playerRef = useRef(null);
  const playerReadyRef = useRef(false);
  const pendingCmdRef = useRef(null);
  const lastCmdTs = useRef(0);
  const [playerError, setPlayerError] = useState(null);

  // Background music player
  const bgDivRef = useRef(null);
  const bgPlayerRef = useRef(null);
  const bgPlayerReadyRef = useRef(false);
  const lastBgUrlRef = useRef('');

  // Always-current refs so stale closures (onReady callbacks) can read latest state
  const modeRef = useRef('idle');
  const bgmRef = useRef(null);

  const [info, setInfo] = useState(null);

  useEffect(() => {
    fetch('/api/info').then((r) => r.json()).then(setInfo).catch(() => {});
  }, []);

  const mode = state?.mode || 'idle';
  const bgm = state?.background_music;

  // Keep always-current refs up to date
  modeRef.current = mode;
  bgmRef.current = bgm;

  // ── Karaoke player ───────────────────────────────────────────────────────

  function execCmd(cmd) {
    if (!playerRef.current || !playerReadyRef.current) {
      pendingCmdRef.current = cmd;
      return;
    }
    setPlayerError(null);
    const p = playerRef.current;
    if (cmd.action === 'load') p.loadVideoById(cmd.video_id);
    else if (cmd.action === 'play') p.playVideo();
    else if (cmd.action === 'pause') p.pauseVideo();
    else if (cmd.action === 'stop') p.stopVideo();
  }

  useEffect(() => {
    let cancelled = false;

    loadYouTubeAPI().then(() => {
      if (cancelled || !ytDivRef.current || playerRef.current) return;

      playerRef.current = new window.YT.Player(ytDivRef.current, {
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          modestbranding: 1,
          rel: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            playerReadyRef.current = true;
            if (pendingCmdRef.current) {
              const cmd = pendingCmdRef.current;
              pendingCmdRef.current = null;
              execCmd(cmd);
            }
          },
          onStateChange: (e) => {
            if (e.data === window.YT.PlayerState.ENDED) {
              fetch('/api/playback/ended', { method: 'POST' }).catch(() => {});
            }
          },
          onError: (e) => {
            setPlayerError(e.data);
            setTimeout(
              () => fetch('/api/playback/ended', { method: 'POST' }).catch(() => {}),
              2500
            );
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

  useEffect(() => {
    const cmd = state?.player_command;
    if (!cmd || cmd.timestamp <= lastCmdTs.current) return;
    lastCmdTs.current = cmd.timestamp;
    execCmd(cmd);
  }, [state?.player_command]);

  // ── Background music player ──────────────────────────────────────────────

  function applyBgMusic() {
    const bm = bgmRef.current;
    const currentMode = modeRef.current;
    if (!bgPlayerReadyRef.current || !bm) return;

    bgPlayerRef.current.setVolume(Math.round((bm.volume ?? 0.4) * 100));

    const shouldPlay =
      bm.playing && !!bm.url && (currentMode === 'idle' || currentMode === 'between');

    if (shouldPlay) {
      if (bm.url !== lastBgUrlRef.current) {
        lastBgUrlRef.current = bm.url;
        const parsed = parseBgUrl(bm.url);
        if (parsed?.list) {
          bgPlayerRef.current.loadPlaylist({ list: parsed.list, listType: 'playlist', index: 0 });
        } else if (parsed?.video) {
          bgPlayerRef.current.loadVideoById(parsed.video);
        }
      } else {
        // Resume if not already playing (state 1 = PLAYING)
        if (bgPlayerRef.current.getPlayerState() !== 1) {
          bgPlayerRef.current.playVideo();
        }
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
        height: '100%',
        width: '100%',
        videoId: '',
        playerVars: { controls: 0, disablekb: 1, fs: 0, playsinline: 1 },
        events: {
          onReady: (e) => {
            bgPlayerReadyRef.current = true;
            e.target.setLoop(true);
            applyBgMusic();
          },
          onStateChange: (e) => {
            // Loop single videos; playlists auto-advance
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

  useEffect(() => {
    applyBgMusic();
  }, [mode, bgm?.playing, bgm?.url, bgm?.volume]);

  // ── Render ────────────────────────────────────────────────────────────────

  const requestUrl = info?.urls?.request;
  const isPlaying = mode === 'playing';

  return (
    <div className="w-screen h-screen bg-black relative overflow-hidden">
      {/* Background video — visible during idle/between when BG music is active */}
      <div
        className={`absolute inset-0 pointer-events-none transition-opacity duration-1000 ${
          bgm?.playing && bgm?.url && !isPlaying ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div ref={bgDivRef} className="w-full h-full" />
      </div>

      {/* Dark overlay so foreground content stays readable over the background video */}
      <div
        className={`absolute inset-0 bg-black pointer-events-none transition-opacity duration-1000 ${
          bgm?.playing && bgm?.url && !isPlaying ? 'opacity-75' : 'opacity-0'
        }`}
      />

      {/* Karaoke player — visible only when playing */}
      <div
        className={`absolute inset-0 transition-opacity duration-300 ${
          isPlaying && !playerError ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        <div ref={ytDivRef} className="w-full h-full" />
      </div>

      {isPlaying && playerError && <EmbedErrorOverlay code={playerError} />}

      {mode === 'idle' && <IdleScreen requestUrl={requestUrl} />}
      {mode === 'between' && (
        <BetweenScreen
          countdown={state?.countdown}
          queue={state?.queue}
          requestUrl={requestUrl}
        />
      )}

      {isPlaying && !playerError && (
        <>
          <NowPlayingOverlay nowPlaying={state?.now_playing} />
          {requestUrl && (
            <div className="absolute top-4 right-4 bg-white rounded-lg p-1.5 opacity-60 hover:opacity-95 transition-opacity">
              <QrImg url={requestUrl} size={84} />
            </div>
          )}
        </>
      )}

      <div className="absolute top-2 left-2 flex items-center gap-1.5 z-50 opacity-20 hover:opacity-80 transition-opacity">
        <span className={`w-2 h-2 rounded-full ${connected ? 'bg-green-400' : 'bg-red-500'}`} />
        <span className="text-xs text-gray-400">{mode}</span>
      </div>
    </div>
  );
}
