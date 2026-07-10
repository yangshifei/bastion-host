# Research: SQL 编辑器智能补全

**Feature**: 006-sql-editor-intelligence
**Date**: 2026-07-08

## 1. Monaco Editor SQL Completion Provider

**Decision**: 使用 `monaco.languages.registerCompletionItemProvider('sql', provider)` 自定义补全提供者，配合 Monaco 内置 SQL 语言 tokenizer 做上下文感知。

**Rationale**:
- Monaco Editor 内置了 `sql` 语言模式，提供基础 token 解析（关键字、标识符、字符串、注释）
- `CompletionItemProvider` 接口支持 `triggerCharacters`（如 `.`）和上下文过滤
- 可在 `provideCompletionItems` 中根据 `model.getPosition()` 和 `model.getValueInRange()` 获取当前输入前缀和周围文本，实现上下文感知
- `monaco.languages.CompletionItemKind` 提供 Keyword / Field / Function / Variable 等分类，与 FR-002（分组显示）对应

**Alternatives considered**:
- 使用 Monaco SQL 语言内置补全：内置补全不包含表名/字段名等动态数据
- 使用 CodeMirror 6：项目已有 Monaco 依赖，重构成本高
- 使用 `@anthropic/claude-sdk` AI 补全：延迟不可控，不符合 <300ms 要求

## 2. 后端 Schema API 设计

**Decision**: 新增 `GET /api/database/:id/schema?database=X` 端点，返回 `{tables: [{name, columns: [{name, type, nullable, key_type}]}]}` 格式。

**Rationale**:
- 现有 `getObjects` 仅返回表名列表，不包含列信息。新增独立端点避免 breaking change
- 一次请求获取完整 schema（所有表 + 列），减少网络往返
- 返回格式兼容 Monaco `CompletionItem` 所需的 `detail`（列类型）和 `documentation`（可空/键类型）
- 复用现有 `authenticate` 中间件和 `getConnection` 解密逻辑，满足 FR-013 安全要求

**Alternatives considered**:
- 扩展现有 `getObjects` 返回列信息：breaking change，影响现有数据导入/导出组件
- 前端分别调用"获取表列表"和"获取每表列信息"：N+1 请求问题，500 表场景需 501 次请求
- WebSocket 推送 schema 变更：过度设计，v1 不需要实时推送

## 3. MSSQL 列元数据查询

**Decision**: 在 `dbQueryService.getSchema` 中，对 MSSQL 使用 `INFORMATION_SCHEMA.COLUMNS` 查询，与 MySQL/PG 保持一致。

**Rationale**:
- MSSQL 的 `INFORMATION_SCHEMA.COLUMNS` 支持 `TABLE_CATALOG` 过滤（与 `getObjects` 修复后的模式一致）
- 需设置 `conn.database = db`（与 `getObjects` 修复一致），确保 INFORMATION_SCHEMA 查询正确的数据库
- 列元数据包含 COLUMN_NAME、DATA_TYPE、IS_NULLABLE、COLUMN_DEFAULT，满足补全提示需求

**MySQL 查询**:
```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE AS type, IS_NULLABLE AS nullable, COLUMN_KEY AS key_type
FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME, ORDINAL_POSITION
```

**PostgreSQL 查询**:
```sql
SELECT table_name, column_name, data_type AS type, is_nullable AS nullable
FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position
```

**MSSQL 查询**:
```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE AS type, IS_NULLABLE AS nullable
FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_CATALOG = @db ORDER BY TABLE_NAME, ORDINAL_POSITION
```

## 4. Monaco SignatureHelpProvider（函数参数提示）

**Decision**: 使用 `monaco.languages.registerSignatureHelpProvider('sql', provider)` 提供函数签名提示。

**Rationale**:
- Monaco 原生支持 `SignatureHelpProvider`，在用户输入 `(` 后触发
- `signatures` 数组可包含多个重载（如 `COUNT(*)` vs `COUNT(DISTINCT expr)`）
- `parameters` 数组定义每个参数的 label 和可选的 documentation
- 按数据库方言注册不同的函数签名集（MySQL / PG / MSSQL 内建函数差异较大）

**Alternatives considered**:
- 在 CompletionItem 中嵌入参数提示：CompletionItem 的 `insertText` 支持 snippet 语法 `${1:param}`，但无法动态显示多参数
- 纯前端函数列表：缺失参数说明，不符合 FR-008

## 5. 选中部分 SQL 执行

**Decision**: 在 Monaco Editor 事件处理中，通过 `editor.getSelection()` 判断是否有选中文本。有选中 → 执行选中文本；无选中 → 执行全部内容。

**Rationale**:
- `editor.getModel().getValueInRange(editor.getSelection())` 获取选中文本
- 无需复杂语法拆分——将选中文本作为独立 SQL 发送给后端
- 后端 `execute` 端点已处理单语句/多语句检测，现有逻辑足够
- Ctrl+Enter 快捷键通过 Monaco 的 `addAction` 注册，不干扰编辑器默认行为

**Alternatives considered**:
- 智能语句边界检测（自动识别光标所在语句）：实现复杂度高（需 SQL parser），v1 不在范围内
- 工具栏按钮切换"全部/选中"模式：增加操作步骤，不如自动检测直观

## 6. 元数据缓存与刷新策略

**Decision**: 前端使用 React state 缓存 schema 数据，key = `assetId + database`。数据库切换时清除旧缓存并重新加载。

**Rationale**:
- 无需额外缓存库（如 TanStack Query），schema 数据量可控（500 表 × 50 列 ≈ 25KB JSON）
- React state + useEffect 触发刷新，与现有 `loadDatabases` / `loadObjects` 模式一致
- 不实现 TTL 过期：用户操作（切换数据库）驱动刷新，避免不必要的后台请求

**Alternatives considered**:
- Service Worker 缓存：过度设计，schema 不适合离线使用
- WebSocket 推送 schema 变更：v2 功能，v1 通过手动切换数据库或刷新按钮更新
