import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button, Tag, Slider, Select, MessagePlugin, Table } from 'tdesign-react';
import { PlayIcon, PauseIcon, ChevronLeftIcon, VideoIcon, ForwardIcon, BackwardIcon, ReplayIcon } from 'tdesign-icons-react';
import { sessionService } from '../services/sessionService';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { usePagination } from '../hooks/usePagination';
import { SshReplayTerminal, type ReplayFrame } from '../components/SshReplayTerminal';
import { RdpReplayPlayer } from '../components/RdpReplayPlayer';
import type { Session } from '../types';

function formatDuration(sec?: number): string {
  if (!sec) return '-';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatReplayTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function parseCastHeader(text: string): { cols: number; rows: number } {
  try {
    const header = JSON.parse(text.trim().split('\n')[0] || '{}');
    return { cols: header.width || 80, rows: header.height || 24 };
  } catch {
    return { cols: 80, rows: 24 };
  }
}

export const SessionReplay: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [frames, setFrames] = useState<ReplayFrame[]>([]);
  const [castSize, setCastSize] = useState({ cols: 80, rows: 24 });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seekTo, setSeekTo] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const pag = usePagination({ defaultPageSize: 20 });
  const loadedSessionIdRef = useRef<number | null>(null);

  useEffect(() => {
    loadedSessionIdRef.current = null;
    setSelectedSession(null);
    setFrames([]);
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSeekTo(null);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    const fetchSessions = async () => {
      setListLoading(true);
      try {
        const res = await sessionService.getList({
          hasRecording: true,
          page: pag.page,
          pageSize: pag.pageSize,
        });
        if (res.code === 0 && res.data) {
          setSessions(res.data.list);
          pag.updateTotal(res.data.pagination.total);
        }
      } catch {
        /* ignore */
      } finally {
        setListLoading(false);
      }
    };
    fetchSessions();
  }, [pag.page, pag.pageSize]);

  const loadRecording = useCallback(async (session: Session) => {
    if (loadedSessionIdRef.current === session.id) return;
    loadedSessionIdRef.current = session.id;

    setSelectedSession(session);
    setCurrentIndex(0);
    setCurrentTime(0);
    setDuration(0);
    setPlaying(false);
    setFrames([]);

    if (session.protocol !== 'ssh') {
      return;
    }

    setLoading(true);
    try {
      const text = await sessionService.getRecording(session.id);
      setCastSize(parseCastHeader(text));
      const lines = text.trim().split('\n');
      const parsed: ReplayFrame[] = [];
      for (let i = 1; i < lines.length; i++) {
        try {
          const [time, type, data] = JSON.parse(lines[i]);
          parsed.push({ time: parseFloat(time), type, data });
        } catch {
          /* skip */
        }
      }
      setFrames(parsed);
      if (parsed.length > 0) {
        setDuration(parsed[parsed.length - 1].time);
      }
    } catch {
      MessagePlugin.error('加载录像失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!id || listLoading) return;
    const sessionId = parseInt(id, 10);
    if (Number.isNaN(sessionId)) return;

    const fromList = sessions.find((s) => s.id === sessionId);
    if (fromList) {
      loadRecording(fromList);
      return;
    }

    sessionService.getById(sessionId).then((res) => {
      if (res.code === 0 && res.data) loadRecording(res.data);
    });
  }, [id, sessions, listLoading, loadRecording]);

  // SSH playback timer
  useEffect(() => {
    if (selectedSession?.protocol !== 'ssh') return;
    if (!playing || currentIndex >= frames.length) {
      if (currentIndex >= frames.length && frames.length > 0) setPlaying(false);
      return;
    }

    const frame = frames[currentIndex];
    const nextTime =
      currentIndex + 1 < frames.length ? frames[currentIndex + 1].time : frame.time + 1;
    const delay = ((nextTime - frame.time) * 1000) / speed;

    const timer = setTimeout(() => {
      setCurrentIndex((i) => {
        const next = Math.min(i + 1, frames.length);
        if (next > 0) setCurrentTime(frames[Math.min(next - 1, frames.length - 1)]?.time || 0);
        return next;
      });
    }, Math.max(delay, 10));

    return () => clearTimeout(timer);
  }, [playing, currentIndex, frames, speed, selectedSession?.protocol]);

  const handleSshSeek = (index: number) => {
    setCurrentIndex(index);
    setCurrentTime(index > 0 ? frames[Math.min(index - 1, frames.length - 1)]?.time || 0 : 0);
    setPlaying(false);
  };

  // RDP end detection needs tolerance — Guacamole's last position report
  // may fall slightly short of the total duration.
  const finished =
    duration > 0
      ? currentTime >= Math.max(duration - 2, 0) // 2s tolerance for RDP
      : frames.length > 0 && currentIndex >= frames.length;

  const handleSeekDone = useCallback(() => setSeekTo(null), []);

  const handleReplay = useCallback(() => {
    if (selectedSession?.protocol === 'rdp') {
      setCurrentTime(0);
      setSeekTo(null);
      setPlaying(true);
    } else {
      setCurrentIndex(0);
      setCurrentTime(0);
      setPlaying(true);
    }
  }, [selectedSession?.protocol]);

  const handleStep = useCallback((delta: number) => {
    if (selectedSession?.protocol === 'rdp') {
      setPlaying(false);
      setCurrentTime((t) => Math.max(0, Math.min(duration, t + delta)));
      setSeekTo(Math.max(0, Math.min(duration, currentTime + delta)));
    } else {
      setPlaying(false);
      setCurrentIndex((i) => Math.max(0, Math.min(frames.length - 1, i + delta)));
    }
  }, [selectedSession?.protocol, duration, currentTime, frames.length]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === 'Space') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleStep(-5);
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStep(5);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleStep]);

  if (id) {
    const isRdp = selectedSession?.protocol === 'rdp';
    const replayDuration = isRdp ? duration : frames.length > 0 ? frames[frames.length - 1].time : 0;

    return (
      <div>
        <PageHeader
          title="会话回放"
          description={
            selectedSession
              ? `${selectedSession.username} · ${selectedSession.asset_name} · ${selectedSession.protocol?.toUpperCase()}`
              : '加载中...'
          }
        >
          <Button variant="outline" icon={<ChevronLeftIcon />} onClick={() => navigate('/replay')}>
            返回列表
          </Button>
        </PageHeader>

        {loading || !selectedSession ? (
          <LoadingSkeleton />
        ) : (
          <div className="replay-player glass-panel overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 160px)' }}>
            {/* ── Session metadata bar (compact) ── */}
            {selectedSession && (
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.04] text-[11px] bg-white/[0.015] shrink-0">
                <span className={`inline-block w-1.5 h-1.5 rounded-full ${selectedSession.protocol === 'ssh' ? 'bg-blue-400' : 'bg-amber-400'}`} />
                <span className="text-slate-400 font-medium">{selectedSession.protocol?.toUpperCase()}</span>
                <span className="text-slate-600">·</span>
                <span className="text-slate-300">{selectedSession.username}@{selectedSession.asset_name}</span>
                <span className="text-slate-600 ml-auto">{selectedSession.start_time}</span>
              </div>
            )}

            {/* ── Video display area ── */}
            <div className="relative flex-1 min-h-[300px]">
              {isRdp && selectedSession ? (
                <RdpReplayPlayer
                  sessionId={selectedSession.id}
                  playing={playing}
                  seekTo={seekTo}
                  onSeekDone={handleSeekDone}
                  onPlayingChange={setPlaying}
                  onDuration={setDuration}
                  onProgress={setCurrentTime}
                />
              ) : (
                <SshReplayTerminal
                  frames={frames}
                  currentIndex={currentIndex}
                  cols={castSize.cols}
                  rows={castSize.rows}
                />
              )}

              {/* Replay overlay when finished */}
              {finished && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm z-10 rounded-lg">
                  <Button
                    theme="primary"
                    size="large"
                    icon={<ReplayIcon />}
                    onClick={handleReplay}
                    className="shadow-lg shadow-cyan-500/20"
                  >
                    重新播放
                  </Button>
                </div>
              )}
            </div>

            {/* ── Control bar ── */}
            <div className="flex items-center gap-2 px-3 py-2 border-t border-white/[0.04] bg-white/[0.015] shrink-0">
              {/* Left: play/pause + step + time */}
              <div className="flex items-center gap-1.5 shrink-0">
                <Button
                  shape="square"
                  variant="text"
                  size="small"
                  icon={<BackwardIcon />}
                  onClick={() => handleStep(-5)}
                  title="后退 5 秒"
                />
                <Button
                  shape="square"
                  variant="text"
                  icon={finished ? <ReplayIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
                  onClick={() => finished ? handleReplay() : setPlaying(!playing)}
                  className="replay-play-btn"
                  title={finished ? '重新播放' : playing ? '暂停' : '播放'}
                />
                <Button
                  shape="square"
                  variant="text"
                  size="small"
                  icon={<ForwardIcon />}
                  onClick={() => handleStep(5)}
                  title="快进 5 秒"
                />
                <span className="replay-time text-xs font-mono text-slate-300 ml-2 tabular-nums">
                  {formatReplayTime(currentTime)}
                </span>
              </div>

              {/* Center: progress slider */}
              <div className="flex-1 min-w-[80px]">
                {!isRdp && frames.length > 0 && (
                  <Slider
                    value={currentIndex}
                    max={Math.max(frames.length - 1, 0)}
                    onChange={(v) => handleSshSeek(v as number)}
                  />
                )}
                {isRdp && duration > 0 && (
                  <Slider
                    value={currentTime}
                    max={duration}
                    onChange={(v) => {
                      setPlaying(false);
                      setSeekTo(v as number);
                    }}
                  />
                )}
              </div>

              {/* Right: total time + speed */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {formatReplayTime(replayDuration)}
                </span>
                {!isRdp && (
                  <span className="text-[10px] text-slate-600">
                    {currentIndex}/{frames.length}
                  </span>
                )}
                <Select
                  value={speed}
                  onChange={(v) => setSpeed(v as number)}
                  options={[
                    { value: 1, label: '1x' },
                    { value: 2, label: '2x' },
                    { value: 4, label: '4x' },
                    { value: 8, label: '8x' },
                  ]}
                  size="small"
                  style={{ width: 68 }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  const columns = [
    { colKey: 'id', title: 'ID', width: 60 },
    { colKey: 'username', title: '用户', width: 100 },
    { colKey: 'asset_name', title: '资产', ellipsis: true },
    {
      colKey: 'protocol',
      title: '协议',
      width: 80,
      cell: ({ row }: { row: Session }) => (
        <Tag theme={row.protocol === 'ssh' ? 'primary' : 'warning'} variant="light" size="small">
          {row.protocol?.toUpperCase()}
        </Tag>
      ),
    },
    { colKey: 'start_time', title: '开始时间', width: 170 },
    {
      colKey: 'status',
      title: '状态',
      width: 90,
      cell: ({ row }: { row: Session }) => (
        <Tag
          theme={row.status === 'terminated' ? 'danger' : row.status === 'timeout' ? 'warning' : 'default'}
          variant="light"
          size="small"
        >
          {row.status === 'terminated' ? '已阻断' : row.status === 'timeout' ? '超时' : '已结束'}
        </Tag>
      ),
    },
    {
      colKey: 'duration_sec',
      title: '时长',
      width: 90,
      cell: ({ row }: { row: Session }) => formatDuration(row.duration_sec ?? undefined),
    },
    {
      colKey: 'actions',
      title: '操作',
      width: 90,
      cell: ({ row }: { row: Session }) => (
        <Button
          variant="text"
          size="small"
          disabled={!row.recording_path}
          onClick={() => navigate(`/replay/${row.id}`)}
        >
          回放
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="会话回放" description="查看 SSH / RDP 历史会话录像，支持倍速播放" />

      <div className="content-card">
        {listLoading ? (
          <LoadingSkeleton />
        ) : (
          <Table
            data={sessions}
            columns={columns}
            rowKey="id"
            hover
            stripe
            pagination={pag.paginationProps}
            empty={
              <EmptyState
                icon={<VideoIcon size="24px" className="text-slate-500" />}
                title="暂无回放记录"
                description="在资产中开启回放后，已结束的 SSH/RDP 会话将在此展示"
              />
            }
          />
        )}
      </div>
    </div>
  );
};
