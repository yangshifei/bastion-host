import React, { Suspense, lazy, useRef, useCallback, useEffect } from 'react';
import { Loading } from 'tdesign-react';
import type { editor } from 'monaco-editor';
import type { DbSchema } from '../services/databaseService';
import { getSqlToExecute as resolveSqlToExecute } from '../utils/sqlStatement';

const MonacoEditor = lazy(() => import('@monaco-editor/react'));

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute: (sql: string) => void;
  height?: number;
  dbType?: string;
  schema?: DbSchema | null;
  onMount?: (editor: editor.IStandaloneCodeEditor) => void;
}

export const SqlEditor: React.FC<SqlEditorProps> = ({
  value,
  onChange,
  onExecute,
  height = 200,
  dbType = 'mysql',
  schema,
  onMount,
}) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import('monaco-editor') | null>(null);
  const disposablesRef = useRef<import('monaco-editor').IDisposable[]>([]);
  const onExecuteRef = useRef(onExecute);
  onExecuteRef.current = onExecute;

  // Clean up previous completion providers when dbType or schema changes
  const cleanupProviders = useCallback(() => {
    disposablesRef.current.forEach((d) => d.dispose());
    disposablesRef.current = [];
  }, []);

  // Register SQL completion provider
  const registerCompletion = useCallback(
    (monaco: typeof import('monaco-editor')) => {
      const disp = monaco.languages.registerCompletionItemProvider('sql', {
        triggerCharacters: ['.', ' '],
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const textUntilPosition = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          // Skip completion inside comments or strings
          const lineContent = model.getLineContent(position.lineNumber);
          const lineUpToCursor = lineContent.substring(0, position.column - 1);
          // Single-line comment
          if (/--.*$/.test(lineUpToCursor)) return { suggestions: [] };
          // Multi-line comment: check if cursor is inside an unclosed /* block
          const fullTextUpToCursor = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });
          const lastOpen = fullTextUpToCursor.lastIndexOf('/*');
          const lastClose = fullTextUpToCursor.lastIndexOf('*/');
          if (lastOpen > lastClose) return { suggestions: [] };
          // String literal detection (odd number of unescaped single quotes on current line)
          const quotes = lineUpToCursor.match(/(?:^|[^\\])'/g);
          if (quotes && quotes.length % 2 !== 0) return { suggestions: [] };

          const prefix = word.word.toLowerCase();
          if (prefix.length < 2) return { suggestions: [] };

          const suggestions: import('monaco-editor').languages.CompletionItem[] = [];

          // Detect context for column suggestions
          const tableRefs = detectTableRefs(textUntilPosition, schema);

          // Keyword suggestions
          const keywords = getKeywords(dbType);
          for (const kw of keywords) {
            if (kw.toLowerCase().startsWith(prefix)) {
              suggestions.push({
                label: kw,
                kind: monaco.languages.CompletionItemKind.Keyword,
                insertText: kw,
                range,
                sortText: '1_' + kw,
              });
            }
          }

          // Table name suggestions
          if (schema?.tables) {
            // Check if we're in a FROM/JOIN/INTO context (before any trailing clause keyword)
            const lastFromMatch = textUntilPosition.match(/(?:FROM|JOIN|INTO|UPDATE)\s+([^\s,;]*)$/i);
            const afterFrom = lastFromMatch && !/\b(?:WHERE|ORDER|GROUP|HAVING|LIMIT|OFFSET|SET|ON)\b/i.test(lastFromMatch[1]);
            if (afterFrom) {
              for (const t of schema.tables) {
                if (t.name.toLowerCase().startsWith(prefix)) {
                  suggestions.push({
                    label: t.name,
                    kind: monaco.languages.CompletionItemKind.Struct,
                    insertText: t.name,
                    range,
                    detail: `${t.columns.length} columns`,
                    sortText: '2_' + t.name,
                  });
                }
              }
            }

            // Column suggestions based on detected table refs
            for (const ref of tableRefs) {
              const tbl = schema.tables.find((t) => t.name.toLowerCase() === ref.name.toLowerCase());
              if (tbl) {
                for (const col of tbl.columns) {
                  if (col.name.toLowerCase().startsWith(prefix)) {
                    suggestions.push({
                      label: col.name,
                      kind: monaco.languages.CompletionItemKind.Field,
                      insertText: col.name,
                      range,
                      detail: `${ref.name}.${col.name}  ${col.type}${col.key_type === 'PRI' ? ' PK' : ''}`,
                      sortText: '3_' + col.name,
                    });
                  }
                }
              }
            }

            // Dot prefix: alias.column completion
            const dotMatch = lineUpToCursor.match(/(\w+)\.\s*(\w*)$/);
            if (dotMatch) {
              const alias = dotMatch[1].toLowerCase();
              const colPrefix = dotMatch[2].toLowerCase();
              const ref = tableRefs.find((r) => (r.alias || r.name).toLowerCase() === alias);
              if (ref) {
                const tbl = schema.tables.find((t) => t.name.toLowerCase() === ref.name.toLowerCase());
                if (tbl) {
                  for (const col of tbl.columns) {
                    if (!colPrefix || col.name.toLowerCase().startsWith(colPrefix)) {
                      suggestions.push({
                        label: col.name,
                        kind: monaco.languages.CompletionItemKind.Field,
                        insertText: col.name,
                        range: {
                          startLineNumber: position.lineNumber,
                          endLineNumber: position.lineNumber,
                          startColumn: position.column - colPrefix.length,
                          endColumn: position.column,
                        },
                        detail: `${ref.name}.${col.name}  ${col.type}`,
                        sortText: '3_' + col.name,
                      });
                    }
                  }
                }
              }
            }
          }

          // Function suggestions
          const funcs = getFunctions(dbType);
          for (const fn of funcs) {
            if (fn.name.toLowerCase().startsWith(prefix)) {
              suggestions.push({
                label: fn.label,
                kind: monaco.languages.CompletionItemKind.Function,
                insertText: fn.insertText,
                insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                range,
                detail: fn.documentation,
                sortText: '4_' + fn.label,
              });
            }
          }

          return { suggestions: suggestions.slice(0, 50) };
        },
      });
      disposablesRef.current.push(disp);
    },
    [dbType, schema],
  );

  // Register signature help provider for functions
  const registerSignatureHelp = useCallback(
    (monaco: typeof import('monaco-editor')) => {
      const disp = monaco.languages.registerSignatureHelpProvider('sql', {
        signatureHelpTriggerCharacters: ['('],
        signatureHelpRetriggerCharacters: [','],
        provideSignatureHelp(model, position) {
          // Find the function name before the current cursor, handling nested parens
          const textUpToCursor = model.getValueInRange({
            startLineNumber: 1,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });
          // Walk backward from cursor to find the innermost function call
          let depth = 0;
          let i = textUpToCursor.length - 1;
          // Scan backward from cursor for function call pattern: funcName(
          while (i >= 0) {
            const ch = textUpToCursor[i];
            if (ch === ')') { depth++; i--; continue; }
            if (ch === '(') {
              if (depth === 0) {
                // Found the opening paren — extract function name before it
                const before = textUpToCursor.substring(0, i);
                const funcMatch = before.match(/(\w+)\s*$/);
                if (funcMatch) {
                  const funcs = getFunctions(dbType);
                  const fn = funcs.find((f) => f.name.toLowerCase() === funcMatch[1].toLowerCase());
                  if (fn) {
                    return {
                      value: {
                        signatures: [{
                          label: fn.label,
                          documentation: fn.documentation || '',
                          parameters: fn.params.map((p) => ({
                            label: p.label,
                            documentation: p.documentation || '',
                          })),
                        }],
                        activeSignature: 0,
                        activeParameter: 0,
                      },
                      dispose: () => {},
                    };
                  }
                }
                return null;
              }
              depth--;
            }
            i--;
          }
          return null;
        },
      });
      disposablesRef.current.push(disp);
    },
    [dbType],
  );

  const handleMount = useCallback(
    (ed: editor.IStandaloneCodeEditor, monaco: typeof import('monaco-editor')) => {
      editorRef.current = ed;
      monacoRef.current = monaco;

      // Register Ctrl+Enter execute action
      ed.addAction({
        id: 'execute-sql',
        label: '执行 SQL',
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
        run: () => {
          const sqlToExec = resolveSqlToExecute(ed, ed.getValue());
          if (sqlToExec) {
            onExecuteRef.current(sqlToExec);
          }
        },
      });

      ed.focus();

      // Register completion and signature help
      registerCompletion(monaco);
      registerSignatureHelp(monaco);

      if (onMount) onMount(ed);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [registerCompletion, registerSignatureHelp],
  );

  // Re-register providers when dbType or schema changes
  useEffect(() => {
    if (monacoRef.current) {
      cleanupProviders();
      registerCompletion(monacoRef.current);
      registerSignatureHelp(monacoRef.current);
    }
  }, [dbType, schema, cleanupProviders, registerCompletion, registerSignatureHelp]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanupProviders();
  }, [cleanupProviders]);

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
          fontFamily: "ui-monospace, 'Cascadia Code', 'Segoe UI Mono', Consolas, monospace",
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 8, bottom: 8 },
          renderLineHighlight: 'line',
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
          suggest: { showWords: false },
        }}
      />
    </Suspense>
  );
};

// ── SQL Keywords ──

function getKeywords(dbType: string): string[] {
  const common = [
    'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT', 'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL',
    'AS', 'ON', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER', 'CROSS', 'FULL', 'NATURAL',
    'GROUP', 'BY', 'ORDER', 'ASC', 'DESC', 'HAVING', 'LIMIT', 'OFFSET', 'UNION', 'ALL',
    'INSERT', 'INTO', 'VALUES', 'UPDATE', 'SET', 'DELETE', 'CREATE', 'ALTER', 'DROP',
    'TABLE', 'INDEX', 'VIEW', 'IF', 'EXISTS', 'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES',
    'DEFAULT', 'NULL', 'NOT', 'UNIQUE', 'CHECK', 'CONSTRAINT', 'CASCADE',
    'COUNT', 'SUM', 'AVG', 'MAX', 'MIN', 'DISTINCT', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
    'CAST', 'COALESCE', 'NULLIF', 'EXISTS', 'ANY', 'SOME', 'TOP', 'OFFSET', 'FETCH', 'NEXT',
    'ROWS', 'ONLY', 'WITH', 'RECURSIVE', 'RETURNING', 'TRUNCATE', 'EXPLAIN', 'ANALYZE',
    'BEGIN', 'COMMIT', 'ROLLBACK', 'TRANSACTION', 'SAVEPOINT', 'GRANT', 'REVOKE',
  ];
  if (dbType === 'mysql') {
    return [...common, 'SHOW', 'DATABASES', 'TABLES', 'COLUMNS', 'USE', 'ENGINE', 'AUTO_INCREMENT',
      'CHARSET', 'COLLATE', 'TINYINT', 'SMALLINT', 'MEDIUMINT', 'BIGINT', 'FLOAT', 'DOUBLE',
      'DECIMAL', 'VARCHAR', 'CHAR', 'TEXT', 'LONGTEXT', 'MEDIUMTEXT', 'DATE', 'DATETIME',
      'TIMESTAMP', 'TIME', 'YEAR', 'ENUM', 'BLOB', 'LONGBLOB', 'MEDIUMBLOB', 'TINYBLOB',
      'REPLACE', 'LOAD', 'DATA', 'INFILE', 'FORCE', 'IGNORE', 'LOCK', 'UNLOCK', 'PROCEDURE',
      'FUNCTION', 'TRIGGER', 'EVENT', 'CALL', 'SIGNED', 'UNSIGNED', 'ZEROFILL',
    ];
  }
  if (dbType === 'postgresql') {
    return [...common, 'ILIKE', 'SIMILAR', 'SERIAL', 'BIGSERIAL', 'SMALLSERIAL', 'BOOLEAN',
      'INTEGER', 'NUMERIC', 'REAL', 'MONEY', 'BYTEA', 'UUID', 'JSON', 'JSONB', 'ARRAY',
      'INTERVAL', 'SCHEMA', 'TABLESPACE', 'ROLE', 'USER', 'DATABASE', 'TEMPLATE',
      'LANGUAGE', 'EXTENSION', 'FOREIGN', 'WRAPPER', 'SERVER', 'SEQUENCE', 'DO', 'NOTHING',
      'CONFLICT', 'RETURNING', 'WINDOW', 'OVER', 'PARTITION', 'LATERAL',
    ];
  }
  if (dbType === 'mssql') {
    return [...common, 'NVARCHAR', 'NCHAR', 'NTEXT', 'MONEY', 'SMALLMONEY', 'DATETIME2',
      'SMALLDATETIME', 'DATETIMEOFFSET', 'BIT', 'IMAGE', 'HIERARCHYID', 'UNIQUEIDENTIFIER',
      'SQL_VARIANT', 'XML', 'GEOGRAPHY', 'GEOMETRY', 'ROWVERSION', 'FILESTREAM',
      'SCHEMA', 'PROCEDURE', 'EXEC', 'EXECUTE', 'PRINT', 'RAISERROR', 'THROW', 'TRY', 'CATCH',
      'OUTPUT', 'IDENTITY', 'ROWCOUNT', 'NOCOUNT', 'MERGE', 'PIVOT', 'UNPIVOT',
      'CROSS', 'APPLY', 'OUTER', 'CTE',
    ];
  }
  return common;
}

// ── SQL Functions ──

interface FunctionDef {
  name: string;
  label: string;
  insertText: string;
  documentation: string;
  params: { label: string; documentation?: string }[];
}

function getFunctions(dbType: string): FunctionDef[] {
  const common: FunctionDef[] = [
    { name: 'COUNT', label: 'COUNT(expr)', insertText: 'COUNT(${1:expr})', params: [{ label: 'expr', documentation: '表达式或 *' }], documentation: '返回匹配条件的行数' },
    { name: 'SUM', label: 'SUM(expr)', insertText: 'SUM(${1:expr})', params: [{ label: 'expr' }], documentation: '返回数值列的总和' },
    { name: 'AVG', label: 'AVG(expr)', insertText: 'AVG(${1:expr})', params: [{ label: 'expr' }], documentation: '返回数值列的平均值' },
    { name: 'MAX', label: 'MAX(expr)', insertText: 'MAX(${1:expr})', params: [{ label: 'expr' }], documentation: '返回列的最大值' },
    { name: 'MIN', label: 'MIN(expr)', insertText: 'MIN(${1:expr})', params: [{ label: 'expr' }], documentation: '返回列的最小值' },
    { name: 'COALESCE', label: 'COALESCE(val1, val2, ...)', insertText: 'COALESCE(${1:val1}, ${2:val2})', params: [{ label: 'val1' }, { label: 'val2', documentation: 'fallback' }], documentation: '返回第一个非 NULL 值' },
    { name: 'CAST', label: 'CAST(expr AS type)', insertText: 'CAST(${1:expr} AS ${2:type})', params: [{ label: 'expr' }, { label: 'type' }], documentation: '类型转换' },
    { name: 'NULLIF', label: 'NULLIF(expr1, expr2)', insertText: 'NULLIF(${1:expr1}, ${2:expr2})', params: [{ label: 'expr1' }, { label: 'expr2' }], documentation: '两值相等返回 NULL' },
    { name: 'CASE', label: 'CASE WHEN cond THEN result END', insertText: 'CASE WHEN ${1:condition} THEN ${2:result} ELSE ${3:default} END', params: [{ label: 'condition' }, { label: 'result' }, { label: 'default', documentation: '可选' }], documentation: '条件表达式' },
    { name: 'SUBSTRING', label: 'SUBSTRING(str, start, length)', insertText: 'SUBSTRING(${1:str}, ${2:start}, ${3:length})', params: [{ label: 'str' }, { label: 'start' }, { label: 'length' }], documentation: '截取子字符串' },
    { name: 'CONCAT', label: 'CONCAT(str1, str2, ...)', insertText: 'CONCAT(${1:str1}, ${2:str2})', params: [{ label: 'str1' }, { label: 'str2' }], documentation: '字符串拼接' },
    { name: 'UPPER', label: 'UPPER(str)', insertText: 'UPPER(${1:str})', params: [{ label: 'str' }], documentation: '转大写' },
    { name: 'LOWER', label: 'LOWER(str)', insertText: 'LOWER(${1:str})', params: [{ label: 'str' }], documentation: '转小写' },
    { name: 'TRIM', label: 'TRIM(str)', insertText: 'TRIM(${1:str})', params: [{ label: 'str' }], documentation: '去除两端空格' },
    { name: 'LENGTH', label: 'LENGTH(str)', insertText: 'LENGTH(${1:str})', params: [{ label: 'str' }], documentation: '字符串长度' },
    { name: 'REPLACE', label: 'REPLACE(str, old, new)', insertText: 'REPLACE(${1:str}, ${2:old}, ${3:new})', params: [{ label: 'str' }, { label: 'old' }, { label: 'new' }], documentation: '替换子字符串' },
    { name: 'NOW', label: 'NOW()', insertText: 'NOW()', params: [], documentation: '当前日期时间' },
    { name: 'CURDATE', label: 'CURDATE()', insertText: 'CURDATE()', params: [], documentation: '当前日期' },
    { name: 'DATEDIFF', label: 'DATEDIFF(date1, date2)', insertText: 'DATEDIFF(${1:date1}, ${2:date2})', params: [{ label: 'date1' }, { label: 'date2' }], documentation: '日期差' },
    { name: 'DATEADD', label: 'DATEADD(interval, n, date)', insertText: 'DATEADD(${1:day}, ${2:1}, ${3:date})', params: [{ label: 'interval' }, { label: 'n' }, { label: 'date' }], documentation: '日期加法' },
    { name: 'YEAR', label: 'YEAR(date)', insertText: 'YEAR(${1:date})', params: [{ label: 'date' }], documentation: '提取年份' },
    { name: 'MONTH', label: 'MONTH(date)', insertText: 'MONTH(${1:date})', params: [{ label: 'date' }], documentation: '提取月份' },
    { name: 'DAY', label: 'DAY(date)', insertText: 'DAY(${1:date})', params: [{ label: 'date' }], documentation: '提取日期' },
  ];

  if (dbType === 'mysql') {
    return [...common,
      { name: 'DATE_FORMAT', label: 'DATE_FORMAT(date, format)', insertText: 'DATE_FORMAT(${1:date}, ${2:format})', params: [{ label: 'date' }, { label: 'format' }], documentation: '格式化日期' },
      { name: 'IFNULL', label: 'IFNULL(expr, val)', insertText: 'IFNULL(${1:expr}, ${2:val})', params: [{ label: 'expr' }, { label: 'val' }], documentation: 'NULL 替换为指定值' },
      { name: 'GROUP_CONCAT', label: 'GROUP_CONCAT(expr)', insertText: 'GROUP_CONCAT(${1:expr})', params: [{ label: 'expr' }], documentation: '分组拼接字符串' },
      { name: 'FIND_IN_SET', label: 'FIND_IN_SET(str, list)', insertText: 'FIND_IN_SET(${1:str}, ${2:list})', params: [{ label: 'str' }, { label: 'list' }], documentation: '在逗号分隔列表中查找' },
    ];
  }
  if (dbType === 'postgresql') {
    return [...common,
      { name: 'TO_CHAR', label: 'TO_CHAR(expr, format)', insertText: 'TO_CHAR(${1:expr}, ${2:format})', params: [{ label: 'expr' }, { label: 'format' }], documentation: '格式化输出' },
      { name: 'STRING_AGG', label: 'STRING_AGG(expr, delim)', insertText: 'STRING_AGG(${1:expr}, ${2:delim})', params: [{ label: 'expr' }, { label: 'delim' }], documentation: '分组拼接字符串' },
      { name: 'ARRAY_AGG', label: 'ARRAY_AGG(expr)', insertText: 'ARRAY_AGG(${1:expr})', params: [{ label: 'expr' }], documentation: '聚合为数组' },
    ];
  }
  if (dbType === 'mssql') {
    return [...common,
      { name: 'GETDATE', label: 'GETDATE()', insertText: 'GETDATE()', params: [], documentation: '当前日期时间' },
      { name: 'DATEADD', label: 'DATEADD(interval, n, date)', insertText: 'DATEADD(${1:day}, ${2:1}, ${3:date})', params: [{ label: 'interval' }, { label: 'n' }, { label: 'date' }], documentation: '日期加法 (MSSQL)' },
      { name: 'DATEDIFF', label: 'DATEDIFF(interval, d1, d2)', insertText: 'DATEDIFF(${1:day}, ${2:d1}, ${3:d2})', params: [{ label: 'interval' }, { label: 'd1' }, { label: 'd2' }], documentation: '日期差 (MSSQL 三参数)' },
      { name: 'STUFF', label: 'STUFF(str, start, len, replace)', insertText: 'STUFF(${1:str}, ${2:start}, ${3:len}, ${4:replace})', params: [{ label: 'str' }, { label: 'start' }, { label: 'len' }, { label: 'replace' }], documentation: '替换字符串中指定位置内容' },
      { name: 'CHARINDEX', label: 'CHARINDEX(substr, str)', insertText: 'CHARINDEX(${1:substr}, ${2:str})', params: [{ label: 'substr' }, { label: 'str' }], documentation: '查找子串位置' },
      { name: 'ISNULL', label: 'ISNULL(expr, val)', insertText: 'ISNULL(${1:expr}, ${2:val})', params: [{ label: 'expr' }, { label: 'val' }], documentation: 'NULL 替换' },
      { name: 'ROW_NUMBER', label: 'ROW_NUMBER() OVER(...)', insertText: 'ROW_NUMBER() OVER (ORDER BY ${1:col})', params: [{ label: 'col' }], documentation: '行号窗口函数' },
    ];
  }
  return common;
}

// ── Table Reference Detection ──

interface TableRef {
  name: string;
  alias: string | null;
}

function detectTableRefs(textUpToCursor: string, schema: DbSchema | null | undefined): TableRef[] {
  if (!schema?.tables) return [];
  const refs: TableRef[] = [];
  // Match FROM/JOIN table references: "FROM users u" or "FROM users AS u" or "JOIN orders o"
  const tableNames = schema.tables.map((t) => t.name).join('|');
  if (!tableNames) return [];
  const re = new RegExp(
    `(?:FROM|JOIN|INTO|UPDATE)\\s+(${tableNames})(?:\\s+(?:AS\\s+)?(\\w+))?`,
    'gi',
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(textUpToCursor)) !== null) {
    refs.push({ name: m[1], alias: m[2] || null });
  }
  return refs;
}
