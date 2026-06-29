import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Tag, MessagePlugin } from 'tdesign-react';
import {
  PlayCircleIcon,
  PoweroffIcon,
  FullscreenIcon,
  DesktopIcon,
  LoadingIcon,
} from 'tdesign-icons-react';
import { AssetSelector } from '../components/AssetSelector';
import { PageHeader } from '../components/PageHeader';
import { TerminalToolbar, TerminalEmpty } from '../components/TerminalToolbar';
import { useAuthStore } from '../stores/authStore';
import type { SafeAsset } from '../types';

function fitDisplayToContainer(display: any, container: HTMLDivElement) {
  const remoteWidth = display.getWidth();
  const remoteHeight = display.getHeight();
  if (!remoteWidth || !remoteHeight) return;

  const scale = Math.min(
    container.clientWidth / remoteWidth,
    container.clientHeight / remoteHeight
  );
  display.scale(Math.max(scale, 0.1));
}

export const TerminalRDP: React.FC<{ active?: boolean }> = ({ active = true }) => {
  const token = useAuthStore((s) => s.token);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const displayContainerRef = useRef<HTMLDivElement | null>(null);
  const guacRef = useRef<any>(null);
  const displayRef = useRef<any>(null);
  const keyboardRef = useRef<any>(null);

  const [selectedAsset, setSelectedAsset] = useState<SafeAsset | null>(null);
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('断开');
  const connectedRef = useRef(false);

  const sendDisplaySize = useCallback((client: any) => {
    const container = viewportRef.current;
    if (!container || !client) return;
    const width = Math.max(Math.floor(container.clientWidth), 640);
    const height = Math.max(Math.floor(container.clientHeight), 480);
    client.sendSize(width, height);
  }, []);

  const refreshDisplayLayout = useCallback(() => {
    const client = guacRef.current;
    const display = displayRef.current;
    const container = viewportRef.current;
    if (!client || !display || !container) return;
    if (container.clientWidth === 0 || container.clientHeight === 0) return;
    sendDisplaySize(client);
    fitDisplayToContainer(display, container);
  }, [sendDisplaySize]);

  const handleConnect = useCallback(() => {
    if (!selectedAsset || !token) return;

    const Guacamole = (window as any).Guacamole;
    if (!Guacamole) {
      MessagePlugin.error('RDP 客户端库未加载');
      return;
    }

    try {
      setConnecting(true);
      setConnectionStatus('连接中...');

      const tunnel = new Guacamole.WebSocketTunnel('/ws/rdp');
      const client = new Guacamole.Client(tunnel);
      const display = client.getDisplay();
      const displayElement = display.getElement();

      displayRef.current = display;

      if (displayContainerRef.current) {
        displayContainerRef.current.innerHTML = '';
        displayContainerRef.current.appendChild(displayElement);
      }

      display.onresize = () => {
        if (viewportRef.current) {
          fitDisplayToContainer(display, viewportRef.current);
        }
      };

      const keyboard = new Guacamole.Keyboard(document);
      keyboard.onkeydown = (keysym: number) => client.sendKeyEvent(1, keysym);
      keyboard.onkeyup = (keysym: number) => client.sendKeyEvent(0, keysym);
      keyboardRef.current = keyboard;

      const sendMouseEvent = (state: any) => {
        client.sendMouseState(state, true);
      };

      const mouse = new Guacamole.Mouse(displayElement);
      mouse.onmousedown = sendMouseEvent;
      mouse.onmouseup = sendMouseEvent;
      mouse.onmousemove = sendMouseEvent;

      client.onstatechange = (state: number) => {
        const states = ['IDLE', 'CONNECTING', 'WAITING', 'CONNECTED', 'DISCONNECTING', 'DISCONNECTED'];
        const name = states[state] || 'UNKNOWN';
        setConnectionStatus(name);

        if (state === 3) {
          connectedRef.current = true;
          setConnected(true);
          setConnecting(false);
          requestAnimationFrame(() => {
            requestAnimationFrame(refreshDisplayLayout);
            setTimeout(refreshDisplayLayout, 200);
          });
        }
        if (state === 5) {
          if (!connectedRef.current) {
            setConnectionStatus('被拒绝 — 该资产正在使用中');
          }
          connectedRef.current = false;
          setConnected(false);
          setConnecting(false);
        }
      };

      client.onerror = (err: any) => {
        MessagePlugin.error('RDP 连接错误: ' + (err?.message || ''));
        setConnectionStatus('错误');
        setConnected(false);
        setConnecting(false);
      };

      client.connect(`assetId=${selectedAsset.id}&token=${encodeURIComponent(token)}`);
      guacRef.current = client;
    } catch (err: any) {
      MessagePlugin.error('RDP 初始化失败: ' + err.message);
      setConnectionStatus('错误');
      setConnecting(false);
    }
  }, [selectedAsset, token, refreshDisplayLayout]);

  const handleDisconnect = useCallback(() => {
    guacRef.current?.disconnect();
    guacRef.current = null;
    displayRef.current = null;
    keyboardRef.current = null;
    if (displayContainerRef.current) {
      displayContainerRef.current.innerHTML = '';
    }
    setConnected(false);
    setConnecting(false);
    setConnectionStatus('已断开');
  }, []);

  const handleFullscreen = useCallback(() => {
    viewportRef.current?.requestFullscreen().catch(() => {});
  }, []);

  const handleCtrlAltDel = useCallback(() => {
    if (guacRef.current) {
      guacRef.current.sendKeyEvent(1, 0xFFE3);
      guacRef.current.sendKeyEvent(1, 0xFFE9);
      guacRef.current.sendKeyEvent(1, 0xFFFF);
      guacRef.current.sendKeyEvent(0, 0xFFFF);
      guacRef.current.sendKeyEvent(0, 0xFFE9);
      guacRef.current.sendKeyEvent(0, 0xFFE3);
    }
  }, []);

  useEffect(() => () => { guacRef.current?.disconnect(); }, []);

  useEffect(() => {
    if (!token && (connected || connecting)) {
      handleDisconnect();
    }
  }, [token, connected, connecting, handleDisconnect]);

  useEffect(() => {
    if (!active || !connected) return;
    const timer = setTimeout(refreshDisplayLayout, 80);
    return () => clearTimeout(timer);
  }, [active, connected, refreshDisplayLayout]);

  // Refit on window resize and viewport size changes
  useEffect(() => {
    if (!connected) return;

    const handleResize = () => refreshDisplayLayout();
    window.addEventListener('resize', handleResize);

    const container = viewportRef.current;
    let observer: ResizeObserver | undefined;
    if (container) {
      observer = new ResizeObserver(handleResize);
      observer.observe(container);
      handleResize();
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  }, [connected, refreshDisplayLayout]);

  const showDisplay = connected || connecting;

  const statusTag = connected ? (
    <Tag theme="success" variant="light" size="small">{connectionStatus}</Tag>
  ) : connecting ? (
    <Tag theme="warning" variant="light" size="small">{connectionStatus}</Tag>
  ) : (
    <Tag theme="default" variant="light" size="small">{connectionStatus}</Tag>
  );

  return (
    <div className="terminal-page">
      <PageHeader
        title="RDP 终端"
        description="通过 RDP 协议连接远程 Windows 桌面环境"
      />

      <TerminalToolbar status={statusTag}>
        <AssetSelector
          protocol="rdp"
          value={selectedAsset?.id}
          onChange={(_, asset) => setSelectedAsset(asset)}
          disabled={connected || connecting}
        />
        {!connected ? (
          <Button
            theme="primary"
            icon={<PlayCircleIcon />}
            onClick={handleConnect}
            disabled={!selectedAsset || connecting}
            loading={connecting}
          >
            连接
          </Button>
        ) : (
          <>
            <Button theme="danger" variant="outline" icon={<PoweroffIcon />} onClick={handleDisconnect}>
              断开
            </Button>
            <Button variant="outline" icon={<FullscreenIcon />} onClick={handleFullscreen}>
              全屏
            </Button>
            <Button variant="outline" onClick={handleCtrlAltDel}>
              Ctrl+Alt+Del
            </Button>
          </>
        )}
      </TerminalToolbar>

      <div ref={viewportRef} className="terminal-viewport">
        <div
          ref={displayContainerRef}
          className="absolute inset-0 z-[1] flex items-center justify-center overflow-hidden cursor-default"
        />
        {!showDisplay && (
          <TerminalEmpty
            icon={<DesktopIcon size="28px" />}
            title="远程桌面"
            description='选择 RDP 资产并点击"连接"开始远程桌面会话'
          />
        )}
        {connecting && !connected && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none gap-3">
            <LoadingIcon size="28px" className="text-cyan-400 animate-spin" />
            <p className="text-sm text-slate-400">正在建立远程桌面连接…</p>
          </div>
        )}
      </div>
    </div>
  );
};
