import { useEffect, useRef, useState } from 'react';

function getWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function detectRole() {
  const p = window.location.pathname;
  if (p.startsWith('/display')) return 'display';
  if (p.startsWith('/dj'))      return 'dj';
  if (p.startsWith('/request')) return 'request';
  // Dev mode: infer from port
  const port = parseInt(window.location.port);
  if (port === 3001) return 'display';
  if (port === 3002) return 'dj';
  if (port === 3003) return 'request';
  return 'unknown';
}

export function useWebSocket() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const role = detectRole();

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ type: 'IDENTIFY', role }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'STATE_UPDATE') setState(data.state);
        } catch {}
      };

      ws.onclose = () => {
        setConnected(false);
        if (!cancelled) retryRef.current = setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      cancelled = true;
      clearTimeout(retryRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return { state, connected };
}
