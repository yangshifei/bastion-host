import React, { useEffect, useRef, useState } from 'react';
import { LoadingIcon, ErrorCircleIcon } from 'tdesign-icons-react';
import api from '../services/api';
import { createSessionRecording } from '../guacamole-patch';

interface Props {
  sessionId: number;
  onDuration?: (seconds: number) => void;
  onProgress?: (position: number) => void;
  onPlayingChange?: (playing: boolean) => void;
  playing: boolean;
  seekTo: number | null;
  onSeekDone?: () => void;
}

async function toRecordingBlob(data: unknown): Promise<{ blob: Blob | null; reason?: string; detail?: string }> {
  if (data == null) {
    return { blob: null, reason: 'empty' };
  }

  let blob: Blob | null = null;
  if (data instanceof Blob) {
    if (data.size === 0) return { blob: null, reason: 'empty' };
    blob = data;
  } else if (data instanceof ArrayBuffer) {
    if (data.byteLength === 0) return { blob: null, reason: 'empty' };
    blob = new Blob([data], { type: 'application/octet-stream' });
  } else if (typeof data === 'string') {
    if (!data.length) return { blob: null, reason: 'empty' };
    blob = new Blob([data], { type: 'application/octet-stream' });
  }

  if (!blob) {
    return { blob: null, reason: 'format' };
  }

  const head = await blob.slice(0, 128).text();
  const trimmed = head.trimStart();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const json = JSON.parse(await blob.text());
      return { blob: null, reason: 'api_error', detail: json.message };
    } catch {
      return { blob: null, reason: 'api_error' };
    }
  }

  // Guacamole: length.opcode — opcode may be empty (e.g. "0.,connection-id;")
  if (!/^\d+\./.test(trimmed)) {
    return { blob: null, reason: 'format' };
  }

  return { blob };
}

function fitDisplayToContainer(display: any, container: HTMLDivElement) {
  const remoteWidth = display.getWidth();
  const remoteHeight = display.getHeight();
  if (!remoteWidth || !remoteHeight || !container.clientWidth || !container.clientHeight) return;

  const scale = Math.min(
    container.clientWidth / remoteWidth,
    container.clientHeight / remoteHeight
  );
  display.scale(Math.max(scale, 0.1));
}

function mountDisplayElement(
  recording: any,
  container: HTMLDivElement,
  displayRef: React.MutableRefObject<any>
) {
  container.innerHTML = '';
  const display = recording.getDisplay();
  displayRef.current = display;
  container.appendChild(display.getElement());
  fitDisplayToContainer(display, container);
  return display;
}

export const RdpReplayPlayer: React.FC<Props> = ({
  sessionId,
  onDuration,
  onProgress,
  onPlayingChange,
  playing,
  seekTo,
  onSeekDone,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const recordingRef = useRef<any>(null);
  const recordingHandleRef = useRef<{ abort: () => void } | null>(null);
  const displayRef = useRef<any>(null);
  const resizeTimerRef = useRef<number | null>(null);
  const loadGenRef = useRef(0);
  const onDurationRef = useRef(onDuration);
  const onProgressRef = useRef(onProgress);
  const onPlayingChangeRef = useRef(onPlayingChange);
  const onSeekDoneRef = useRef(onSeekDone);
  const suppressPauseSyncRef = useRef(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  onDurationRef.current = onDuration;
  onProgressRef.current = onProgress;
  onPlayingChangeRef.current = onPlayingChange;
  onSeekDoneRef.current = onSeekDone;

  function startPlayback(recording: any): void {
    const dur = recording.getDuration();
    const pos = recording.getPosition();
    const atEnd = dur > 0 && pos >= dur - 1000;

    if (atEnd) {
      suppressPauseSyncRef.current = true;
      recording.seek(0, () => {
        suppressPauseSyncRef.current = false;
        onProgressRef.current?.(0);
        recording.play();
      });
    } else if (!recording.isPlaying()) {
      recording.play();
    }
  }

  useEffect(() => {
    const loadGen = ++loadGenRef.current;
    let cancelled = false;
    let loadTimeout: ReturnType<typeof setTimeout> | undefined;

    const fail = (message: string) => {
      if (cancelled || loadGen !== loadGenRef.current) return;
      setError(message);
      setLoading(false);
    };

    const init = async () => {
      setLoading(true);
      setError(null);

      try {
        const res = await api.get(`/sessions/${sessionId}/recording`, {
          responseType: 'blob',
          timeout: 120000,
        });
        if (cancelled || loadGen !== loadGenRef.current) return;

        const { blob, reason, detail } = await toRecordingBlob(res.data);
        if (cancelled || loadGen !== loadGenRef.current) return;
        if (!blob) {
          if (reason === 'empty') {
            fail('录像文件为空，请重新连接 RDP 后再试');
          } else if (reason === 'api_error') {
            fail(detail || '录像接口返回错误');
          } else {
            fail('录像文件格式无效');
          }
          return;
        }

        const Guacamole = (window as any).Guacamole;
        if (!Guacamole?.SessionRecording) {
          fail('Guacamole 回放组件未加载');
          return;
        }

        const handle = createSessionRecording(blob);
        const recording = handle.recording;
        recordingHandleRef.current = handle;
        recordingRef.current = recording;

        loadTimeout = window.setTimeout(() => {
          fail('录像加载超时，请检查录像文件是否完整');
        }, 60000);

        recording.onprogress = () => {
          if (cancelled || loadGen !== loadGenRef.current) return;
          const durationMs = recording.getDuration();
          if (durationMs > 0) {
            onDurationRef.current?.(durationMs / 1000);
          }
        };

        recording.onseek = (positionMs: number) => {
          if (cancelled || loadGen !== loadGenRef.current) return;
          onProgressRef.current?.(positionMs / 1000);
        };

        recording.onplay = () => {
          if (loadGen === loadGenRef.current) {
            onPlayingChangeRef.current?.(true);
          }
        };

        recording.onpause = () => {
          if (loadGen !== loadGenRef.current || suppressPauseSyncRef.current) return;
          const dur = recording.getDuration();
          const pos = recording.getPosition();
          if (dur > 0 && pos >= dur - 500) {
            onPlayingChangeRef.current?.(false);
          }
        };

        recording.onerror = (message: string) => {
          if (loadTimeout !== undefined) clearTimeout(loadTimeout);
          fail(message || 'RDP 录像解析失败');
        };

        recording.onload = () => {
          if (cancelled || loadGen !== loadGenRef.current) return;
          if (loadTimeout !== undefined) clearTimeout(loadTimeout);

          const container = containerRef.current;
          if (!container) {
            fail('播放器初始化失败');
            return;
          }

          const display = mountDisplayElement(recording, container, displayRef);

          display.onresize = () => {
            if (!containerRef.current || !displayRef.current) return;
            if (resizeTimerRef.current !== null) {
              window.clearTimeout(resizeTimerRef.current);
            }
            resizeTimerRef.current = window.setTimeout(() => {
              resizeTimerRef.current = null;
              if (containerRef.current && displayRef.current) {
                fitDisplayToContainer(displayRef.current, containerRef.current);
              }
            }, 100);
          };

          const durationMs = recording.getDuration();
          if (durationMs > 0) {
            onDurationRef.current?.(durationMs / 1000);
          } else {
            fail('录像无有效帧，请重新连接 RDP 后再试');
            return;
          }

          const finish = () => {
            if (cancelled || loadGen !== loadGenRef.current) return;
            setLoading(false);
            fitDisplayToContainer(display, container);
          };

          let seekDone = false;
          const onSeekComplete = () => {
            if (seekDone) return;
            seekDone = true;
            finish();
          };

          recording.seek(0, onSeekComplete);
          window.setTimeout(onSeekComplete, 3000);
        };

        // Handlers attached — now parse the blob.
        handle.start();
      } catch (err: any) {
        if (loadTimeout !== undefined) clearTimeout(loadTimeout);
        if (!cancelled && loadGen === loadGenRef.current) {
          const status = err?.response?.status;
          if (status === 404) {
            fail('录像文件不存在');
          } else if (status === 403) {
            fail('无权访问该录像');
          } else {
            fail(err?.message || '加载 RDP 录像失败');
          }
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      if (loadTimeout !== undefined) clearTimeout(loadTimeout);
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
      displayRef.current = null;
      try {
        recordingHandleRef.current?.abort();
        recordingRef.current?.pause?.();
      } catch {
        /* ignore */
      }
      recordingHandleRef.current = null;
      if (loadGen === loadGenRef.current) {
        recordingRef.current = null;
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [sessionId]);

  useEffect(() => {
    const recording = recordingRef.current;
    if (!recording || loading) return;

    if (playing) {
      startPlayback(recording);
    } else {
      recording.pause();
    }
  }, [playing, loading]);

  useEffect(() => {
    if (!playing || loading) return;

    let active = true;
    let timer: ReturnType<typeof setTimeout>;

    const poll = () => {
      if (!active) return;
      const rec = recordingRef.current;
      if (!rec) return;
      onProgressRef.current?.(rec.getPosition() / 1000);
      timer = setTimeout(poll, 200);
    };

    poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [playing, loading]);

  useEffect(() => {
    const recording = recordingRef.current;
    if (!recording || loading || seekTo === null) return;

    suppressPauseSyncRef.current = true;
    recording.seek(seekTo * 1000, () => {
      suppressPauseSyncRef.current = false;
      onProgressRef.current?.(seekTo);
      onSeekDoneRef.current?.();
      if (containerRef.current && displayRef.current) {
        fitDisplayToContainer(displayRef.current, containerRef.current);
      }
    });
  }, [seekTo, loading]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full min-h-[400px] rounded-lg bg-slate-900/40 border border-white/[0.04]">
        <ErrorCircleIcon size="28px" className="text-slate-500" />
        <span className="text-sm text-slate-500">{error}</span>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full group">
      <div
        className={`absolute -inset-[2px] rounded-lg bg-gradient-to-r from-cyan-500/30 via-cyan-400/15 to-cyan-500/30 transition-opacity duration-500 pointer-events-none ${
          playing && !loading ? 'opacity-100 animate-pulse' : 'opacity-0'
        }`}
      />

      <div className="relative w-full h-full min-h-[360px] rounded-lg overflow-hidden border border-white/[0.06] bg-black">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-slate-950/90 z-10">
            <div className="relative">
              <div className="absolute inset-0 rounded-full border-2 border-cyan-500/20 animate-ping" />
              <div className="relative flex items-center justify-center w-10 h-10 rounded-full bg-cyan-500/10 border border-cyan-500/20">
                <LoadingIcon className="animate-spin text-cyan-400" size="20px" />
              </div>
            </div>
            <span className="text-xs text-slate-500">加载录像数据...</span>
          </div>
        )}

        {playing && !loading && (
          <div className="absolute top-3 right-3 flex items-center gap-1.5 z-10 px-2 py-1 rounded-full bg-black/60 backdrop-blur border border-white/[0.06]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-slate-400 font-medium">LIVE</span>
          </div>
        )}

        <div ref={containerRef} className="w-full h-full flex items-center justify-center" />
      </div>
    </div>
  );
};
