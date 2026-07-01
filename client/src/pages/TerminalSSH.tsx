import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button, Tag, MessagePlugin } from 'tdesign-react';
import {
  PlayCircleIcon,
  PoweroffIcon,
  ClearIcon,
  TerminalIcon,
} from 'tdesign-icons-react';
import { AssetSelector } from '../components/AssetSelector';
import { PageHeader } from '../components/PageHeader';
import { TerminalToolbar, TerminalEmpty } from '../components/TerminalToolbar';
import { useTerminal } from '../hooks/useTerminal';
import { useWebSocket } from '../hooks/useWebSocket';
import { useAuthStore } from '../stores/authStore';
import type { SafeAsset, WsServerMessage } from '../types';
import { getTerminalInputLine, isEnterKey } from '../utils/terminalInputLine';

interface Props {
  active?: boolean;
}

export const TerminalSSH: React.FC<Props> = ({ active = true }) => {
  const token = useAuthStore((s) => s.token);
  const [selectedAsset, setSelectedAsset] = useState<SafeAsset | null>(null);
  const [connected, setConnected] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const terminalDivRef = useRef<HTMLDivElement | null>(null);
  const { initTerminal, write, writeln, clear, focus, fit, getDimensions, initialized, terminalRef } =
    useTerminal();

  const handleMessage = useCallback(
    (msg: WsServerMessage) => {
      switch (msg.type) {
        case 'connected':
          setConnected(true);
          setSessionId(msg.sessionId || null);
          writeln('\r\n\x1b[32m✓\x1b[0m 已连接到资产\r\n');
          requestAnimationFrame(() => fit());
          break;
        case 'output':
          write(msg.data || '');
          break;
        case 'error':
          writeln(`\r\n\x1b[31m✗\x1b[0m 错误: ${msg.message}\r\n`);
          MessagePlugin.error(msg.message || '连接失败');
          break;
        case 'disconnected':
          setConnected(false);
          writeln(`\r\n\x1b[33m!\x1b[0m 已断开: ${msg.message || msg.reason || '未知原因'}\r\n`);
          break;
        case 'alert':
          if (msg.level === 'error') {
            writeln(`\r\n\x1b[31m✖\x1b[0m ${msg.message}\r\n`);
            MessagePlugin.error(msg.message || '');
          } else {
            writeln(`\r\n\x1b[33m!\x1b[0m ${msg.message}\r\n`);
            MessagePlugin.warning(msg.message || '');
          }
          break;
      }
    },
    [write, writeln, fit]
  );

  const { status, connect, disconnect, send } = useWebSocket({
    onMessage: handleMessage,
    onClose: () => {
      setConnected(false);
      writeln('\r\n连接已关闭\r\n');
    },
  });

  // Initialize xterm as soon as the viewport is mounted
  useEffect(() => {
    if (terminalDivRef.current && !initialized) {
      initTerminal(terminalDivRef.current);
    }
  }, [initialized, initTerminal]);

  // Refit when terminal becomes ready or window resizes
  useEffect(() => {
    if (!initialized) return;
    const handleResize = () => fit();
    requestAnimationFrame(handleResize);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initialized, fit]);

  useEffect(() => {
    if (connected) focus();
  }, [connected, focus]);

  useEffect(() => {
    if (!active || !initialized) return;
    const timer = setTimeout(() => {
      fit();
      focus();
    }, 50);
    return () => clearTimeout(timer);
  }, [active, initialized, fit, focus]);

  useEffect(() => {
    if (!token && connected) {
      send({ type: 'disconnect' });
      disconnect();
      setConnected(false);
    }
  }, [token, connected, send, disconnect]);

  useEffect(() => {
    if (connected && initialized) {
      const interval = setInterval(() => {
        const dims = getDimensions();
        if (dims.cols > 0 && dims.rows > 0) {
          send({ type: 'resize', cols: dims.cols, rows: dims.rows });
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [connected, initialized, send, getDimensions]);

  const handleConnect = useCallback(() => {
    if (!selectedAsset || !token || !initialized) return;

    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/ws/ssh?token=${encodeURIComponent(token)}`;
    connect(wsUrl);

    setTimeout(() => {
      send({ type: 'connect', assetId: selectedAsset.id });
      fit();
    }, 300);
  }, [selectedAsset, token, initialized, connect, send, fit]);

  const handleDisconnect = useCallback(() => {
    send({ type: 'disconnect' });
    disconnect();
    setConnected(false);
    setSessionId(null);
  }, [send, disconnect]);

  const handleTerminalData = useCallback(
    (data: string) => {
      if (!connected) return;
      const payload: { type: 'input'; data: string; lineOnEnter?: string } = {
        type: 'input',
        data,
      };
      if (isEnterKey(data) && terminalRef.current) {
        const line = getTerminalInputLine(terminalRef.current);
        if (line) payload.lineOnEnter = line;
      }
      send(payload);
    },
    [connected, send, terminalRef]
  );

  useEffect(() => {
    if (initialized && terminalRef.current) {
      const handler = (data: string) => handleTerminalData(data);
      terminalRef.current.onData(handler);
      return () => {
        (terminalRef.current as any)?.removeAllListeners?.();
      };
    }
  }, [initialized, handleTerminalData, terminalRef]);

  const wsStatusLabel = (() => {
    switch (status) {
      case 'CONNECTING':
        return <Tag theme="warning" variant="light" size="small">连接中</Tag>;
      case 'OPEN':
        return <Tag theme="success" variant="light" size="small">已连接</Tag>;
      case 'RECONNECTING':
        return <Tag theme="warning" variant="light" size="small">重连中</Tag>;
      default:
        return <Tag theme="default" variant="light" size="small">未连接</Tag>;
    }
  })();

  return (
    <div className="terminal-page">
      <PageHeader
        title="SSH 终端"
        description="通过 SSH 协议安全连接远程 Linux / Unix 服务器"
      />

      <TerminalToolbar
        status={wsStatusLabel}
        meta={
          sessionId && (
            <span className="text-xs text-slate-600 font-mono hidden sm:inline">
              {sessionId.substring(0, 8)}…
            </span>
          )
        }
      >
        <AssetSelector
          protocol="ssh"
          value={selectedAsset?.id}
          onChange={(_, asset) => setSelectedAsset(asset)}
          disabled={connected}
        />
        {!connected ? (
          <Button
            theme="primary"
            icon={<PlayCircleIcon />}
            onClick={handleConnect}
            disabled={!selectedAsset || !initialized}
          >
            连接
          </Button>
        ) : (
          <Button theme="danger" variant="outline" icon={<PoweroffIcon />} onClick={handleDisconnect}>
            断开
          </Button>
        )}
        <Button variant="outline" icon={<ClearIcon />} onClick={() => clear()} disabled={!initialized}>
          清屏
        </Button>
      </TerminalToolbar>

      <div className="terminal-viewport" onClick={() => focus()}>
        <div
          ref={terminalDivRef}
          className="absolute inset-0 p-1 z-[1]"
          style={{ fontFamily: 'JetBrains Mono, monospace' }}
        />
        {!initialized && (
          <TerminalEmpty
            icon={<TerminalIcon size="28px" />}
            title="正在初始化终端…"
            description="请稍候"
          />
        )}
        {initialized && !connected && (
          <div className="absolute bottom-3 left-3 z-[2] pointer-events-none">
            <span className="text-xs text-slate-600 bg-black/40 px-2 py-1 rounded">
              选择资产后点击「连接」
            </span>
          </div>
        )}
      </div>
    </div>
  );
};
