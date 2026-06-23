import React, { useCallback, useEffect, useState } from 'react';
import { Table, Button, Tag, Space, Popconfirm, MessagePlugin } from 'tdesign-react';
import { RefreshIcon, PoweroffIcon, StopCircleIcon } from 'tdesign-icons-react';
import { sessionService } from '../services/sessionService';
import { PageHeader } from '../components/PageHeader';
import { EmptyState } from '../components/EmptyState';
import { LoadingSkeleton } from '../components/LoadingSkeleton';
import { useAuthStore } from '../stores/authStore';
import type { ActiveSessionInfo } from '../types';

function formatDuration(start: string): string {
  const ms = Date.now() - new Date(start).getTime();
  if (ms < 0) return '-';
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export const ActiveSessions: React.FC = () => {
  const currentUserId = useAuthStore((s) => s.user?.id);
  const [sessions, setSessions] = useState<ActiveSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [terminatingId, setTerminatingId] = useState<number | null>(null);
  const [blockingAll, setBlockingAll] = useState(false);

  const fetchActive = useCallback(async () => {
    try {
      const res = await sessionService.getActive();
      if (res.code === 0 && res.data) {
        setSessions(res.data);
      }
    } catch {
      MessagePlugin.error('加载活跃会话失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchActive();
    const timer = setInterval(fetchActive, 5000);
    return () => clearInterval(timer);
  }, [fetchActive]);

  const handleTerminate = async (dbSessionId?: number) => {
    if (!dbSessionId) return;
    setTerminatingId(dbSessionId);
    try {
      const res = await sessionService.terminate(dbSessionId);
      if (res.code === 0) {
        MessagePlugin.success('会话已阻断');
        fetchActive();
      }
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '阻断失败');
    } finally {
      setTerminatingId(null);
    }
  };

  const handleTerminateAll = async () => {
    setBlockingAll(true);
    try {
      const res = await sessionService.terminateAll(true);
      if (res.code === 0) {
        MessagePlugin.success(res.message || `已阻断 ${res.data?.terminated ?? 0} 个会话`);
        fetchActive();
      }
    } catch (err: any) {
      MessagePlugin.error(err.response?.data?.message || '批量阻断失败');
    } finally {
      setBlockingAll(false);
    }
  };

  const otherCount = sessions.filter((s) => s.userId !== currentUserId).length;

  const columns = [
    { colKey: 'username', title: '用户', width: 110 },
    { colKey: 'asset_name', title: '资产', ellipsis: true },
    {
      colKey: 'protocol',
      title: '协议',
      width: 80,
      cell: ({ row }: { row: ActiveSessionInfo }) => (
        <Tag theme={row.protocol === 'ssh' ? 'primary' : 'warning'} variant="light" size="small">
          {row.protocol?.toUpperCase()}
        </Tag>
      ),
    },
    {
      colKey: 'startTime',
      title: '已持续',
      width: 100,
      cell: ({ row }: { row: ActiveSessionInfo }) => (
        <span className="text-slate-400 text-xs">{formatDuration(row.startTime)}</span>
      ),
    },
    { colKey: 'clientIp', title: '客户端 IP', width: 130 },
    {
      colKey: 'actions',
      title: '操作',
      width: 120,
      cell: ({ row }: { row: ActiveSessionInfo }) => (
        <Popconfirm
          content={`确认阻断 ${row.username} 的会话？`}
          onConfirm={() => handleTerminate(row.dbSessionId)}
        >
          <Button
            variant="text"
            theme="danger"
            size="small"
            icon={<PoweroffIcon />}
            loading={terminatingId === row.dbSessionId}
            disabled={!row.dbSessionId}
          >
            阻断
          </Button>
        </Popconfirm>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="活跃会话"
        description="实时监控并管理正在进行的远程连接，支持单会话阻断与一键阻断他人会话"
      >
        <Space>
          <Button variant="outline" icon={<RefreshIcon />} onClick={fetchActive}>
            刷新
          </Button>
          <Popconfirm
            content={`确认阻断其他 ${otherCount} 个用户的全部活跃会话？（不含您自己的会话）`}
            onConfirm={handleTerminateAll}
          >
            <Button
              theme="danger"
              variant="outline"
              icon={<StopCircleIcon />}
              loading={blockingAll}
              disabled={otherCount === 0}
            >
              一键阻断他人 ({otherCount})
            </Button>
          </Popconfirm>
        </Space>
      </PageHeader>

      <div className="content-card">
        {loading ? (
          <LoadingSkeleton />
        ) : (
          <Table
            data={sessions}
            columns={columns}
            rowKey="id"
            hover
            stripe
            empty={
              <EmptyState
                icon={<PoweroffIcon size="24px" className="text-slate-500" />}
                title="暂无活跃会话"
                description="当前没有正在进行的远程连接"
              />
            }
          />
        )}
      </div>
    </div>
  );
};
