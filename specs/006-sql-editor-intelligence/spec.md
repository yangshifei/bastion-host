# Feature Specification: SQL 编辑器智能补全

**Feature Branch**: `006-sql-editor-intelligence`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "1.关键字自动补全：输入SQL关键字（SELECT/FROM/WHERE 等）、表名、字段名时自动弹出补全列表 2.表名/字段名智能提示：基于 information_schema 元数据，实时提示当前库下的表和列 3.函数提示：内置函数（COUNT/SUM/DATE 等）自动补全 + 参数提示 4.执行：执行全部 SQL 或选中部分"

## Clarifications

### Session 2026-07-08

- Q: 元数据API的访问控制级别？ → A: 复用现有 RBAC，仅已认证用户可访问其有权资产的元数据，与执行 SQL 权限一致
- Q: v1 功能边界（DDL/跨库引用）？ → A: 部分 DDL——含 CREATE TABLE 列名模板补全，但不含跨库引用（database.schema.table）补全
- Q: 元数据加载失败时的UX表现？ → A: 静默降级——关键字+函数补全正常工作，表/字段提示暂时不可用，顶部显示轻量警告条

## User Scenarios & Testing *(mandatory)*

### User Story 1 - SQL 关键字自动补全 (Priority: P1)

用户在 SQL 编辑器中输入时，系统自动识别输入上下文并弹出补全列表，包含 SQL 关键字（SELECT、FROM、WHERE、JOIN、GROUP BY 等）、已选数据库的表名和字段名。用户可通过键盘上下键选择候选项，按 Enter/Tab 确认补全。

**Why this priority**: 这是最基础的功能，直接提升编写 SQL 的效率。关键字补全不依赖后端元数据，可独立交付。

**Independent Test**: 在 SQL 编辑器中输入 "SEL"，系统弹出以 "SEL" 开头的关键字列表，选择 "SELECT" 后自动补全。选择数据库后，输入表名前几个字母即可补全表名。

**Acceptance Scenarios**:

1. **Given** 用户打开 SQL 窗口且已选择数据库，**When** 输入 "SEL"，**Then** 弹出补全列表，顶部显示 "SELECT" 关键字
2. **Given** 用户打开 SQL 窗口且已选择数据库，**When** 输入 "FROM " 后开始输入表名首字母，**Then** 弹出当前数据库的表名列表供选择
3. **Given** 补全列表已弹出，**When** 用户按 Escape 键，**Then** 补全列表消失且不修改已输入内容
4. **Given** 补全列表已弹出，**When** 用户继续输入更多字符，**Then** 列表实时过滤匹配项

---

### User Story 2 - 字段名智能提示 (Priority: P2)

当用户在 SQL 中引用已明确的表名后（如 "SELECT ... FROM users WHERE "），系统根据上下文识别表名，并在输入字段名时自动提示该表的列名。基于 information_schema 实时获取最新列信息。

**Why this priority**: 字段名提示需要先有表名上下文，建立在 P1 的基础之上。用户无需记住所有列名，大幅减少拼写错误。

**Independent Test**: 输入 "SELECT * FROM some_table WHERE "，系统识别 "some_table" 并提示该表的字段列表。

**Acceptance Scenarios**:

1. **Given** 用户已连接数据库且输入了 "SELECT ... FROM users WHERE "，**When** 开始输入字段名，**Then** 弹出 users 表的列名列表
2. **Given** SQL 中涉及多表 JOIN，**When** 用户输入 "u." 或 "users."，**Then** 弹出对应表/别名的字段列表
3. **Given** 数据库表结构发生变化（新增列），**When** 用户刷新连接后输入列名，**Then** 提示列表包含最新的列信息
4. **Given** 表名在当前库不存在，**When** 用户输入不存在的表名后尝试补全字段，**Then** 不弹出字段提示（仅显示关键字）

---

### User Story 3 - 内置函数提示与参数提示 (Priority: P3)

系统内置常见 SQL 函数（聚合函数 COUNT/SUM/AVG/MAX/MIN、日期函数、字符串函数、类型转换函数等）的补全列表，选中函数后显示参数签名提示（如 COUNT(expr)、DATE_FORMAT(date, format)），帮助用户正确填写参数。

**Why this priority**: 函数提示进一步提升编写复杂查询的效率，但基础关键字和表名字段名提示已经覆盖 80% 的使用场景。

**Independent Test**: 输入 "COU"，弹出 "COUNT(expr)" 提示。选中后光标定位在括号内，显示参数说明。

**Acceptance Scenarios**:

1. **Given** 用户在 SQL 编辑器中输入 "DATE_"，**When** 系统弹出补全列表，**Then** 列表包含 DATE_FORMAT、DATE_ADD 等日期函数
2. **Given** 用户选择了 COUNT 函数，**When** 补全后，**Then** 显示参数提示 "COUNT(expr)" 或 "COUNT(DISTINCT expr)"
3. **Given** 不同数据库类型（MySQL/PG/MSSQL），**When** 用户输入函数名，**Then** 提示的函数列表匹配当前数据库类型的方言

---

### User Story 4 - 执行全部或选中 SQL (Priority: P1)

用户在 SQL 编辑器中可以执行全部 SQL 语句，也可以选中部分 SQL 单独执行。当有选中文本时，优先执行选中的部分；无选中文本时执行编辑器全部内容。快捷键 Ctrl+Enter 触发执行。

**Why this priority**: 这是 SQL 编辑器的核心交互，直接影响用户工作流。与 P1 关键字补全同等重要。

**Independent Test**: 在编辑器中输入两条 SQL 语句，选中其中一条后按 Ctrl+Enter，只有选中的语句被执行。

**Acceptance Scenarios**:

1. **Given** 编辑器中有多行 SQL："SELECT 1;\nSELECT 2;"，**When** 用户选中 "SELECT 1;" 后按 Ctrl+Enter，**Then** 仅执行选中的 "SELECT 1;"
2. **Given** 编辑器中有 SQL 且无选中文本，**When** 用户按 Ctrl+Enter，**Then** 执行编辑器全部内容
3. **Given** 用户选中了不完整的 SQL 片段（非完整语句），**When** 按 Ctrl+Enter，**Then** 系统尝试执行选中内容（将执行结果或错误交还给用户）
4. **Given** 执行成功，**When** 结果显示在结果面板，**Then** 光标仍停留在编辑器中原位置（不丢失焦点）

---

### Explicit Out of Scope (v1)

- 跨库引用补全（`database.schema.table` 格式）— 仅支持当前选中数据库内的对象补全
- 复杂子查询嵌套的表别名识别 — 仅识别基本 `table alias` 和 `table AS alias` 模式
- DDL 语句中的数据类型智能提示（如 VARCHAR 长度建议）
- 存储过程/函数的内部代码补全

### Edge Cases

- 用户在未选择数据库时使用编辑器：关键字和函数补全正常工作，表名/字段名补全不弹出（无可用的元数据源）
- 数据库连接断开时：已加载的元数据缓存继续生效，关键字+函数补全仍可用，顶部显示警告条；新连接建立后自动刷新恢复完整补全
- 元数据 API 首次加载即失败：关键字和函数补全正常工作，表/字段提示不可用，顶部显示警告条告知用户"表名/字段名提示暂时不可用"
- 切换数据库时：元数据缓存自动刷新为新数据库的表和列信息
- 极多表/列的场景（>1000 个表）：补全列表限制显示前 50 条匹配项，支持输入更多字符精确过滤
- SQL 中包含注释或字符串字面量：补全在注释和字符串内部不触发
- 多语句场景：编辑器中有多条 SQL 且光标在中间某条时，智能识别当前语句边界

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 系统 MUST 在用户输入至少 2 个字符后自动弹出补全提示列表（关键字、表名、字段名、函数名）
- **FR-002**: 补全列表 MUST 按类别分组显示：关键字 > 表名 > 字段名 > 函数名，同类内按字母排序
- **FR-003**: 系统 MUST 基于当前连接的数据库类型（MySQL/PostgreSQL/MSSQL）提供对应方言的关键字和函数
- **FR-004**: 系统 MUST 在用户选择数据库后自动加载该库的元数据（表列表和每表的列信息），用于补全提示
- **FR-005**: 元数据 MUST 通过后端 API 从 information_schema 获取，前端缓存并随数据库切换自动刷新
- **FR-006**: 系统 MUST 识别 SQL 上下文中的表名引用（FROM/JOIN/INTO/UPDATE 后的表名），并在后续字段位置提供对应表的列提示
- **FR-007**: 系统 MUST 识别表别名（如 "users u"），并在 "u." 后提供该表的列提示
- **FR-008**: 函数补全 MUST 包含参数签名提示（参数名、类型、是否可选），在选中函数后以 tooltip 或内联方式显示
- **FR-009**: 系统 MUST 支持 Ctrl+Enter 快捷键执行 SQL：有选中文本时执行选中部分，无选中时执行全部
- **FR-010**: 执行结果（成功/失败）MUST 显示在结果面板，错误信息包含具体的数据库错误描述
- **FR-011**: 补全列表 MUST 支持键盘导航（↑↓ 选择，Enter/Tab 确认，Escape 关闭）
- **FR-012**: 系统 MUST 在字符串字面量（单引号/双引号内）和 SQL 注释（-- 和 /* */）中不触发补全
- **FR-013**: 元数据 API MUST 复用现有 RBAC 中间件：仅已认证且对目标资产有访问授权的用户可获取 schema 元数据
- **FR-014**: 元数据加载失败时系统 MUST 静默降级：关键字和函数补全继续正常工作，表名/字段名提示暂时不可用，编辑器顶部显示可关闭的轻量警告条

### Key Entities

- **SQL 关键字集合**: 按数据库类型分类的保留字和关键字列表（SELECT、FROM、WHERE、JOIN、INSERT、CREATE、ALTER、DROP 等）
- **数据库元数据缓存**: 当前数据库的表名列表 + 每张表的列名列表 + 列类型信息，从 information_schema 获取并缓存在前端
- **函数签名库**: 按数据库类型分类的内置函数名、参数列表、参数类型、返回值类型和简要说明
- **编辑器上下文状态**: 当前光标位置、正在输入的前缀文本、已识别的表引用（含别名映射）、当前数据库类型

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 用户在 SQL 编辑器中输入关键字/表名/字段名时，补全列表在 300ms 内弹出
- **SC-002**: 切换数据库后，新库的元数据在 3 秒内加载完成并可用于补全
- **SC-003**: 补全列表的匹配准确率达到 95% 以上（正确识别上下文并给出相关候选项）
- **SC-004**: 使用补全功能的用户编写 SQL 的时间相比无补全减少 50% 以上
- **SC-005**: 首次使用补全功能的用户无需查阅文档即可发现并使用补全（通过输入时自动弹出）
- **SC-006**: 选中 SQL 执行的成功率达到 100%（选中部分正确识别为独立可执行语句或报出明确错误）
- **SC-007**: 元数据缓存机制支持 500 张表、每表 50 列的场景，补全列表不卡顿

## Assumptions

- 项目已引入 Monaco Editor（`@monaco-editor/react`）依赖,可直接用于替换现有 `<textarea>` 实现
- 后端已有 `information_schema` 查询能力（`dbQueryService.getObjects` 获取表列表 + 新增列元数据 API）
- SQL 编辑器的 Monaco 语言模式支持按数据库类型切换（MySQL/PostgreSQL/MSSQL）
- 表别名识别仅支持基本模式（`table alias` 和 `table AS alias`），复杂子查询嵌套别名在 v1 中不作为硬性要求
- 函数参数提示覆盖 ≥50 个常用内置函数，按需扩展
- 选中执行功能仅识别选中文本作为独立 SQL 发送给后端，不进行语法拆分
