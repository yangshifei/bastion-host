# Data Model: SQL 编辑器智能补全

**Feature**: 006-sql-editor-intelligence
**Date**: 2026-07-08

## Entities

### 1. SqlKeywords (前端静态数据)

按数据库类型分类的 SQL 关键字和保留字集合。

| Field | Type | Description |
|-------|------|-------------|
| `keywords` | `Record<DbType, string[]>` | MySQL / PostgreSQL / MSSQL 各自的关键字列表 |
| `builtinFunctions` | `Record<DbType, FunctionSignature[]>` | 各方言的内置函数签名 |

关键字按类别分组：
- **DML**: SELECT, FROM, WHERE, JOIN, INSERT, UPDATE, DELETE, ORDER BY, GROUP BY, HAVING, LIMIT, OFFSET
- **DDL**: CREATE, ALTER, DROP, TABLE, INDEX, VIEW, COLUMN
- **Operators**: AND, OR, NOT, IN, BETWEEN, LIKE, IS NULL, EXISTS
- **Types**: INT, VARCHAR, TEXT, DATE, TIMESTAMP, BOOLEAN, DECIMAL

### 2. FunctionSignature (前端静态数据)

| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | 函数名（大写） |
| `label` | `string` | 显示用签名，如 `COUNT(expr)` |
| `insertText` | `string` | 补全插入文本，支持 snippet `${1:expr}` |
| `parameters` | `Parameter[]` | 参数列表（用于 SignatureHelp） |
| `documentation` | `string` | 函数简要说明 |

**Parameter**:
| Field | Type | Description |
|-------|------|-------------|
| `label` | `string` | 参数名 |
| `documentation` | `string` | 参数说明 |
| `optional` | `boolean` | 是否可选 |

### 3. DbSchema (后端 API 响应 → 前端缓存)

从 information_schema 获取的数据库完整 schema，缓存在前端。

```typescript
interface DbSchema {
  tables: TableSchema[];
}

interface TableSchema {
  name: string;
  columns: ColumnSchema[];
}

interface ColumnSchema {
  name: string;
  type: string;       // VARCHAR(50), INT, TEXT, etc.
  nullable: string;   // "YES" | "NO"
  key_type?: string;  // "PRI" | "MUL" | "UNI" (MySQL), "" (others)
}
```

**验证规则**:
- `tables` 数组按 `name` 字母排序
- `columns` 数组按 `ORDINAL_POSITION` 排序（与数据库定义顺序一致）
- 空库场景：`tables` 为空数组 `[]`

### 4. CompletionContext (编辑器运行时状态)

Monaco Editor 补全提供者在 `provideCompletionItems` 调用时计算的上下文。

| Field | Type | Description |
|-------|------|-------------|
| `prefix` | `string` | 当前输入的单词前缀 |
| `cursorOffset` | `number` | 光标在全文中的偏移位置 |
| `inString` | `boolean` | 光标是否在字符串字面量内（补全应跳过） |
| `inComment` | `boolean` | 光标是否在 SQL 注释内（补全应跳过） |
| `tableRefs` | `TableRef[]` | 已识别的表引用列表 |
| `activeTableAlias` | `string \| null` | 若光标在 `alias.` 之后，记录别名 |

**TableRef**:
| Field | Type | Description |
|-------|------|-------------|
| `name` | `string` | 表名 |
| `alias` | `string \| null` | 别名（如 "u"），无别名时为 null |
| `range` | `{start, end}` | 表名在文本中的位置范围 |

### 5. EditorAction (Monaco Action 注册)

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | `"execute-sql"` |
| `label` | `string` | `"执行 SQL"` |
| `keybindings` | `KeyCode[]` | `[monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter]` |
| `run` | `function` | 获取选中文本或全文，调用 `execute` |

## State Transitions

### 元数据加载状态

```
IDLE → LOADING → LOADED  (正常流程)
              → DEGRADED (API 失败，静默降级)
LOADED → LOADING → LOADED (切换数据库)
DEGRADED → LOADING → LOADED (重试成功)
```

### 补全触发状态

```
IDLE → (用户输入 ≥2 字符) → SHOWING
SHOWING → (Escape / 失去焦点) → IDLE
SHOWING → (继续输入) → FILTERING → SHOWING
SHOWING → (Enter/Tab/Click) → INSERTED → IDLE
```
