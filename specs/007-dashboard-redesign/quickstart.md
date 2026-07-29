# Quickstart Validation Guide: 仪表盘页面重新设计

**Feature**: 007-dashboard-redesign  
**Date**: 2026-07-10

## Prerequisites

- Docker Compose 已启动：`docker compose up -d`
- 浏览器访问 `http://localhost`（或局域网 IP，确保 HTTP 无 HSTS 升级问题）
- 测试账号：admin、operator、auditor 各一（或 seed 默认 admin）

## Validation Scenarios

### VS-1: 首屏核心指标（P1）

1. 以 admin 登录，进入首页仪表盘
2. **验证**：首屏可见 6 张统计卡（资产、在线、活跃会话、今日查询、用户、危险命令）
3. **验证**：资产卡 subtitle 含 SSH/RDP/DB 拆分
4. **验证**：所有数值为数字（含 0），无空白卡片

### VS-2: 角色差异化快捷入口（P1）

1. admin 登录 → **验证**可见 SSH、RDP、SQL、资产管理、授权、安全审计入口
2. operator 登录 → **验证**无资产管理/授权；有 SSH/RDP/SQL
3. auditor 登录 → **验证**可见「安全审计」「会话回放」入口；无 SSH/RDP/SQL、资产管理、授权及「新建会话」按钮

### VS-3: 统计卡片点击跳转（P2）

1. admin 在仪表盘点击「资产总数」卡片
2. **验证**：导航至 `/assets`
3. 返回仪表盘，点击「危险命令」
4. **验证**：导航至 `/audit`（或命令审计对应 Tab）

### VS-4: 趋势与分布图表（P2）

1. 确保系统存在至少 7 日内会话记录
2. **验证**：「7 日会话趋势」柱状图有数据柱与日期标签
3. **验证**：「资产类型分布」环形图含 SSH/RDP/DB 类型及百分比
4. 清空会话数据的新环境 → **验证**：图表区显示「暂无数据」非塌陷布局

### VS-5: 最近活动（P2）

1. 执行一次 SSH 连接并断开；在 SQL 窗口执行一条查询
2. 刷新仪表盘
3. **验证**：「最近会话」表含刚才会话；「最近 SQL 查询」表含该查询（用户、状态、耗时）

### VS-6: 自动刷新与降级（P3）

1. 打开仪表盘，记录当前「活跃会话」数值
2. 另开标签建立新 SSH 会话，回到仪表盘等待 ≤35 秒
3. **验证**：活跃会话数自动增加，页面无整页 reload
4. 导航至其他菜单项
5. **验证**：Network 面板无继续的 `/dashboard/stats` 轮询（或频率停止）
6. 停止 MySQL 容器模拟 API 失败 → 手动点刷新
7. **验证**：保留上次数据或显示 `--`，无阻断性弹窗

### VS-7: 失败登录指标（P1 安全）

1. 故意 3 次错误密码登录同一账号
2. admin 打开仪表盘
3. **验证**：`todayFailedLogins` 相关展示 ≥3（危险命令卡 subtitle 或独立安全提示）

### VS-8: 响应式首屏（SC-006）

1. 浏览器宽度设为 1280px
2. **验证**：6 张核心指标卡无需纵向滚动即可全部可见

## Regression Checks

- 侧边栏导航与其他页面不受影响
- `/api/dashboard/stats` 未登录返回 401
- Docker 构建：`docker compose build bastion` 成功

## Validation Log (2026-07-10)

| Scenario | Status | Notes |
|----------|--------|-------|
| Docker build | ✅ PASS | `docker compose build bastion` 成功 |
| VS-1 ~ VS-8 | ⏳ 待浏览器验收 | 实现已就绪，需 `docker compose up -d` 后手动验证 |


- API 字段定义：[contracts/dashboard-api.md](contracts/dashboard-api.md)
- 实体说明：[data-model.md](data-model.md)
