import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Button, Input, Popconfirm, MessagePlugin } from 'tdesign-react';
import {
  FolderOpenIcon, FileIcon, UploadIcon, DownloadIcon,
  DeleteIcon, RefreshIcon, AddIcon, ChevronRightIcon,
  HomeIcon, EditIcon, BrowseIcon,
} from 'tdesign-icons-react';

interface SftpFile {
  name: string;
  size: number;
  permissions: string;
  mtime: string;
  isDir: boolean;
  isSymlink: boolean;
}

interface SftpPanelProps {
  send: (msg: any) => void;
  onMessage?: (msg: any) => void;
  visible: boolean;
  onToggle: () => void;
  sftpMessage?: any;
}

function formatSize(bytes: number): string {
  if (!bytes || bytes === 0) return '-';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB';
  return (bytes / 1073741824).toFixed(1) + ' GB';
}

function formatMtime(iso: string): string {
  if (!iso) return '-';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SftpPanel: React.FC<SftpPanelProps> = ({ send, onMessage, visible, onToggle, sftpMessage }) => {
  const [path, setPath] = useState('/');
  const [files, setFiles] = useState<SftpFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<SftpFile | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingMsgRef = useRef<any>(null);

  const fetchList = useCallback((p: string) => {
    setLoading(true);
    setSelectedFile(null);
    setPreviewContent(null);
    setPath(p);
    send({ type: 'sftp', action: 'list', path: p });
    pendingMsgRef.current = { type: 'sftp_list' };
  }, [send]);

  useEffect(() => {
    if (visible) fetchList(path);
  }, [visible]); // eslint-disable-line

  // Process incoming SFTP messages via prop
  useEffect(() => {
    if (!sftpMessage) return;
    const msg = sftpMessage;
    if (msg.type === 'sftp_list' && msg.files) {
      const sorted = [...msg.files].sort((a: SftpFile, b: SftpFile) => {
        if (a.isDir && !b.isDir) return -1;
        if (!a.isDir && b.isDir) return 1;
        return a.name.localeCompare(b.name);
      });
      setFiles(sorted);
      setLoading(false);
    } else if (msg.type === 'sftp_done') {
      fetchList(path);
    } else if (msg.type === 'sftp_download' && msg.content) {
      const pending = pendingMsgRef.current;
      if (pending?.action === 'download' && pending.name) {
        // Trigger browser download
        const byteChars = atob(msg.content);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes]);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = pending.name;
        a.click();
        URL.revokeObjectURL(url);
        MessagePlugin.success('下载完成');
        pendingMsgRef.current = null;
      } else {
        // Preview mode
        setPreviewContent(atob(msg.content));
      }
    } else if (msg.type === 'sftp_error') {
      MessagePlugin.error(msg.message);
      setLoading(false);
    }
  }, [sftpMessage]); // eslint-disable-line

  const handleOpenDir = (name: string) => {
    const newPath = path === '/' ? `/${name}` : `${path}/${name}`;
    fetchList(newPath);
  };

  const handleUp = () => {
    if (path === '/') return;
    const parent = path.substring(0, path.lastIndexOf('/')) || '/';
    fetchList(parent);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;
    send({ type: 'sftp', action: 'mkdir', path, name: newFolderName.trim() });
    setNewFolderName('');
    setShowNewFolder(false);
  };

  const handleDelete = (f: SftpFile) => {
    send({ type: 'sftp', action: 'delete', path: path === '/' ? `/${f.name}` : `${path}/${f.name}` });
  };

  const handleRenameStart = (f: SftpFile) => {
    setRenaming(f.name);
    setRenameValue(f.name);
  };

  const handleRenameConfirm = (oldName: string) => {
    if (!renameValue.trim() || renameValue.trim() === oldName) { setRenaming(null); return; }
    send({ type: 'sftp', action: 'rename', path: path === '/' ? `/${oldName}` : `${path}/${oldName}`, newName: renameValue.trim() });
    setRenaming(null);
  };

  const handleDownload = (f: SftpFile) => {
    const filePath = path === '/' ? `/${f.name}` : `${path}/${f.name}`;
    // Store ref to handle download response
    pendingMsgRef.current = { action: 'download', name: f.name };
    send({ type: 'sftp', action: 'download', path: filePath });
  };

  const handlePreview = (f: SftpFile) => {
    if (f.isDir) { handleOpenDir(f.name); return; }
    setSelectedFile(f);
    if (f.size < 512000) { // 500KB limit
      send({ type: 'sftp', action: 'download', path: path === '/' ? `/${f.name}` : `${path}/${f.name}` });
    } else {
      MessagePlugin.warning('文件过大，无法预览');
    }
  };

  const handleUpload = () => {
    fileInputRef.current?.click();
  };

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      send({ type: 'sftp', action: 'upload', path, name: file.name, content: base64 });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Breadcrumb parts
  const parts = path === '/' ? ['/'] : path.split('/').filter(Boolean);

  if (!visible) return null;

  return (
    <div className="flex flex-col h-full border-l border-[var(--border-default)] bg-[var(--bg-surface)]" style={{ width: 360, minWidth: 280 }}>
      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-[var(--border-subtle)] shrink-0">
        <Button variant="text" size="small" icon={<RefreshIcon />} onClick={() => fetchList(path)} title="刷新" />
        <Button variant="text" size="small" icon={<AddIcon />} onClick={() => setShowNewFolder(v => !v)} title="新建文件夹" />
        <Button variant="text" size="small" icon={<UploadIcon />} onClick={handleUpload} title="上传文件" />
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} />
        <div className="flex-1" />
        <Button variant="text" size="small" onClick={onToggle} title="关闭">✕</Button>
      </div>

      {/* ── New folder input ── */}
      {showNewFolder && (
        <div className="flex items-center gap-1 px-2 py-1 border-b border-[var(--border-subtle)]">
          <Input value={newFolderName} onChange={setNewFolderName} placeholder="文件夹名称" size="small" style={{ flex: 1 }}
            onEnter={handleCreateFolder} />
          <Button size="small" onClick={handleCreateFolder}>确定</Button>
          <Button variant="text" size="small" onClick={() => setShowNewFolder(false)}>取消</Button>
        </div>
      )}

      {/* ── Breadcrumb ── */}
      <div className="flex items-center gap-0.5 px-2 py-1 text-xs border-b border-[var(--border-subtle)] overflow-x-auto shrink-0">
        <span className="cursor-pointer text-cyan-400 shrink-0" onClick={() => fetchList('/')}>
          <HomeIcon size="13px" />
        </span>
        {parts.map((p, i) => (
          <span key={i} className="flex items-center gap-0.5 shrink-0">
            <ChevronRightIcon size="10px" className="text-slate-600" />
            <span className="cursor-pointer hover:text-cyan-400 truncate max-w-[100px]"
              onClick={() => fetchList('/' + parts.slice(0, i + 1).join('/'))}>
              {p}
            </span>
          </span>
        ))}
      </div>

      {/* ── File list ── */}
      <div className="flex-1 overflow-y-auto text-xs">
        {loading && <div className="p-4 text-center text-slate-500">加载中...</div>}

        {!loading && path !== '/' && (
          <div className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[var(--bg-elevated)] border-b border-[var(--border-subtle)]"
            onClick={handleUp}>
            <FolderOpenIcon size="14px" className="text-amber-400" />
            <span className="text-slate-400">..</span>
          </div>
        )}

        {!loading && files.map(f => (
          <div key={f.name}
            className={`flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] cursor-pointer ${
              selectedFile?.name === f.name ? 'bg-cyan-500/10' : ''
            }`}
            onDoubleClick={() => handlePreview(f)}
          >
            {f.isDir ? (
              <FolderOpenIcon size="14px" className="text-amber-400 shrink-0" onClick={() => handleOpenDir(f.name)} />
            ) : (
              <FileIcon size="14px" className="text-slate-500 shrink-0" onClick={() => handlePreview(f)} />
            )}

            <div className="flex-1 min-w-0" onClick={() => handlePreview(f)}>
              {renaming === f.name ? (
                <Input value={renameValue} onChange={setRenameValue} size="small" style={{ width: '100%' }}
                  onEnter={() => handleRenameConfirm(f.name)}
                  onBlur={() => handleRenameConfirm(f.name)}
                  autofocus />
              ) : (
                <span className="truncate block">{f.name}</span>
              )}
              <span className="text-[10px] text-slate-500">
                {f.isDir ? '目录' : formatSize(f.size)} · {formatMtime(f.mtime)}
              </span>
            </div>

            {!f.isDir && !renaming && (
              <Button variant="text" size="small" icon={<DownloadIcon />}
                onClick={(e) => { e.stopPropagation(); handleDownload(f); }} title="下载" />
            )}
            <Button variant="text" size="small" icon={<EditIcon />}
              onClick={(e) => { e.stopPropagation(); handleRenameStart(f); }} title="重命名" />
            <Popconfirm content={`确认删除 ${f.name}？`} onConfirm={() => handleDelete(f)}>
              <Button variant="text" size="small" theme="danger" icon={<DeleteIcon />} />
            </Popconfirm>
          </div>
        ))}

        {!loading && files.length === 0 && (
          <div className="p-4 text-center text-slate-500">空目录</div>
        )}
      </div>

      {/* ── Preview panel ── */}
      {previewContent !== null && selectedFile && (
        <div className="border-t border-[var(--border-default)] h-40 overflow-auto shrink-0">
          <div className="flex items-center justify-between px-2 py-1 bg-[var(--bg-page)] border-b border-[var(--border-subtle)] text-xs">
            <span className="text-slate-400 truncate">{selectedFile.name}</span>
            <Button variant="text" size="small" onClick={() => setPreviewContent(null)}>✕</Button>
          </div>
          <pre className="p-2 text-[11px] text-slate-300 font-mono whitespace-pre-wrap break-all">{previewContent}</pre>
        </div>
      )}
    </div>
  );
};
