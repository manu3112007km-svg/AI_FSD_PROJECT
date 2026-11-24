import React, { createContext, useContext, useEffect, useRef, useState } from 'react';

export interface RealtimeEventMessage {
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

interface RealtimeContextValue {
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  lastEvent: RealtimeEventMessage | null;
  recentEvents: RealtimeEventMessage[];
}

const RealtimeContext = createContext<RealtimeContextValue>({
  connectionState: 'disconnected',
  lastEvent: null,
  recentEvents: [],
});

export function RealtimeProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const [connectionState, setConnectionState] =
    useState<'connected' | 'reconnecting' | 'disconnected'>('disconnected');
  const [lastEvent, setLastEvent] = useState<RealtimeEventMessage | null>(null);
  const [recentEvents, setRecentEvents] = useState<RealtimeEventMessage[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setConnectionState('disconnected');
      return;
    }

    let unmounted = false;

    const connect = () => {
      if (unmounted) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!unmounted) setConnectionState('connected');
      };

      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data) as RealtimeEventMessage;
          setLastEvent(parsed);
          if (parsed.type !== 'system:connected') {
            setRecentEvents((prev) => [parsed, ...prev].slice(0, 25));
          }
        } catch {
          // ignore malformed frame
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        setConnectionState('reconnecting');
        reconnectTimerRef.current = window.setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      wsRef.current?.close();
    };
  }, [enabled]);

  return (
    <RealtimeContext.Provider value={{ connectionState, lastEvent, recentEvents }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  return useContext(RealtimeContext);
}
