# API Contract: GET /api/database/:id/schema

**Feature**: 006-sql-editor-intelligence
**Version**: v1

## Endpoint

```
GET /api/database/:id/schema?database={databaseName}
```

## Authentication

- JWT Bearer token via `Authorization` header
- RBAC: 用户必须对 `:id` 对应的资产有访问授权（复用 `authenticate` 中间件）

## Request

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `:id` | path (number) | Yes | 数据库资产 ID |
| `database` | query (string) | Yes | 目标数据库名（已 URL-encode） |

**Example**:
```
GET /api/database/5/schema?database=mydb
Authorization: Bearer <jwt-token>
```

## Response

### Success (200)

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "tables": [
      {
        "name": "courses",
        "columns": [
          {
            "name": "CourseID",
            "type": "int",
            "nullable": "NO",
            "key_type": "PRI"
          },
          {
            "name": "Name",
            "type": "varchar(200)",
            "nullable": "NO",
            "key_type": ""
          },
          {
            "name": "TotalTime",
            "type": "int",
            "nullable": "YES",
            "key_type": ""
          }
        ]
      },
      {
        "name": "users",
        "columns": [
          {
            "name": "id",
            "type": "int",
            "nullable": "NO",
            "key_type": "PRI"
          },
          {
            "name": "email",
            "type": "varchar(255)",
            "nullable": "NO",
            "key_type": "UNI"
          }
        ]
      }
    ]
  }
}
```

### Error Responses

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| `1` | 400 | `database` query parameter missing |
| `1` | 401 | JWT token missing or expired |
| `1` | 403 | User not authorized for this asset |
| `1` | 404 | Asset not found or deleted |
| `1` | 500 | Database connection failed or query error |

**Error body**:
```json
{
  "code": 1,
  "message": "请先选择数据库"
}
```

## Behavior Notes

- Tables array sorted alphabetically by `name`
- Columns array sorted by database-native ordinal position
- Empty database returns `{"tables": []}` (not an error)
- `key_type` values: `"PRI"` (primary key), `"UNI"` (unique), `"MUL"` (index, MySQL only), `""` (none)
- `nullable`: `"YES"` or `"NO"`
- `type`: Database-native type string (e.g., `varchar(200)`, `int`, `decimal(10,2)`)
- Response MUST NOT include data from tables — only metadata
