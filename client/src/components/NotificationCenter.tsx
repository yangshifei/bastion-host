import React, { useState, useEffect, useRef, useCallback } from 'react';
import { securityService, LoginNotification } from '../services/securityService';
import { NotificationIcon, CheckCircleIcon } from 'tdesign-icons-react';

const TYPE_LABELS: Record<string, string> = {
  new_ip_login: '新 IP 登录',
  failed_login: '登录失败',
  account_locked: '账号锁定',
  password_changed: '密码已修改',
};

export const NotificationCenter: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<LoginNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const fetchCount = useCallback(async () => {
    try {
      const res = await securityService.getUnreadCount();
      if (res.code === 0 && res.data) setUnreadCount(res.data.count);
    } catch { /* ignore */ }
  }, []);

  const fetchList = useCallback(async () => {
    try {
      const res = await securityService.getNotifications(true, 20);
      if (res.code === 0 && res.data) setNotifications(res.data.list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchCount(); const i = setInterval(fetchCount, 30000); return () => clearInterval(i); }, [fetchCount]);

  const toggle = () => {
    if (!open) {
      fetchList();
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const markAllRead = async () => {
    await securityService.markNotificationsRead({ all: true });
    setUnreadCount(0);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (ref.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative">
      <button ref={triggerRef} type="button" onClick={toggle}
        className="relative flex items-center justify-center w-8 h-8 rounded-lg hover:bg-[var(--bg-elevated)] transition-colors"
      >
        <NotificationIcon size="18px" className="text-[var(--text-secondary)]" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div ref={ref}
          className="absolute right-0 top-full mt-1.5 w-80 rounded-xl border shadow-[0_16px_48px_rgba(0,0,0,0.35)] backdrop-blur-xl z-50 overflow-hidden animate-slide-up"
          style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border-default)' }}
        >
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>消息通知</span>
            {unreadCount > 0 && (
              <button type="button" onClick={markAllRead}
                className="flex items-center gap-1 text-xs transition-colors hover:underline"
                style={{ color: 'var(--accent)' }}
              >
                <CheckCircleIcon size="13px" /> 全部已读
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: 'var(--text-muted)' }}>暂无通知</p>
            ) : (
              notifications.map(n => (
                <div key={n.id} className="px-4 py-3 hover:bg-[var(--bg-surface)] transition-colors"
                  style={{ borderBottom: '1px solid var(--border-subtle)' }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      {TYPE_LABELS[n.type] || n.type}
                    </span>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shrink-0 mt-1" />}
                  </div>
                  {n.ip && <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>IP: {n.ip}</p>}
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{n.created_at}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
