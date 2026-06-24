import React, { useEffect, useRef, useState } from 'react';
import { LoadingIcon } from 'tdesign-icons-react';
import api from '../services/api';

interface Props {
  sessionId: number;
  onDuration?: (seconds: number) => void;
  onProgress?: (position: number) => void;
  playing: boolean;
  seekTo: number | null;
  onSeekDone?: () => void;
}

async function toRecordingBlob(data: unknown): Promise<Blob | null> {
  if (data == null) return null;

  if (data instanceof Blob) {
    if (data.size === 0) return null;
    return data;
  }

  if (data instanceof ArrayBuffer) {
    if (data.byteLength === 0) return null;
    return new Blob([data], { type: 'application/octet-stream' });
  }

  return null;
}

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

export const RdpReplayPlayer: React.FC<Props> = ({
  sessionId,
  onDuration,
  onProgress,
  playing,
  seekTo,
  onSeekDone,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const recordingRef = useRef<any>(null);
  const loadGenRef = useRef(0);
  const onDurationRef = useRef(onDuration);
  const onProgressRef = useRef(onProgress);
  const onSeekDoneRef = useRef(onSeekDone);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  onDurationRef.current = onDuration;
  onProgressRef.current = onProgress;
  onSeekDoneRef.current = onSeekDone;

  useEffect(() => {
    const loadGen = ++loadGenRef.current;
    let recording: any = null;
    let cancelled = false;

    const init = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get(`/sessions/${sessionId}/recording`, {
          responseType: 'blob',
          timeout: 120000,
        });
        if (cancelled || loadGen !== loadGenRef.current) return;

        const blob = await toRecordingBlob(res.data);
        if (cancelled || loadGen !== loadGenRef.current) return;
        if (!blob) {
          setError('录像文件为空');
          setLoading(false);
          return;
        }

        const Guacamole = (window as any).Guacamole;
        if (!Guacamole?.SessionRecording) {
          setError('Guacamole 回放组件未加载');
          setLoading(false);
          return;
        }

        recording = new Guacamole.SessionRecording(blob);

        if (cancelled || loadGen !== loadGenRef.current) {
          recording.abort?.();
          return;
        }
        recordingRef.current = recording;

        recording.onprogress = (durationMs: number) => {
          if (durationMs > 0 && loadGen === loadGenRef.current) {
            onDurationRef.current?.(durationMs / 1000);
          }
        };

        recording.onseek = (positionMs: number) => {
          if (loadGen !== loadGenRef.current) return;
          onProgressRef.current?.(positionMs / 1000);
          onSeekDoneRef.current?.();
        };

        recording.onerror = (message: string) => {
          if (!cancelled && loadGen === loadGenRef.current) {
            setError(message || 'RDP 录像解析失败');
            setLoading(false);
          }
        };

        recording.onload = () => {
          if (cancelled || loadGen !== loadGenRef.current || !containerRef.current) return;
          containerRef.current.innerHTML = '';
          const display = recording.getDisplay();
          const displayElement = display.getElement();
          containerRef.current.appendChild(displayElement);

          display.onresize = () => {
            if (containerRef.current) {
              fitDisplayToContainer(display, containerRef.current);
            }
          };

          recording.seek(0, () => {
            if (cancelled || loadGen !== loadGenRef.current) return;
            if (containerRef.current) {
              fitDisplayToContainer(display, containerRef.current);
            }
            const durationMs = recording.getDuration();
            if (durationMs > 0) {
              onDurationRef.current?.(durationMs / 1000);
            }
            setLoading(false);
          });
        };
      } catch (err: any) {
        if (!cancelled && loadGen === loadGenRef.current) {
          const status = err?.response?.status;
          if (status === 404) {
            setError('录像文件不存在');
          } else if (status === 403) {
            setError('无权访问该录像');
          } else {
            setError(err?.message || '加载 RDP 录像失败');
          }
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      cancelled = true;
      const rec = recordingRef.current ?? recording;
      try {
        rec?.pause?.();
        rec?.abort?.();
      } catch {
        /* ignore cleanup errors */
      }
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
      recording.play();
    } else {
      recording.pause();
    }
  }, [playing, loading]);

  useEffect(() => {
    const recording = recordingRef.current;
    if (!recording || loading || seekTo === null) return;
    recording.seek(seekTo * 1000, () => onSeekDoneRef.current?.());
  }, [seekTo, loading]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-full min-h-[400px] text-slate-500">
        {error}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-lg overflow-hidden border border-white/[0.06] bg-black">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10">
          <LoadingIcon className="animate-spin text-cyan-400" size="32px" />
        </div>
      )}
      <div ref={containerRef} className="w-full h-full flex items-center justify-center" />
    </div>
  );
};
