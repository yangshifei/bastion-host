import React, { useState } from 'react';
import { Dialog, Button, Select, Input, MessagePlugin, Tabs } from 'tdesign-react';
import { UploadIcon, DownloadIcon } from 'tdesign-icons-react';
import { databaseService } from '../services/databaseService';

interface DmcDataTransferProps {
  visible: boolean;
  assetId: number;
  tables: string[];
  defaultTable?: string;
  onClose: () => void;
}

function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const DmcDataTransfer: React.FC<DmcDataTransferProps> = ({
  visible,
  assetId,
  tables,
  defaultTable,
  onClose,
}) => {
  const [tab, setTab] = useState<'export' | 'import'>('export');
  const [table, setTable] = useState(defaultTable || '');
  const [format, setFormat] = useState<'csv' | 'sql'>('csv');
  const [limit, setLimit] = useState('10000');
  const [importContent, setImportContent] = useState('');
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (visible && defaultTable) setTable(defaultTable);
  }, [visible, defaultTable]);

  const tableOptions = tables.map((t) => ({ label: t, value: t }));

  const handleExport = async () => {
    if (!table) {
      MessagePlugin.warning('请选择表');
      return;
    }
    setLoading(true);
    try {
      const res = await databaseService.exportTable(assetId, {
        table,
        format,
        limit: parseInt(limit, 10) || 10000,
      });
      if (res.code === 0 && res.data) {
        downloadFile(res.data.content, res.data.filename, res.data.mimeType);
        MessagePlugin.success(`已导出 ${res.data.rowCount} 行`);
        onClose();
      } else {
        MessagePlugin.error(res.message || '导出失败');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      MessagePlugin.error(msg || '导出失败');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!table) {
      MessagePlugin.warning('请选择目标表');
      return;
    }
    if (!importContent.trim()) {
      MessagePlugin.warning('请粘贴或上传文件内容');
      return;
    }
    setLoading(true);
    try {
      const res = await databaseService.importData(assetId, {
        table,
        format,
        content: importContent,
      });
      if (res.code === 0) {
        MessagePlugin.success(res.message || `导入完成，影响 ${res.data?.affectedRows ?? 0} 行`);
        setImportContent('');
        onClose();
      } else {
        MessagePlugin.error(res.message || '导入失败');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      MessagePlugin.error(msg || '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setImportContent(String(reader.result || ''));
      if (file.name.endsWith('.sql')) setFormat('sql');
      else if (file.name.endsWith('.csv')) setFormat('csv');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <Dialog
      visible={visible}
      header="数据导入 / 导出"
      width={560}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            取消
          </Button>
          {tab === 'export' ? (
            <Button theme="primary" icon={<DownloadIcon />} loading={loading} onClick={handleExport}>
              导出
            </Button>
          ) : (
            <Button theme="primary" icon={<UploadIcon />} loading={loading} onClick={handleImport}>
              导入
            </Button>
          )}
        </div>
      }
    >
      <Tabs
        value={tab}
        onChange={(v) => setTab(v as 'export' | 'import')}
        list={[
          { label: '导出数据', value: 'export' },
          { label: '导入数据', value: 'import' },
        ]}
      />

      <div className="mt-4 space-y-4">
        <div>
          <div className="text-xs text-slate-500 mb-1.5">目标表</div>
          <Select
            value={table}
            onChange={(v) => setTable(String(v))}
            options={tableOptions}
            placeholder="选择表"
            filterable
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <div className="text-xs text-slate-500 mb-1.5">格式</div>
          <Select
            value={format}
            onChange={(v) => setFormat(v as 'csv' | 'sql')}
            options={[
              { label: 'CSV', value: 'csv' },
              { label: 'SQL (INSERT)', value: 'sql' },
            ]}
            style={{ width: '100%' }}
          />
        </div>

        {tab === 'export' && (
          <div>
            <div className="text-xs text-slate-500 mb-1.5">最大行数（最多 50000）</div>
            <Input value={limit} onChange={setLimit} type="number" />
          </div>
        )}

        {tab === 'import' && (
          <>
            <div>
              <div className="text-xs text-slate-500 mb-1.5">上传文件</div>
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border-subtle)] cursor-pointer text-xs text-slate-400 hover:bg-[var(--bg-elevated)]">
                <UploadIcon size="14px" />
                选择 CSV / SQL 文件
                <input type="file" accept=".csv,.sql,.txt" className="hidden" onChange={handleFileUpload} />
              </label>
            </div>
            <div>
              <div className="text-xs text-slate-500 mb-1.5">或粘贴内容</div>
              <textarea
                className="w-full h-32 p-3 text-xs font-mono rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-deep)] text-slate-300 outline-none resize-none"
                value={importContent}
                onChange={(e) => setImportContent(e.target.value)}
                placeholder={format === 'csv' ? '首行为列名，逗号分隔...' : 'INSERT INTO ... 语句'}
              />
              <p className="text-[10px] text-slate-600 mt-1">
                CSV 最多 5000 行；SQL 仅支持 INSERT / REPLACE，最多 200 条语句
              </p>
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
};
