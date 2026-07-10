# Implementation Plan: SQL 编辑器智能补全

**Branch**: `006-sql-editor-intelligence` | **Date**: 2026-07-08 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-sql-editor-intelligence/spec.md`

## Summary

将当前 SQL 工作区中的 `<textarea>` 替换为 Monaco Editor（项目已有依赖），通过 Monaco 的 CompletionProvider / SignatureHelpProvider 实现四类补全能力：SQL 关键字（按 DB 方言）、表名/字段名（从 information_schema 后端 API 获取元数据）、内置函数（含参数签名提示）。同时改造执行逻辑，支持"选中部分执行"与"全部执行"两种模式。

## Technical Context

**Language/Version**: TypeScript 5.x (strict mode), Node.js 18 (Docker)

**Primary Dependencies**: React 18, Monaco Editor (`@monaco-editor/react` v4.7), TDesign React, Vite 6, Express 4, mysql2/pg/mssql

**Storage**: MySQL 8.0 (bastion_host 元数据库), 目标数据库 MySQL/PG/MSSQL (information_schema)

**Testing**: vitest (server), manual browser testing (client)

**Target Platform**: Docker Compose (Alpine Linux container), nginx reverse proxy, browser client

**Project Type**: Web application (React SPA + Express API)

**Performance Goals**: 补全弹窗 <300ms (SC-001), 元数据加载 <3s (SC-002), 支持 500 表 × 50 列 (SC-007)

**Constraints**: RBAC 中间件复用, JWT 认证, 已有 `/database/:id/*` 路由模式

**Scale/Scope**: 3 种数据库方言 (MySQL/PG/MSSQL), v1 范围: DML + 基本 DDL, 不含跨库

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First | ✅ PASS | FR-013: 元数据 API 复用 RBAC + JWT 认证。无新凭证暴露面 |
| II. Browser-Native | ✅ PASS | Monaco Editor 浏览器端运行，零客户端安装 |
| III. RBAC | ✅ PASS | 复用 `authenticate` 中间件，元数据查询仅返回已授权资产的 schema |
| IV. Audit Integrity | ✅ PASS | 元数据查询可纳入现有审计日志，执行 SQL 已有审计 |
| V. Resilience | ✅ PASS | FR-014 静默降级：元数据 API 失败时关键字+函数补全仍可用 |

**Gate Result**: ALL PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/006-sql-editor-intelligence/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── schema-api.md    # GET /database/:id/schema contract
└── tasks.md             # Phase 2 output (/speckit-tasks)
```

### Source Code (repository root)

```text
client/src/
├── components/
│   ├── SqlEditor.tsx          # REWRITE: textarea → Monaco Editor
│   └── DmcDataTransfer.tsx    # (unchanged)
├── pages/
│   └── DatabaseWorkspace.tsx  # MODIFY: wire Monaco, pass schema data, Ctrl+Enter
├── services/
│   └── databaseService.ts     # ADD: getSchema(assetId, database) → {tables, columns}
└── completions/
    ├── keywords.ts             # ADD: MySQL/PG/MSSQL keyword sets
    ├── functions.ts            # ADD: function signatures per dialect
    └── completionProvider.ts   # ADD: Monaco CompletionItemProvider

server/src/
├── routes/
│   └── database.ts            # ADD: GET /:id/schema?database=X
└── services/
    └── dbQueryService.ts      # ADD: getSchema(assetId, database) method
```

**Structure Decision**: Web application (Option 2). New `client/src/completions/` directory for autocomplete logic. Backend adds one route + one service method.

## Complexity Tracking

> No constitution violations — section intentionally left empty.
