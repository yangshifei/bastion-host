import React, { Suspense, lazy, useRef } from 'react';
import { Loading } from 'tdesign-react';
import type { editor } from 'monaco-editor';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
  height?: number;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({
  value,
  onChange,
  onExecute,
  height = 180,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  const handleMount = (ed: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
    editorRef.current = ed;
    ed.focus();
    if (onExecute) {
      ed.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => onExecute());
    }
  };

  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center bg-[var(--bg-deep)]" style={{ height }}>
          <Loading size="small" text="加载编辑器..." />
        </div>
      }
    >
      <MonacoEditor
        height={height}
        language="sql"
        theme="vs-dark"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', ui-monospace, monospace",
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 8, bottom: 8 },
          renderLineHighlight: 'line',
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
        }}
      />
    </Suspense>
  );
};
