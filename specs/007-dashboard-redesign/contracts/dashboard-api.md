# API Contract: Dashboard Statistics

**Feature**: 007-dashboard-redesign  
**Date**: 2026-07-10  
**Endpoint**: `GET /api/dashboard/stats`

## Authentication

| Requirement | Value |
|-------------|-------|
| Method | Bearer JWT (`Authorization: Bearer <token>`) |
| Middleware | `authenticate` |
| Roles | admin, operator, auditor（均只读） |

## Request

无 query/body 参数。

## Response

### Success (200)

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "totalAssets": 18,
    "onlineAssets": 12,
    "offlineAssets": 6,
    "sshAssets": 10,
    "rdpAssets": 3,
    "dbAssets": {
      "total": 5,
      "mysql": 3,
      "postgresql": 1,
      "mssql": 1
    },
    "totalUsers": 8,
    "activeSessions": 2,
    "todaySessions": 15,
    "totalSessions": 1200,
    "todayQueries": 42,
    "querySuccessCount": 40,
    "queryErrorCount": 2,
    "todayFailedLogins": 3,
    "commandStats": {
      "total": 5000,
      "dangerous": 12
    },
    "sessionTrend": [
      { "date": "2026-07-04", "count": 5 },
      { "date": "2026-07-05", "count": 8 }
    ],
    "protocolDist": {
      "ssh": 10,
      "rdp": 3,
      "mysql": 3,
      "postgresql": 1,
      "mssql": 1
    },
    "recentSessions": [
      {
        "id": 101,
        "username": "operator1",
        "asset_name": "prod-web-01",
        "protocol": "ssh",
        "status": "active",
        "start_time": "2026-07-10T10:30:00.000Z"
      }
    ],
    "recentQueries": [
      {
        "id": 55,
        "username": "admin",
        "query_text": "SELECT TOP 100 * FROM [AppUsers]",
        "status": "success",
        "duration_ms": 120,
        "executed_at": "2026-07-10T10:25:00.000Z"
      }
    ]
  }
}
```

### Field Notes

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `todayFailedLogins` | number | yes | 今日 `login_logs.result` 以 `fail` 开头的记录数 |
| `recentQueries[].query_text` | string | yes | 服务端截断至 100 字符 |
| `protocolDist` | object | yes | key 为 protocol 或 db_type，value 为 count |
| `sessionTrend` | array | yes | 可为空数组 |

### Degraded Success (200, partial DB failure)

当部分查询失败时，仍返回 `code: 0`，`data` 内各字段为 0 或空数组（与现有一致），**不得**返回 500 导致前端白屏。

### Unauthorized (401)

```json
{
  "code": 1,
  "message": "未授权"
}
```

## SQL Additions (Implementation Reference)

```sql
-- todayFailedLogins
SELECT COUNT(*) AS count
FROM login_logs
WHERE created_at >= CURDATE()
  AND result LIKE 'fail%';
```

## Client Usage

- 请求：`api.get('/dashboard/stats')`（baseURL `/api`）
- 轮询间隔：30_000 ms
- 类型：`DashboardStats` in `client/src/types/index.ts`

## Non-Goals

- 不按角色返回不同 JSON shape（角色过滤在前端）
- 不支持日期范围参数（固定今日 / 7 日）
- 不提供导出或 WebSocket 订阅
