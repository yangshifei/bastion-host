# Implementation Plan: 仪表盘页面重新设计

**Branch**: `007-dashboard-redesign` | **Date**: 2026-07-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-dashboard-redesign/spec.md`

## Summary

重新设计堡垒机仪表盘的信息架构与交互：首屏展示资产/会话/查询/安全四类核心指标，按角色（admin / operator / auditor）过滤快捷入口与区块优先级，统计卡片与关键指标支持单次点击跳转，中部保留 7 日趋势与资产分布及命令安全可视化，底部展示最近会话与 SQL 查询；后端扩展 `GET /api/dashboard/stats` 聚合今日失败登录数，前端 30 秒轮询且失败时优雅降级。

**当前基线**：Dashboard.tsx 已实现 6 张 StatCard、BarChart/DonutRing、快捷入口、最近会话/SQL 表、30s 轮询；缺口为角色差异化布局、卡片点击跳转、失败登录统计、刷新加载态与响应式首屏优化。

## Technical Context

**Language/Version**: TypeScript 5.x, React 18, Node.js 18 (Docker Alpine)

**Primary Dependencies**: TDesign React, Tailwind CSS, 现有 StatCard / SectionCard / EmptyState / LoadingSkeleton；纯 CSS/SVG 图表组件（BarChart、DonutRing，内联于 Dashboard）

**Storage**: MySQL 8.0 — 聚合 `assets`, `sessions`, `query_history`, `command_logs`, `login_logs`, `users`

**Testing**: 手动浏览器验证（quickstart.md 场景）；Docker Compose 构建通过

**Target Platform**: Web SPA + Express API，经 nginx 反向代理部署

**Performance Goals**: 首屏统计 2s 内可见；`/api/dashboard/stats` p95 < 1s；30s 轮询不阻塞 UI

**Constraints**: 不引入第三方图表库；RBAC 仅前端展示层过滤 + API 需 authenticate；API 失败保留上次数据

**Scale/Scope**: 单页改造（Dashboard.tsx + stats API + StatCard 可选增强）；不涉及新报表模块或 WebSocket 推送

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-Design | Post-Design | Notes |
|-----------|------------|-------------|-------|
| I. Security-First | ✅ PASS | ✅ PASS | 仅返回聚合统计；SQL 摘要截断；失败登录数为计数非明细 |
| II. Browser-Native | ✅ PASS | ✅ PASS | 纯 Web 仪表盘，无客户端安装 |
| III. RBAC | ✅ PASS | ✅ PASS | 快捷入口按 `useAuth()` 角色过滤；API 挂载 authenticate 中间件 |
| IV. Audit Integrity | ✅ PASS | ✅ PASS | 只读聚合，不写审计链 |
| V. Resilience | ✅ PASS | ✅ PASS | API 失败降级 `--`；轮询 cleanup；错误响应含完整空结构 |

**Gate Result**: ALL PASS — 无违规需 Complexity Tracking 条目。

## Project Structure

### Documentation (this feature)

```text
specs/007-dashboard-redesign/
├── plan.md              # 本文件
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/
│   └── dashboard-api.md # Phase 1
├── spec.md
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

```text
server/src/
├── app.ts                      # MODIFY: 扩展 GET /api/dashboard/stats（失败登录、authenticate）
client/src/
├── pages/
│   └── Dashboard.tsx           # REWRITE: 角色布局、可点击卡片、刷新态、响应式网格
├── components/
│   ├── StatCard.tsx            # MODIFY: 可选 onClick / href / loading / alert 态
│   ├── SectionCard.tsx         # (reuse)
│   ├── EmptyState.tsx          # (reuse)
│   └── LoadingSkeleton.tsx     # (reuse)
├── types/
│   └── index.ts                # MODIFY: DashboardStats 扩展字段
└── styles/
    └── globals.css             # MODIFY: stat-card 可点击、首屏 grid 断点（按需）
```

**Structure Decision**: 标准 Web 应用结构；统计 API 暂保留于 `app.ts`（与现有一致），后续可提取至 `routes/dashboard.ts` 但不作为本 feature 阻塞项。

## Phase 0: Research Summary

见 [research.md](research.md)。所有 Technical Context 项已明确，无 NEEDS CLARIFICATION。

## Phase 1: Design Artifacts

| Artifact | Path | Purpose |
|----------|------|---------|
| Data Model | [data-model.md](data-model.md) | 聚合实体与 DB 来源映射 |
| API Contract | [contracts/dashboard-api.md](contracts/dashboard-api.md) | GET /api/dashboard/stats 请求/响应 |
| Quickstart | [quickstart.md](quickstart.md) | 端到端验证场景 |

## Implementation Phases (for /speckit-tasks)

### Phase A — 后端聚合扩展

1. 为 `GET /api/dashboard/stats` 添加 `authenticate` 中间件
2. 新增 `todayFailedLogins`（`login_logs` 今日 `result LIKE 'fail%'` 计数）
3. 错误 fallback 响应补齐 `recentQueries`, `sessionTrend`, `protocolDist` 等字段，避免前端 undefined

### Phase B — 前端信息架构

1. 提取 `getQuickActions(role)` 与 `getStatCards(role, stats)` 配置函数
2. auditor：突出危险命令 + 审计/回放快捷入口；operator：隐藏资产管理/授权
3. StatCard 增加 `onClick` + 键盘可访问；映射：资产→`/assets`，活跃会话→`/sessions/active`，危险命令→`/audit`，今日查询→`/database`

### Phase C — 交互与韧性

1. 手动刷新时 `refreshing` 态（卡片 subtle pulse 或 header 按钮 loading）
2. 确认 `useEffect` cleanup 清除 30s interval
3. API 失败：新数据 null 时保留 `stats` 上次值，可选 toast 省略（spec 要求不阻断）

### Phase D — 布局与可视化

1. 响应式 grid：`grid-cols-2 sm:3 xl:6` 确保 1280px 首屏 6 卡可见
2. DonutRing / BarChart 空状态统一 EmptyState 文案
3. 最近会话行点击跳转 `/replay`（或会话详情，按现有路由）

## Complexity Tracking

> No violations — section intentionally left empty.
