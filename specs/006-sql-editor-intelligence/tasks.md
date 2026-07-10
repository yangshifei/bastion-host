# Tasks: SQL 编辑器智能补全

**Input**: Design documents from `/specs/006-sql-editor-intelligence/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/schema-api.md

**Tests**: Not explicitly requested in feature specification — test tasks omitted.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

Based on plan.md structure (web application):

```text
client/src/
├── components/
│   └── SqlEditor.tsx          # REWRITE: textarea → Monaco Editor
├── pages/
│   └── DatabaseWorkspace.tsx  # MODIFY: wire Monaco, execute-on-select
├── services/
│   └── databaseService.ts     # ADD: getSchema()
└── completions/
    ├── keywords.ts             # ADD: keyword sets per dialect
    ├── functions.ts            # ADD: function signatures per dialect
    └── completionProvider.ts   # ADD: Monaco CompletionItemProvider

server/src/
├── routes/
│   └── database.ts            # ADD: GET /:id/schema route
└── services/
    └── dbQueryService.ts      # ADD: getSchema() method
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Verify existing dependencies — nothing new to install.

- [x] T001 Verify `@monaco-editor/react` v4.7+ available in client/node_modules, install if missing via `npm install` in client/

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Backend schema API + Monaco Editor replacement — MUST complete before any user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T002 [P] Implement `getSchema(assetId, database)` in server/src/services/dbQueryService.ts — query INFORMATION_SCHEMA.COLUMNS for MySQL/PG/MSSQL, set `conn.database = database` for MSSQL, return `{tables: [{name, columns: [{name, type, nullable, key_type}]}]}`
- [x] T003 [P] Add `GET /:id/schema` route in server/src/routes/database.ts — parse `database` query param, call `dbQueryService.getSchema`, wrap with `authenticate` middleware per FR-013
- [x] T004 [P] Add `getSchema(assetId, database)` in client/src/services/databaseService.ts — call `GET /api/database/:id/schema?database=X`, return `ApiResponse<DbSchema>`
- [x] T005 Replace `<textarea>` with Monaco Editor in client/src/components/SqlEditor.tsx — import `Editor` from `@monaco-editor/react`, configure `language="sql"`, expose `editorRef` via `forwardRef` / `useImperativeHandle` for external access to editor instance
- [x] T006 Wire Monaco Editor into client/src/pages/DatabaseWorkspace.tsx — replace `<textarea>` JSX with `<SqlEditor>`, pass `sql`/`setSql` as props, set language based on `dbType` (mysql → `"sql"`, postgresql → `"sql"` via `"pgsql"`, mssql → `"sql"`)

**Checkpoint**: Monaco Editor rendering, backend schema API returning correct data, all existing execute/format/clear buttons still work with new editor.

---

## Phase 3: User Story 1 - SQL 关键字自动补全 (Priority: P1) 🎯 MVP

**Goal**: 用户输入 ≥2 字符后弹出关键字+表名补全列表，按类别分组，支持键盘导航。

**Independent Test**: 打开 SQL 窗口 → 选数据库 → 输入 "SEL" → 弹出列表含 "SELECT" → 按 Enter 补全。

### Implementation for User Story 1

- [x] T007 [P] [US1] Create SQL keyword sets in client/src/completions/keywords.ts — define `MYSQL_KEYWORDS`, `PG_KEYWORDS`, `MSSQL_KEYWORDS` arrays with DML/DDL/operator/type categorization per FR-002/FR-003
- [x] T008 [P] [US1] Load schema metadata in DatabaseWorkspace — call `getSchema()` when `selectedDb` changes, store in `useState<DbSchema | null>`, pass to SqlEditor as `schema` prop
- [x] T009 [US1] Create Monaco CompletionProvider in client/src/completions/completionProvider.ts — export function `registerSqlCompletion(monaco, dbType, schema)` that registers `CompletionItemProvider` for `"sql"` language
- [x] T010 [US1] Implement keyword completion in completionProvider — add `CompletionItemKind.Keyword` items filtered by prefix (≥2 chars per FR-001), sorted by category (keyword > table > function per FR-002)
- [x] T011 [US1] Implement table name completion in completionProvider — add `CompletionItemKind.Struct` items from `schema.tables[].name`, only when schema is non-null
- [x] T012 [US1] Implement trigger character `.` for alias column completion — register `triggerCharacters: ['.']` in provider, detect alias before dot, suggest columns for matched table
- [x] T013 [US1] Implement comment/string detection in completionProvider — check token at cursor position via Monaco tokenizer, skip completion if inside `--` comment, `/* */` block comment, or string literal (FR-012)

**Checkpoint**: 关键字和表名补全工作正常，Escape 关闭列表，注释/字符串内不触发。

---

## Phase 4: User Story 4 - 执行全部或选中 SQL (Priority: P1) 🎯 MVP

**Goal**: 用户选中文本后按 Ctrl+Enter 仅执行选中部分；无选中时执行全部。

**Independent Test**: 输入 "SELECT 1;\nSELECT 2;" → 选中第一行 → Ctrl+Enter → 仅返回 1 的结果。

### Implementation for User Story 4

- [x] T014 [US4] Register Ctrl+Enter action in SqlEditor — use `editor.addAction({id: 'execute-sql', keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter]})`, callback gets selection text or full model value
- [x] T015 [US4] Wire execute action in DatabaseWorkspace — modify `execute()` to accept optional `forceSql?: string` parameter; when selection exists, execute selected text instead of `sql` state per FR-009; ensure focus stays in editor after execution

**Checkpoint**: 选中执行和全部执行均正确，快捷键响应灵敏。

---

## Phase 5: User Story 2 - 字段名智能提示 (Priority: P2)

**Goal**: 识别 SQL 上下文中的表名引用（FROM/JOIN/INTO），在后续输入位置提供该表的列名提示。

**Independent Test**: 输入 "SELECT * FROM users WHERE " → 开始输入列名 → 弹出 users 表的列列表。

### Implementation for User Story 2

- [x] T016 [US2] Implement table reference detection in completionProvider — parse current statement text to extract FROM/JOIN/INTO/UPDATE table references with optional aliases (`table alias` and `table AS alias` per FR-006/FR-007), build `TableRef[]` map
- [x] T017 [US2] Implement column name completion in completionProvider — when cursor is after a known table reference (e.g., in SELECT/WHERE/ON clause), add `CompletionItemKind.Field` items from matched table's `columns[]`; support alias-prefixed lookup (`u.name` → users.name per FR-007)
- [x] T018 [US2] Handle multi-table JOIN context in completionProvider — when multiple tables referenced, suggest columns from all referenced tables with `detail` showing table name for disambiguation

**Checkpoint**: 单表列提示、别名列提示、多表 JOIN 列提示均正常工作。

---

## Phase 6: User Story 3 - 内置函数提示与参数提示 (Priority: P3)

**Goal**: 输入函数名时弹出补全，选中后显示参数签名提示。

**Independent Test**: 输入 "COU" → 弹出 "COUNT(expr)" → 选中后光标定位括号内 → 显示参数提示。

### Implementation for User Story 3

- [x] T019 [P] [US3] Create function signatures in client/src/completions/functions.ts — define `MYSQL_FUNCTIONS`, `PG_FUNCTIONS`, `MSSQL_FUNCTIONS` arrays with `name`, `label`, `insertText` (snippet format), `parameters[]`, `documentation` per data-model.md
- [x] T020 [US3] Add function completion items in completionProvider — add `CompletionItemKind.Function` items filtered by prefix; use `insertTextRules.InsertAsSnippet` for snippet-based insertion (`${1:param}`)
- [x] T021 [US3] Register SignatureHelpProvider for function parameters — use `monaco.languages.registerSignatureHelpProvider('sql', provider)` with `triggerCharacters: ['(']`; provide `SignatureHelp` with `signatures[]` and `activeParameter` tracking per FR-008

**Checkpoint**: 函数补全显示参数签名，括号内可看到参数提示。

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Error handling, edge cases, visual polish.

- [x] T022 [P] Implement metadata degradation UI in SqlEditor/DatabaseWorkspace — when schema load fails, show dismissable warning bar "表名/字段名提示暂时不可用" per FR-014; keyword+function completion still works
- [x] T023 [P] Limit completion list to 50 items for large schemas — in completionProvider, slice results to 50 when schema has >1000 total items per edge case
- [ ] T024 Run quickstart.md validation — verify all 8 scenarios (VS-1 through VS-8) pass end-to-end

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — verify immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — BLOCKS all user stories
- **Phase 3 (US1 - Keywords, P1)**: Depends on Phase 2 — No dependencies on other stories
- **Phase 4 (US4 - Execute, P1)**: Depends on Phase 2 — No dependencies on other stories, CAN run parallel with US1
- **Phase 5 (US2 - Columns, P2)**: Depends on Phase 2 + Phase 3 (uses CompletionProvider framework from US1)
- **Phase 6 (US3 - Functions, P3)**: Depends on Phase 2 + Phase 3 (uses CompletionProvider framework from US1)
- **Phase 7 (Polish)**: Depends on all desired user stories

### User Story Dependencies

```
Phase 2 (Foundational)
    ├── Phase 3: US1 Keywords (P1) 🎯 MVP
    │       ├── Phase 5: US2 Columns (P2)
    │       └── Phase 6: US3 Functions (P3)
    └── Phase 4: US4 Execute (P1) 🎯 MVP  ← independent of US1
```

- **US1 (Keywords)** and **US4 (Execute)** are both P1 and INDEPENDENT — can be built in parallel
- **US2 (Columns)** depends on US1's CompletionProvider
- **US3 (Functions)** depends on US1's CompletionProvider

### Within Each User Story

- Tasks marked [P] can run in parallel (different files)
- Core implementation after parallel tasks complete
- Story complete before moving to next priority

### Parallel Opportunities

```
Phase 2 (all [P] — parallel):
  T002 (backend service) || T003 (backend route) || T004 (frontend service)
  Then: T005 → T006 (sequential, same component)

Phase 3 (US1):
  T007 (keywords data) || T008 (schema loading)
  Then: T009 → T010 → T011 → T012 → T013 (sequential, same provider)

Phase 5 (US2):
  T016 → T017 → T018 (sequential, same provider logic)

Phase 6 (US3):
  T019 (function data) || T020 + T021 can start after T019

Phase 7 (all [P]):
  T022 || T023 || T024
```

---

## Parallel Example: US1 Keywords + US4 Execute (both P1)

```bash
# Developer A: US1 Keywords completion
Task: "T007 Create SQL keyword sets in client/src/completions/keywords.ts"
Task: "T008 Load schema metadata in DatabaseWorkspace"
Task: "T009 Create Monaco CompletionProvider in client/src/completions/completionProvider.ts"
# ... rest of US1

# Developer B: US4 Selected execution (runs in parallel with US1)
Task: "T014 Register Ctrl+Enter action in SqlEditor"
Task: "T015 Wire execute action in DatabaseWorkspace"
```

---

## Implementation Strategy

### MVP First (US1 + US4)

1. Complete Phase 1: Setup (T001)
2. Complete Phase 2: Foundational (T002-T006) 🔒 BLOCKING
3. Complete Phase 3: US1 Keywords (T007-T013) 🎯
4. Complete Phase 4: US4 Execute (T014-T015) 🎯
5. **STOP and VALIDATE**: Test US1 + US4 independently — keyword completion + selected execution
6. Deploy/demo if ready (already provides 80% of value)

### Incremental Delivery

1. Phase 1+2 → Monaco Editor with schema API (foundation)
2. + US1 → Keywords + table names completion (MVP!)
3. + US4 → Selected execution (MVP!)
4. + US2 → Context-aware column hints
5. + US3 → Function signatures
6. + Phase 7 → Polish, degradation, validation

### Suggested MVP Scope

**Phase 1 + 2 + 3 + 4** (T001-T015): Monaco Editor with keyword completion, table name completion, and selected SQL execution. This is a fully usable SQL editor that already improves the current textarea by 10x.

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- The existing `<textarea>`-based SQL input is fully replaced by Monaco Editor — backward compatibility not required
- All MSSQL-specific code paths must use `conn.database = database` pattern (matching prior fixes in `getObjects`)
