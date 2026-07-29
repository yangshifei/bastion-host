# Data Model: 仪表盘页面重新设计

**Feature**: 007-dashboard-redesign  
**Date**: 2026-07-10

## Overview

仪表盘不引入新数据库表；所有展示数据均为现有表的**只读聚合**。前端 `DashboardStats` 类型为 API 响应的 TypeScript 镜像。

## Entities

### 1. DashboardStats（API 响应根对象）

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `totalAssets` | number | `assets` COUNT | 未删除资产总数 |
| `onlineAssets` | number | `assets` WHERE status='online' | 在线资产数 |
| `offlineAssets` | number | computed | total - online |
| `sshAssets` | number | `assets` host + protocol=ssh | SSH 主机资产数 |
| `rdpAssets` | number | `assets` host + protocol=rdp | RDP 主机资产数 |
| `dbAssets` | DbAssetBreakdown | `assets` asset_type=database | 数据库资产分类 |
| `totalUsers` | number | `users` COUNT | 注册用户（admin 向） |
| `activeSessions` | number | `sessions` status=active | 当前活跃会话 |
| `todaySessions` | number | `sessions` start_time >= today | 今日新建会话 |
| `totalSessions` | number | `sessions` COUNT | 累计会话（可选展示） |
| `todayQueries` | number | `query_history` today | 今日 SQL 执行次数 |
| `querySuccessCount` | number | `query_history` today success | 今日成功查询 |
| `queryErrorCount` | number | `query_history` today error | 今日失败查询 |
| `todayFailedLogins` | number | `login_logs` today fail* | **新增** 今日失败登录次数 |
| `commandStats` | CommandStats | `command_logs` | 命令总量与危险命令数 |
| `sessionTrend` | TrendPoint[] | `sessions` 7-day GROUP BY date | 近 7 日会话趋势 |
| `protocolDist` | Record<string, number> | `assets` protocol + db_type | 资产类型分布 |
| `recentSessions` | RecentSession[] | `sessions` JOIN users, assets LIMIT 5 | 最近会话 |
| `recentQueries` | RecentQuery[] | `query_history` JOIN users LIMIT 5 | 最近 SQL |

### 2. DbAssetBreakdown

| Field | Type | Description |
|-------|------|-------------|
| `total` | number | 数据库资产总数 |
| `mysql` | number? | MySQL 实例数 |
| `postgresql` | number? | PostgreSQL 实例数 |
| `mssql` | number? | SQL Server 实例数 |

### 3. CommandStats

| Field | Type | Description |
|-------|------|-------------|
| `total` | number | command_logs 总条数 |
| `dangerous` | number | is_dangerous = 1 条数 |

### 4. TrendPoint

| Field | Type | Description |
|-------|------|-------------|
| `date` | string (YYYY-MM-DD) | 自然日 |
| `count` | number | 当日新建会话数 |

### 5. RecentSession

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | 会话 ID |
| `username` | string | 操作用户 |
| `asset_name` | string | 目标资产名 |
| `protocol` | string | ssh / rdp |
| `status` | string | active / closed / … |
| `start_time` | string (ISO) | 开始时间 |

### 6. RecentQuery

| Field | Type | Description |
|-------|------|-------------|
| `id` | number | 查询历史 ID |
| `username` | string | 执行用户 |
| `query_text` | string | SQL 摘要（服务端截断 ≤100 字符） |
| `status` | string | success / error |
| `duration_ms` | number? | 耗时毫秒 |
| `executed_at` | string | 执行时间 |

## Frontend View Models（非持久化）

### 7. QuickAction

| Field | Type | Description |
|-------|------|-------------|
| `label` | string | 入口标题 |
| `desc` | string | 副标题 |
| `path` | string | react-router 路径 |
| `roles` | UserRole[] | 可见角色列表 |
| `icon` | ReactNode | 图标（组件内定义） |

### 8. StatCardConfig

| Field | Type | Description |
|-------|------|-------------|
| `title` | string | 卡片标题 |
| `value` | number \| string | 展示值 |
| `subtitle` | string? | 辅助说明 |
| `accent` | enum | 颜色主题 |
| `href` | string? | 点击跳转路径 |
| `roles` | UserRole[]? | 省略则全员可见 |
| `alert` | boolean? | 危险/告警高亮（如今日失败登录 > 0） |

## Validation Rules

- 所有 count 字段 ≥ 0；空库返回 0 而非 null
- `recentSessions` / `recentQueries` 最多 5 条，按时间倒序
- `sessionTrend` 最多 7 个数据点；无数据的日期可不返回（前端补 0 可选）
- `query_text` 展示层 ellipsis，完整文本不在仪表盘 API 返回（已截断）
- API 错误时返回完整空结构，避免前端 optional chaining 雪崩

## State Transitions

### 前端 Dashboard 加载态

```text
idle → loading (首次 mount, stats=null)
loading → ready (API 200, stats set)
ready → refreshing (手动/自动 poll, stats 保留)
refreshing → ready (API 200, stats 更新)
refreshing → degraded (API fail, stats 不变, 可选 value='--')
ready → unmounted (cleanup interval)
```
