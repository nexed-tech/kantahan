import { useEffect, useRef, useState, useCallback } from 'react';

function getWsUrl() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function useWebSocket() {
  const [state, setState] = useState(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const retryRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

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
