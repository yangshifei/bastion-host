import { useRef, useCallback, useState } from 'react';
import type { WsStatus, WsServerMessage } from '../types';

interface UseWebSocketOptions {
  onMessage?: (msg: WsServerMessage) => void;
  onOpen?: () => void;
  onClose?: (reason?: string) => void;
  onError?: (err: Event) => void;
  reconnectMax?: number;
}

interface UseWebSocketReturn {
  status: WsStatus;
  connect: (url: string) => void;
  disconnect: () => void;
  send: (data: Record<string, any>) => void;
  reconnect: () => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const urlRef = useRef<string>('');
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageQueueRef = useRef<string[]>([]);
  const [status, setStatus] = useState<WsStatus>('CLOSED');

  const cleanup = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingTimerRef.current) {
      clearInterval(pingTimerRef.current);
      pingTimerRef.current = null;
    }
  }, []);

  const send = useCallback((data: Record<string, any>) => {
    const msg = JSON.stringify(data);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(msg);
    } else {
      messageQueueRef.current.push(msg);
    }
  }, []);

  const flushQueue = useCallback(() => {
    while (messageQueueRef.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
      const msg = messageQueueRef.current.shift();
      if (msg) wsRef.current.send(msg);
    }
  }, []);

  const disconnect = useCallback(() => {
    cleanup();
    reconnectAttemptRef.current = (options.reconnectMax ?? 10) + 1; // Prevent auto-reconnect
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setStatus('CLOSED');
  }, [cleanup, options.reconnectMax]);

  const connect = useCallback((url: string) => {
    urlRef.current = url;
    reconnectAttemptRef.current = 0;

    cleanup();

    try {
      setStatus('CONNECTING');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setStatus('OPEN');
        reconnectAttemptRef.current = 0;
        flushQueue();
        options.onOpen?.();

        // Heartbeat: 30s ping
        pingTimerRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }));
          }
        }, 30000);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'pong') return; // heartbeats are silent
          options.onMessage?.(msg);
        } catch {
          // Ignore parse errors
        }
      };

      ws.onerror = (err) => {
        options.onError?.(err);
      };

      ws.onclose = () => {
        setStatus('CLOSED');
        pingTimerRef.current && clearInterval(pingTimerRef.current);
        options.onClose?.('Connection closed');

        // Auto-reconnect with exponential backoff
        if (reconnectAttemptRef.current < (options.reconnectMax ?? 10)) {
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptRef.current), 30000);
          const jitter = Math.random() * 1000;
          reconnectAttemptRef.current++;

          setStatus('RECONNECTING');
          reconnectTimerRef.current = setTimeout(() => {
            connect(urlRef.current);
          }, delay + jitter);
        }
      };
    } catch (err) {
      setStatus('CLOSED');
    }
  }, [cleanup, flushQueue, options]);

  const reconnect = useCallback(() => {
    reconnectAttemptRef.current = 0;
    connect(urlRef.current);
  }, [connect]);

  return { status, connect, disconnect, send, reconnect };
}
