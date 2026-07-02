# Feature Specification: Database Asset Management

**Feature Branch**: `005-database-asset-management`

**Created**: 2026-07-02

**Status**: Draft

**Input**: User description: "资产管理中加数据库连接支持SQL Server，分为主机资产和数据库资产，数据库资产要有执行、导出等功能"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Database Asset Registration (Priority: P1)

An administrator adds a database server (SQL Server, MySQL, PostgreSQL) as a database asset, providing connection parameters (host, port, database name, credentials). The system stores credentials encrypted and tests the connection.

**Why this priority**: Without registering database assets, no other database features can function.

**Independent Test**: Admin adds a SQL Server asset → fills in host/port/user/password → clicks "测试连接" → sees "连接成功" → saves asset → appears in asset list with "数据库" type tag.

**Acceptance Scenarios**:

1. **Given** admin is on the asset management page, **When** they click "添加资产" and select type "数据库", **Then** the form shows database-specific fields: 数据库类型 (SQL Server/MySQL/PostgreSQL), host, port, 数据库名, 用户名, 密码.
2. **Given** admin has filled in database connection details, **When** they click "测试连接", **Then** the system attempts a TCP connection and returns success or failure with a specific error message.
3. **Given** admin saves a database asset, **When** they view the asset list, **Then** the asset shows a "数据库" type badge distinct from "主机" badges.
4. **Given** admin saves a SQL Server asset, **When** another admin views it, **Then** the password is masked; only the username and database name are visible in the list.

---

### User Story 2 - SQL Query Editor (Priority: P1)

An authorized user opens a database asset connection, writes and executes SQL queries in a browser-based editor, and sees results in a table.

**Why this priority**: Query execution is the core value of database asset management.

**Independent Test**: Operator clicks on a database asset → opens query editor → writes `SELECT GETDATE()` → clicks "执行" → sees result row with current timestamp.

**Acceptance Scenarios**:

1. **Given** an authorized operator, **When** they click a database asset and select "查询", **Then** a split-panel query editor opens with a SQL text area above and an empty results area below.
2. **Given** the query editor is open, **When** the user writes a valid SELECT query and clicks "执行" (or presses Ctrl+Enter), **Then** the query results display in a paginated table within 5 seconds.
3. **Given** the query results are displayed, **When** the user writes another query and clicks "执行", **Then** the previous results are replaced with new results.
4. **Given** the user writes an invalid SQL query, **When** they click "执行", **Then** a clear error message from the database is displayed without exposing internal details.

---

### User Story 3 - Query Result Export (Priority: P1)

Users can export query results to CSV or JSON files for offline analysis.

**Why this priority**: Export is essential for data analysis workflows — this was explicitly requested.

**Independent Test**: Execute a SELECT query → click "导出 CSV" → file downloads with correct column headers and data rows.

**Acceptance Scenarios**:

1. **Given** query results are displayed, **When** the user clicks "导出 CSV", **Then** a CSV file downloads with column headers matching the query and proper UTF-8 encoding.
2. **Given** query results are displayed, **When** the user clicks "导出 JSON", **Then** a JSON file downloads with an array of objects keyed by column names.
3. **Given** a query returned more than 10,000 rows, **When** the user clicks export, **Then** all rows are exported (not just the visible page).

---

### User Story 4 - Query History & Saved Queries (Priority: P2)

Users can view their query history, re-run previous queries, and save frequently-used queries for quick access.

**Why this priority**: Reduces repetitive typing and enables audit of executed queries.

**Independent Test**: Execute a query → open history panel → see the query with timestamp → click to re-run → results appear.

**Acceptance Scenarios**:

1. **Given** a user has executed queries, **When** they open the "历史" panel, **Then** they see a list of previously executed queries with timestamps and execution status.
2. **Given** the history panel, **When** the user clicks a past query, **Then** the SQL text is loaded into the editor.
3. **Given** the query editor, **When** the user clicks "保存查询" and enters a name, **Then** the query is saved to their personal saved queries list.
4. **Given** saved queries exist, **When** the user opens the "已保存" panel, **Then** they see their saved queries organized by name and can click to load one.

---

### User Story 5 - Database Object Browser (Priority: P2)

Users browse database objects (tables, views, stored procedures) in a tree structure, and can view object definitions (DDL) and sample data.

**Why this priority**: Helps users understand the database schema without leaving the bastion host.

**Independent Test**: Open a database asset → expand "Tables" node → see table list → click a table → see column definitions and first 100 rows preview.

**Acceptance Scenarios**:

1. **Given** the database asset page, **When** the user opens the "对象浏览器", **Then** they see a tree with nodes: Tables, Views, Stored Procedures, Functions.
2. **Given** the Tables node is expanded, **When** the user clicks a table name, **Then** the right panel shows: column definitions (name, type, nullable, default) and a "前 100 行" preview button.
3. **Given** a view is selected, **When** the user clicks "查看定义", **Then** the CREATE VIEW DDL is displayed in a read-only editor.
4. **Given** a stored procedure is selected, **When** the user clicks "查看定义", **Then** the procedure source code is displayed.

---

### User Story 6 - Permission-Controlled Database Access (Priority: P3)

Database queries and operations are logged to the audit trail. Administrators can set per-user database access permissions that limit which databases and tables can be accessed.

**Why this priority**: Compliance and security — prevents unauthorized data access and provides audit trail.

**Independent Test**: Admin grants user "只读" permission on a database → user can only run SELECT, not INSERT/UPDATE/DELETE → attempted DML is blocked and logged.

**Acceptance Scenarios**:

1. **Given** a database asset authorization, **When** admin sets permission level to "只读", **Then** the user can only execute SELECT queries; INSERT/UPDATE/DELETE/DROP are blocked with a clear message.
2. **Given** a database asset authorization, **When** admin sets permission level to "读写", **Then** the user can execute all SQL types.
3. **Given** a user executes any SQL query, **When** the query completes, **Then** the query text, database name, execution time, and row count are logged in the audit trail.

---

### Edge Cases

- What happens when a database connection times out? The system shows "连接超时" and offers to reconnect.
- What happens when a query returns zero rows? Show "查询完成，无返回结果" in the results area.
- What happens with very large result sets (>100,000 rows)? Paginate results (200 rows per page) and warn "结果集过大，仅显示前 N 行" when scrolling beyond a configurable limit.
- What happens when a user's database authorization expires mid-session? The active connection is terminated and they must re-authorize.
- What happens when an exported CSV contains special characters? Use UTF-8 BOM encoding for Excel compatibility.
- What happens when a query contains multiple statements? Only execute the first statement; warn "一次只能执行一条语句" if multiple statements detected.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support adding database assets with fields: 数据库类型 (SQL Server/MySQL/PostgreSQL), host, port, database name, username, password, description.
- **FR-002**: System MUST encrypt database credentials at rest using the existing AES-256-CBC mechanism.
- **FR-003**: System MUST provide a "测试连接" feature that validates database connectivity before saving.
- **FR-004**: System MUST provide a browser-based SQL query editor with syntax highlighting and Ctrl+Enter shortcut for execution.
- **FR-005**: System MUST execute SELECT queries and display results in a paginated table (200 rows per page).
- **FR-006**: System MUST allow INSERT/UPDATE/DELETE execution with affected row count display.
- **FR-007**: System MUST support exporting query results to CSV (UTF-8 BOM) and JSON formats.
- **FR-008**: System MUST maintain a personal query history per user (last 100 queries with timestamps and status).
- **FR-009**: System MUST support saving named queries for quick access.
- **FR-010**: System MUST provide a database object browser showing tables, views, stored procedures, and functions.
- **FR-011**: System MUST display column definitions and sample data (first 100 rows) for selected tables.
- **FR-012**: System MUST support DDL preview for views and stored procedures.
- **FR-013**: System MUST enforce per-user database permission levels (只读 / 读写) via authorization records.
- **FR-014**: System MUST log all SQL query executions (query text, database, user, timestamp, row count, duration) to the audit trail.
- **FR-015**: System MUST support SQL Server (via tedious/mssql), MySQL (via mysql2), and PostgreSQL (via pg).
- **FR-016**: System MUST display database assets and host assets in separate tabs or filterable categories in the asset list.

### Key Entities

- **DatabaseAsset** (extends existing Asset): Additional fields — db_type (mssql/mysql/postgresql), database_name, username (db user), password_encrypted. Shares the existing assets table with a new `asset_type` discriminator column (`host` / `database`).
- **DbAuthorization** (extends existing Authorization): Adds `permission_level` field (readonly / readwrite). Uses existing authorizations table.
- **QueryHistory**: Stores executed queries — user_id, asset_id, query_text, db_name, status (success/error), row_count, duration_ms, executed_at.
- **SavedQuery**: User's saved queries — user_id, asset_id, name, query_text, created_at, updated_at.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Database connection test returns success or failure within 5 seconds.
- **SC-002**: Simple SELECT queries execute and display results within 3 seconds.
- **SC-003**: CSV export of 10,000 rows completes within 10 seconds.
- **SC-004**: 100% of SQL query executions are logged to the audit trail with complete metadata.
- **SC-005**: Read-only users are blocked from executing non-SELECT statements with 100% accuracy.
- **SC-006**: Query history displays the last 100 queries for any user without noticeable lag (<500ms).

## Assumptions

- Database servers must be network-accessible from the bastion host (same as SSH/RDP assets).
- SQL Server connections use the TDS protocol (default port 1433). Windows authentication is out of scope for v1; SQL Server authentication (username/password) only.
- Query execution timeout defaults to 30 seconds and is configurable.
- The database object browser fetches metadata using standard INFORMATION_SCHEMA queries.
- Query editor uses a simple textarea with basic syntax highlighting; a full IDE (IntelliSense, autocomplete) is out of scope for v1.
- Export file size is limited to 50MB; larger exports require administrator approval.
