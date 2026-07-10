# Quickstart Validation Guide: SQL 编辑器智能补全

**Feature**: 006-sql-editor-intelligence
**Date**: 2026-07-08

## Prerequisites

- Docker Compose 环境已启动（`docker compose up -d`）
- 已注册至少一个数据库资产（MySQL / PostgreSQL / MSSQL）
- 浏览器访问 `http://localhost` 并登录

## Validation Scenarios

### VS-1: 关键字自动补全

1. 进入数据库管理 → 选择一个实例 → 进入 SQL 窗口
2. 在 SQL 编辑器中输入 `SEL`
3. **验证**: 弹出补全列表，包含 `SELECT` 关键字（排在顶部）
4. 按 Enter 或 Tab
5. **验证**: 编辑器内容变为 `SELECT`，光标在末尾
6. 输入 ` * FR`
7. **验证**: 弹出列表包含 `FROM` 关键字
8. 按 Escape
9. **验证**: 补全列表消失，已输入内容不变

### VS-2: 表名智能提示

1. 在顶部选择数据库下拉框中选择一个数据库
2. 在编辑器中输入 `SELECT * FROM `
3. 开始输入某个表名的前几个字母
4. **验证**: 弹出该数据库的表名列表，且列表过滤为匹配项
5. 选择一个表名
6. **验证**: 表名正确插入到 `FROM` 之后

### VS-3: 字段名智能提示

1. 接 VS-2，在 `FROM tablename` 之后输入 ` WHERE `
2. 开始输入字段名
3. **验证**: 弹出 `tablename` 表的列名列表（不含其他表的列）
4. 输入 `SELECT u.`（如果 FROM 子句中有 `users u` 别名）
5. **验证**: 弹出 users 表的列名列表

### VS-4: 函数提示

1. 在编辑器中输入 `SELECT COU`
2. **验证**: 弹出包含 `COUNT(expr)` 的补全列表
3. 选择 `COUNT(expr)`
4. **验证**: 编辑器插入 `COUNT()` 且光标定位在括号内
5. **验证**: 括号内显示参数提示 "expr"

### VS-5: 元数据降级

1. 断开目标数据库连接（停止目标 MySQL 容器）
2. 刷新页面，进入 SQL 窗口
3. **验证**: 关键字补全正常工作（输入 `SEL` 提示 `SELECT`）
4. **验证**: 函数补全正常工作
5. **验证**: 表名/字段名补全不弹出
6. **验证**: 编辑器顶部显示轻量警告条："表名/字段名提示暂时不可用"
7. 恢复数据库连接，点击刷新对象按钮
8. **验证**: 警告条消失，表名/字段名补全恢复正常

### VS-6: 选中部分执行

1. 在编辑器中输入两行 SQL：
   ```
   SELECT 1 AS first;
   SELECT 2 AS second;
   ```
2. 用鼠标选中 `SELECT 1 AS first;`
3. 按 Ctrl+Enter
4. **验证**: 结果面板仅显示 `first: 1`（一行结果）
5. 不选中任何文本，按 Ctrl+Enter
6. **验证**: 结果面板显示两条结果（两次查询）

### VS-7: 数据库类型方言

1. 切换到 MySQL 实例
2. 输入 `SHOW `
3. **验证**: 提示 `SHOW DATABASES`、`SHOW TABLES` 等 MySQL 特有命令
4. 切换到 PostgreSQL 实例
5. 输入 `SHOW `
6. **验证**: 不提示 `SHOW DATABASES`（PG 不支持该语法），提示 PG 方言关键字

### VS-8: 注释和字符串中不触发

1. 输入 `-- SEL`
2. **验证**: 不弹出补全列表
3. 输入 `SELECT 'SEL'`
4. **验证**: 在字符串引号内输入时，不弹出补全列表

## Expected Test Outcomes

| Scenario | Expected Result |
|----------|----------------|
| VS-1 | 关键字补全正常，Escape 关闭列表 |
| VS-2 | 表名补全正确过滤和插入 |
| VS-3 | 列名补全基于上下文识别表引用 |
| VS-4 | 函数补全含参数签名提示 |
| VS-5 | 元数据失败时静默降级，关键字仍可用 |
| VS-6 | 选中执行 vs 全部执行均正确 |
| VS-7 | 不同 DB 类型显示不同方言关键字 |
| VS-8 | 注释和字符串中不触发补全 |
