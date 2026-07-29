# Research: 仪表盘页面重新设计

**Feature**: 007-dashboard-redesign | **Date**: 2026-07-10

## 1. 统计 API 单端点聚合

**Decision**: 继续使用并扩展 `GET /api/dashboard/stats`，一次返回全部仪表盘数据。

**Rationale**: 减少首屏 RTT；现有实现已覆盖资产、会话、查询、命令、趋势；新增失败登录计数仅需一条 SQL。

**Alternatives considered**:
- 拆分多个微端点（/assets-summary, /session-summary）：增加瀑布请求，违反 SC-002 首屏 2s 目标
- GraphQL：过度设计，与项目 Express 风格不一致

## 2. 失败登录安全指标

**Decision**: 从 `login_logs` 表聚合「今日失败登录次数」(`todayFailedLogins`)，在危险命令卡片旁或合并为「安全态势」副标题展示。

**Rationale**: Spec US1 要求「安全告警（危险命令与失败登录）」；`login_logs.result` 已有 `fail_*` 枚举值；仅返回计数，不暴露 IP/用户名列表，符合 Security-First。

**Alternatives considered**:
- 返回最近 5 条失败登录明细：信息敏感，需 auditor 权限细分，超出 v1 范围
- 复用 audit_logs：登录失败已在 login_logs，避免重复查询

## 3. 角色差异化布局

**Decision**: 前端基于 `useAuth()` 的 `isAdmin` / `isAuditor` / operator（二者皆 false）配置化渲染快捷入口与可选隐藏统计卡（如 operator 隐藏「用户数」）。

**Rationale**: Spec FR-003；后端 RBAC 已在各功能路由 enforce，仪表盘仅做 UX 层过滤，不新增 API 参数。

**Alternatives considered**:
- 后端按角色返回不同 JSON：增加 API 复杂度，且前端仍需维护映射
- 三套独立页面组件：重复代码多

**Role matrix**:

| 元素 | admin | operator | auditor |
|------|-------|----------|---------|
| 全部 6 统计卡 | ✅ | ✅（可隐藏用户数） | ✅ |
| SSH/RDP/SQL 快捷入口 | ✅ | ✅ | ❌ |
| 资产管理/授权 | ✅ | ❌ | ❌ |
| 安全审计/会话回放 | ✅ | ❌ | ✅ |
| 新建会话按钮 | ✅ | ✅ | ❌ |

## 4. 可点击统计卡片

**Decision**: 扩展 `StatCard` 支持 `onClick` 与 `className` cursor-pointer；各卡片映射固定路由。

**Rationale**: Spec FR-008；StatCard 当前为纯展示，增量 props 即可，无需新组件库。

**Mapping**:
- 资产总数 → `/assets`
- 在线资产 → `/assets`（可带 query `status=online` 若列表页支持，否则 `/assets`）
- 活跃会话 → `/sessions/active` 或现有活跃会话页
- 今日查询 → `/database`
- 危险命令 → `/audit`（命令审计 Tab）
- 用户数 → `/users`（仅 admin）

## 5. 自动轮询与降级

**Decision**: 保持 `setInterval(30_000)` + `useRef` cleanup；`fetchStats` catch 块不清空 `stats`；首次 loading 用 LoadingSkeleton，后续刷新仅 header 按钮 loading。

**Rationale**: 已实现基础轮询；Spec FR-012–FR-015；符合 Constitution V 优雅降级。

**Alternatives considered**:
- SWR/React Query：未在项目中广泛使用，引入成本高
- WebSocket 推送：Spec Assumptions 明确排除

## 6. 图表方案

**Decision**: 保留 Dashboard 内联 BarChart / DonutRing（纯 SVG/CSS），不引入 ECharts/Recharts。

**Rationale**: 满足趋势与分布需求；零依赖；Constitution 技术栈无图表库 mandate。

## 7. API 认证

**Decision**: 为 `GET /api/dashboard/stats` 添加 `authenticate` 中间件。

**Rationale**: 仪表盘含会话/查询最近记录，应要求登录；与 Constitution III 一致；当前 endpoint 为公开，需修复。

**Alternatives considered**:
- 保持公开：泄露运维元数据，不符合堡垒机安全模型
