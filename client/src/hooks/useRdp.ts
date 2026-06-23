import { useRef, useCallback, useState } from 'react';

interface UseRdpOptions {
  onStatusChange?: (status: string) => void;
  onError?: (message: string) => void;
}

export function useRdp(options: UseRdpOptions = {}) {
  const clientRef = useRef<any>(null);
  const displayContainerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<string>('DISCONNECTED');

  const connect = useCallback((token: string, assetId: number) => {
    const Guacamole = (window as any).Guacamole;
    if (!Guacamole) {
      options.onError?.('Guacamole 客户端库未加载');
      return;
    }

    try {
      setStatus('CONNECTING');
      options.onStatusChange?.('CONNECTING');

      const tunnel = new Guacamole.WebSocketTunnel('/ws/rdp');
      const client = new Guacamole.Client(tunnel);
      const display = client.getDisplay();
      const displayElement = display.getElement();

      if (displayContainerRef.current) {
        displayContainerRef.current.innerHTML = '';
        displayContainerRef.current.appendChild(displayElement);
      }

      const sendMouseEvent = (state: any) => {
        client.sendMouseState(state, true);
      };

      const mouse = new Guacamole.Mouse(displayElement);
      mouse.onmousedown = sendMouseEvent;
      mouse.onmouseup = sendMouseEvent;
      mouse.onmousemove = sendMouseEvent;

      client.onstatechange = (state: number) => {
        const stateNames = ['IDLE', 'CONNECTING', 'WAITING', 'CONNECTED', 'DISCONNECTING', 'DISCONNECTED'];
        const name = stateNames[state] || 'UNKNOWN';
        setStatus(name);
        options.onStatusChange?.(name);

        if (state === 3 && displayContainerRef.current) {
          const rect = displayContainerRef.current.getBoundingClientRect();
          client.sendSize(
            Math.max(Math.floor(rect.width), 1024),
            Math.max(Math.floor(rect.height), 768)
          );
        }
      };

      client.onerror = (err: any) => {
        options.onError?.(err?.message || 'RDP 连接错误');
      };

      client.connect(`assetId=${assetId}&token=${encodeURIComponent(token)}`);
      clientRef.current = client;
    } catch (err: any) {
      options.onError?.(err.message);
      setStatus('ERROR');
    }
  }, [options]);

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect();
      clientRef.current = null;
    }
    if (displayContainerRef.current) {
      displayContainerRef.current.innerHTML = '';
    }
    setStatus('DISCONNECTED');
  }, []);

  const sendCtrlAltDel = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.sendKeyEvent(1, 0xFFE3);
      clientRef.current.sendKeyEvent(1, 0xFFE9);
      clientRef.current.sendKeyEvent(1, 0xFFFF);
      clientRef.current.sendKeyEvent(0, 0xFFFF);
      clientRef.current.sendKeyEvent(0, 0xFFE9);
      clientRef.current.sendKeyEvent(0, 0xFFE3);
    }
  }, []);

  const sendSize = useCallback((width: number, height: number) => {
    if (clientRef.current) {
      clientRef.current.sendSize(width, height);
    }
  }, []);

  return {
    status,
    displayContainerRef,
    connect,
    disconnect,
    sendCtrlAltDel,
    sendSize,
    clientRef,
  };
}
