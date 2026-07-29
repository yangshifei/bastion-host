# Tasks: 仪表盘页面重新设计

**Input**: Design documents from `/specs/007-dashboard-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/dashboard-api.md, quickstart.md

**Tests**: 未在 spec 中要求自动化测试；验证通过 `quickstart.md` 手动场景（Phase 8）。

**Organization**: 按用户故事分组，支持独立实现与验收。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 对应 spec.md 用户故事 US1–US6

## Path Conventions

- 后端：`server/src/`
- 前端：`client/src/`

---

## Phase 1: Setup（共享准备）

**Purpose**: 扩展类型与配置骨架，不改动业务行为

- [x] T001 [P] 在 `client/src/types/index.ts` 的 `DashboardStats` 接口新增 `todayFailedLogins?: number` 字段
- [x] T002 [P] 新建 `client/src/config/dashboardConfig.ts`，定义 `QuickAction`、`StatCardConfig` 类型及角色枚举常量（admin / operator / auditor）

---

## Phase 2: Foundational（阻塞性前置 — 后端 API）

**Purpose**: 统计 API 安全与数据完整性；**所有用户故事依赖本阶段**

**⚠️ CRITICAL**: 未完成 Phase 2 前，US1 失败登录指标与 API 认证无法验收

- [x] T003 在 `server/src/app.ts` 为 `GET /api/dashboard/stats` 挂载 `authenticate` 中间件（自 `server/src/middleware/auth` 导入）
- [x] T004 在 `server/src/app.ts` 的 stats 处理中新增 `todayFailedLogins` 查询（`login_logs` 今日且 `result LIKE 'fail%'`），写入响应 `data`
- [x] T005 完善 `server/src/app.ts` stats 的 catch fallback，补齐 `recentQueries`、`sessionTrend`、`protocolDist`、`dbAssets`、`todayQueries`、`todayFailedLogins` 等字段为零值/空数组，避免前端 undefined

**Checkpoint**: 已登录用户可 GET `/api/dashboard/stats` 且含 `todayFailedLogins`；未登录返回 401

---

## Phase 3: User Story 1 — 登录后 10 秒内掌握系统态势 (Priority: P1) 🎯 MVP

**Goal**: 首屏 6 张核心指标卡完整展示资产/会话/查询/安全态势，含失败登录与危险命令告警态

**Independent Test**: admin 登录仪表盘，首屏见 6 卡；subtitle 含 SSH/RDP/DB 拆分；危险命令或失败登录 >0 时有视觉强调（VS-1、VS-7）

### Implementation for User Story 1

- [x] T006 [P] [US1] 扩展 `client/src/components/StatCard.tsx`：支持可选 `onClick`、`alert?: boolean`（告警边框/色）、`loading?: boolean`
- [x] T007 [US1] 在 `client/src/config/dashboardConfig.ts` 实现 `getStatCards(stats, role)`，返回 6 张卡片配置（含 subtitle 拆分与 `todayFailedLogins` 安全提示）
- [x] T008 [US1] 在 `client/src/pages/Dashboard.tsx` 用 `getStatCards` 渲染 StatCard 网格，替换硬编码 6 卡；确保 0 值显示 `0` 而非 `-`（仅 API 失败时显示 `--`）
- [x] T009 [US1] 在 `client/src/pages/Dashboard.tsx` 危险命令卡 subtitle 合并展示失败登录数（如「危险 N · 今日失败登录 M」）
- [x] T010 [P] [US1] 在 `client/src/styles/globals.css` 为 `.stat-card` 增加 `alert` 与可点击态样式（`:hover`、focus-visible）

**Checkpoint**: VS-1、VS-7 通过；1280px 宽度下 6 卡可见（与 US6 布局任务协同）

---

## Phase 4: User Story 2 — 按角色看到相关内容 (Priority: P1)

**Goal**: admin / operator / auditor 看到不同快捷入口与统计卡可见性

**Independent Test**: 三种角色登录，快捷入口集合符合 research.md 角色矩阵（VS-2）

### Implementation for User Story 2

- [x] T011 [P] [US2] 在 `client/src/config/dashboardConfig.ts` 实现 `getQuickActions(role)`，按 spec FR-003 / research 角色矩阵返回入口列表
- [x] T012 [US2] 在 `client/src/config/dashboardConfig.ts` 的 `getStatCards` 中为 operator 隐藏「用户数」卡、为 auditor 调整卡片 accent/排序（安全相关优先）
- [x] T013 [US2] 在 `client/src/pages/Dashboard.tsx` 用 `getQuickActions(isAdmin, isAuditor)` 替换内联 `quickActions` 数组
- [x] T014 [US2] 在 `client/src/pages/Dashboard.tsx` 按角色条件渲染 PageHeader「新建会话」按钮（auditor 隐藏）

**Checkpoint**: VS-2 三种角色快捷入口验收通过

---

## Phase 5: User Story 3 — 趋势与结构一眼可读 (Priority: P2)

**Goal**: 7 日会话趋势、资产类型分布、命令安全比例可视化，空数据友好

**Independent Test**: 有数据时图表可读；无数据时显示「暂无数据」不塌陷（VS-4）

### Implementation for User Story 3

- [x] T015 [P] [US3] 在 `client/src/pages/Dashboard.tsx` 抽取 `BarChart`、`DonutRing` 至 `client/src/components/dashboard/`（或同文件顶部）并统一空状态组件 `ChartEmpty`
- [x] T016 [US3] 在 `client/src/pages/Dashboard.tsx` 命令安全 SectionCard 使用 `commandStats` 计算安全/危险比例条，0 总量时显示 EmptyState
- [x] T017 [US3] 在 `client/src/pages/Dashboard.tsx` 确保 `protocolDist` 合并 SSH/RDP/DB 类型后 DonutRing 图例与百分比正确

**Checkpoint**: VS-4 图表与空状态通过

---

## Phase 6: User Story 4 — 快捷抵达高频操作 (Priority: P2)

**Goal**: 快捷入口与可点击统计卡单次跳转目标页

**Independent Test**: 点击各 StatCard 与快捷入口均 1 次导航到达（VS-3）

### Implementation for User Story 4

- [x] T018 [US4] 在 `client/src/config/dashboardConfig.ts` 的 `StatCardConfig` 增加 `href` 字段及映射（资产→`/assets`，在线→`/assets`，活跃会话→`/sessions`，今日查询→`/database`，危险命令→`/audit`，用户→`/users`）
- [x] T019 [US4] 在 `client/src/pages/Dashboard.tsx` 为 StatCard 绑定 `onClick={() => navigate(href)}` 与键盘 Enter 支持
- [x] T020 [P] [US4] 在 `client/src/config/dashboardConfig.ts` 为 auditor 增加「会话回放」入口（`/replay`），admin 保留「安全审计」（`/audit`）

**Checkpoint**: VS-3 卡片与快捷入口跳转通过

---

## Phase 7: User Story 5 — 最近活动可追溯 (Priority: P2)

**Goal**: 最近 5 条会话与 SQL 查询，空状态带引导

**Independent Test**: 执行 SSH + SQL 后刷新可见记录（VS-5）

### Implementation for User Story 5

- [x] T021 [P] [US5] 在 `client/src/pages/Dashboard.tsx` 最近会话 Table 增加行点击 `navigate('/replay')` 或 `/replay/${id}`（与 `SessionReplay.tsx` 路由一致）
- [x] T022 [US5] 在 `client/src/pages/Dashboard.tsx` 最近 SQL Table 行点击跳转 `/database` 并可选传递 query id（若无详情页则仅跳转列表）
- [x] T023 [US5] 在 `client/src/pages/Dashboard.tsx` 统一 EmptyState 文案与 spec FR-011 一致（会话/SQL 空状态引导按钮）

**Checkpoint**: VS-5 最近活动通过

---

## Phase 8: User Story 6 — 数据保持新鲜且不打扰 (Priority: P3)

**Goal**: 30s 轮询、手动刷新 loading、离开页面 cleanup、API 失败降级

**Independent Test**: VS-6 自动刷新、停止轮询、降级行为

### Implementation for User Story 6

- [x] T024 [US6] 在 `client/src/pages/Dashboard.tsx` 新增 `refreshing` state；手动刷新与 interval 回调设 true/false，PageHeader 刷新按钮显示 loading
- [x] T025 [US6] 在 `client/src/pages/Dashboard.tsx` 的 `fetchStats` catch 中保留已有 `stats`，仅在新请求成功时更新；失败时不 toast
- [x] T026 [US6] 确认 `client/src/pages/Dashboard.tsx` 的 `useEffect` cleanup 清除 `setInterval`；依赖数组正确避免重复 interval
- [x] T027 [P] [US6] 在 `client/src/pages/Dashboard.tsx` 调整 stat 网格为 `grid-cols-2 sm:grid-cols-3 xl:grid-cols-6`，满足 SC-006 首屏可见

**Checkpoint**: VS-6、VS-8 通过

---

## Phase 9: Polish & Cross-Cutting

**Purpose**: 构建验证与文档收尾

- [x] T028 [P] 运行 `docker compose build bastion` 确认前后端编译通过
- [x] T029 按 `specs/007-dashboard-redesign/quickstart.md` 执行 VS-1 至 VS-8 全量手动验收并记录结果
- [x] T030 [P] 更新 `specs/007-dashboard-redesign/quickstart.md` 中 auditor 快捷入口预期与最终实现一致（若 T020 有偏差）

---

## Dependencies & Execution Order

### Phase Dependencies

```text
Phase 1 (Setup) ──► Phase 2 (Foundational) ──► Phase 3–8 (User Stories)
                                                      │
                                                      ▼
                                               Phase 9 (Polish)
```

- **Phase 1**: 无依赖，可与 Phase 2 中 T003 前并行
- **Phase 2**: 阻塞 US1 的 `todayFailedLogins` 与 401 行为
- **Phase 3 (US1)**: 依赖 Phase 2；MVP 最小交付
- **Phase 4 (US2)**: 依赖 T007/T011 配置模块；可与 US3 部分并行（不同文件）
- **Phase 5–8**: 依赖 Dashboard.tsx 基础重构（T008）；US4 依赖 T006/T018
- **Phase 9**: 依赖所有目标用户故事完成

### User Story Dependencies

| Story | 依赖 | 可并行 |
|-------|------|--------|
| US1 | Phase 2 | T006 与 T007 可并行 |
| US2 | US1 配置模块 T007 | T011 与 T012 可并行 |
| US3 | Dashboard 渲染 T008 | T015 独立 |
| US4 | T006 StatCard onClick | T020 与 T019 |
| US5 | 现有 Table 数据 | T021/T022 可并行 |
| US6 | fetchStats 逻辑 | T027 独立 |

### Parallel Opportunities

**Phase 1 并行**:
```text
T001 client/src/types/index.ts
T002 client/src/config/dashboardConfig.ts
```

**US1 + US2 配置并行（T006 完成后）**:
```text
T007 getStatCards in dashboardConfig.ts
T011 getQuickActions in dashboardConfig.ts
```

**跨故事并行（Foundational 完成后）**:
```text
Developer A: Phase 3 US1 + Phase 4 US2
Developer B: Phase 5 US3 + Phase 7 US5
Developer C: Phase 6 US4 + Phase 8 US6
```

---

## Parallel Example: User Story 1

```bash
# 并行启动：
# T006 StatCard.tsx 扩展
# T010 globals.css 样式

# 顺序执行：
# T007 getStatCards → T008 Dashboard 接入 → T009 安全 subtitle
```

---

## Implementation Strategy

### MVP First（推荐）

1. Phase 1 + Phase 2（API 与类型）
2. Phase 3 US1  alone
3. **STOP & VALIDATE**: quickstart VS-1、VS-7
4. 依次 Phase 4 → 8
5. Phase 9 全量验收

### 增量交付顺序

1. US1 + US2（P1 态势 + 角色）→ 可演示给管理员/审计员
2. US4（跳转）→ 提升操作效率
3. US3 + US5（图表 + 活动）→ 完整信息架构
4. US6（轮询 polish）→ 生产就绪

---

## Notes

- 当前 `Dashboard.tsx` 已实现大量基线功能；任务侧重 **缺口**（认证、失败登录、角色配置、可点击卡、刷新态）
- 所有任务描述含明确文件路径，便于 LLM 直接执行
- 未包含自动化测试任务（spec 未要求）
- 任务总数：**30**（Setup 2 + Foundational 3 + US1 5 + US2 4 + US3 3 + US4 3 + US5 3 + US6 4 + Polish 3）
