# 堡垒机 Web 项目 - 详细前后端开发方案（优化版）

> 项目路径: `E:/vscodeai/`
> 现状: 已有基础框架（JWT 认证、用户/资产管理、SSH WebSocket 终端），RDP 为占位页面
> 决策: Guacamole RDP、MySQL 新建独立库、MFA 优先

---

## 一、项目现状分析

### 已完成 ✅
| 模块 | 状态 | 说明 |
|------|------|------|
| 用户认证 | ✅ | JWT + bcrypt，登录/登出/token 刷新 |
| 用户管理 | ✅ | CRUD，含角色（admin/operator/auditor） |
| 资产管理 | ✅ | CRUD，密码 AES 加密存储，连接测试 |
| 授权管理 | ✅ | 用户-资产绑定 |
| SSH 终端 | ✅ | xterm.js + ssh2，WebSocket 代理 |
| 审计日志 | ✅ | 会话记录 + 命令日志 |
| Dashboard | ✅ | 统计卡片 + 最近会话 |
| RDP 终端 | ❌ | 占位页面，需实现 |

### 现有 Bug
| Bug | 位置 | 修复方式 |
|-----|------|---------|
| `handleConnect` 未定义 | TerminalSSH.tsx:73,109 | 补充函数定义，复用已有的 WebSocket send 逻辑 |
| 侧边栏高亮不响应路由变化 | Layout.tsx:47 | `window.location.pathname` → `useLocation()` hook |
| zustand persist 水合竞态 | App.tsx / authStore.ts | persist 的 rehydrate 是异步的，App 启动时 token 可能尚未恢复，需加 `onRehydrateStorage` 回调或 `<Suspense>` 等待 |

### 技术栈
- **前端**: React 18 + TypeScript + Vite 5 + Tailwind CSS + TDesign + xterm.js + Zustand
- **后端**: Express + TypeScript + WebSocket (ws) + ssh2 + JWT + CryptoJS
- **存储**: JSON 文件 → 升级为 MySQL
- **协议**: SSH 已通（WebSocket 代理），RDP 待实现（Guacamole）

---

## 二、总体架构

```
┌─────────────────────────────────────────────────────────┐
│                     浏览器 (Browser)                      │
│  ┌──────────┐ ┌──────────────┐ ┌──────────────────────┐ │
│  │ SSH 终端  │ │  RDP 终端     │ │ 管理后台              │ │
│  │ xterm.js │ │ Guacamole.js │ │ React + TDesign     │ │
│  └────┬─────┘ └──────┬───────┘ └──────────┬───────────┘ │
│       │WebSocket      │WebSocket           │HTTP REST     │
└───────┼───────────────┼────────────────────┼──────────────┘
        │               │                    │
   ┌────▼───────────────▼────────────────────▼──────────────┐
   │                Express Server (Node.js)                 │
   │  ┌──────────┐ ┌──────────────┐ ┌────────────────────┐  │
   │  │SSH Proxy │ │ Guacamole    │ │ REST API           │  │
   │  │(ssh2)    │ │ Lite (RDP)   │ │ JWT + MFA + Audit  │  │
   │  └────┬─────┘ └──────┬───────┘ └────────┬───────────┘  │
   │       │              │                   │              │
   │  ┌────▼──────────────▼───────────────────▼──────────┐  │
   │  │            MySQL 数据库 (mysql2 连接池)             │  │
   │  │  users | assets | authz | sessions | audit_logs  │  │
   │  └──────────────────────────────────────────────────┘  │
   └────────────────────────────────────────────────────────┘
        │              │
   ┌────▼─────┐  ┌─────▼──────┐
   │ SSH 服务器│  │ RDP 服务器  │
   │ (Linux)  │  │ (Windows)  │
   └──────────┘  └────────────┘
```

### 关键架构决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| RDP 协议代理 | Guacamole (guacamole-lite) | 成熟方案，浏览器原生支持，无需客户端插件 |
| 数据库 | MySQL + mysql2 | 与腾讯云 CDB 兼容，支持连接池、预处理语句 |
| MFA 实现 | speakeasy (TOTP) | 轻量，无外部依赖，Google Authenticator 兼容 |
| 会话录像格式 | asciicast v2 (SSH) + Guacamole 原生 (RDP) | 开源格式，前端回放支持好 |
| 资产密码存储 | AES-256-CBC 加密 | 密钥由环境变量注入，不写入代码 |

---

## 三、后端方案

### 3.1 核心模块设计

```
server/src/
├── index.ts                # 入口 + WebSocket 路由 + 优雅关闭
├── app.ts                  # Express 中间件 + REST 路由
├── config.ts               # 统一配置管理（环境变量 + 默认值）
├── database/
│   ├── connection.ts       # MySQL 连接池（含心跳检测 + 自动重连）
│   ├── schema.sql          # DDL 建表脚本
│   └── migrate.ts          # JSON → MySQL 迁移脚本（含回滚能力）
├── middleware/
│   ├── auth.ts             # JWT 验证中间件
│   ├── rbac.ts             # RBAC 权限校验中间件（新建）
│   ├── rateLimiter.ts      # 接口限流中间件（新建）
│   ├── audit.ts            # 审计中间件（自动记录操作日志）
│   └── validator.ts        # 请求参数校验中间件（新建，基于 zod）
├── routes/
│   ├── auth.ts             # 登录/登出/me/MFA 设置
│   ├── users.ts            # 用户 CRUD
│   ├── assets.ts           # 资产 CRUD + 连接测试
│   ├── authorizations.ts   # 授权管理
│   └── audit.ts            # 审计日志查询 + 导出
├── terminal/
│   ├── sessionManager.ts   # 会话生命周期管理（创建/监控/超时断开）
│   ├── sshHandler.ts       # SSH 协议代理（已有）
│   ├── rdpHandler.ts       # RDP 协议代理（新建，Guacamole 桥接）
│   ├── screenRecorder.ts   # 屏幕录像/回放（新建）
│   └── dangerousCommands.ts # 危险命令检测与拦截（新建）
├── services/
│   ├── assetService.ts     # 资产业务逻辑
│   └── auditService.ts     # 审计业务逻辑
└── utils/
    ├── crypto.ts           # AES 加解密
    ├── logger.ts           # 结构化日志（winston/pino）
    └── response.ts         # 统一 API 响应格式
```

### 3.2 数据层：MySQL 表设计

**Node.js 驱动**: `mysql2`（支持 Promise API + 预处理语句 + 连接池）

**连接池配置**：
```typescript
// server/src/database/connection.ts
import mysql from 'mysql2/promise';

const pool = mysql.createPool({
  host:               process.env.DB_HOST || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306'),
  user:               process.env.DB_USER || 'bastion',
  password:           process.env.DB_PASSWORD,
  database:           process.env.DB_NAME || 'bastion_host',
  charset:            'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  // 心跳保活（防止 MySQL wait_timeout 断开）
  enableKeepAlive:    true,
  keepAliveInitialDelay: 10000, // 10s
});

// 启动时验证连接
pool.query('SELECT 1').then(() => console.log('MySQL connected')).catch(console.error);

export default pool;
```

**DDL 建表脚本** (`server/src/database/schema.sql`)：

```sql
CREATE DATABASE IF NOT EXISTS bastion_host
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE bastion_host;

-- ========== 用户表 ==========
CREATE TABLE users (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  username        VARCHAR(64)  NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('admin','operator','auditor') NOT NULL DEFAULT 'operator',
  email           VARCHAR(128) DEFAULT NULL,
  phone           VARCHAR(20)  DEFAULT NULL,
  totp_secret     VARCHAR(64)  DEFAULT NULL COMMENT 'TOTP 密钥（base32）',
  mfa_enabled     TINYINT(1)   NOT NULL DEFAULT 0,
  mfa_recovery    JSON         DEFAULT NULL COMMENT 'MFA 备用恢复码（bcrypt hash 存储）',
  status          ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login      DATETIME     DEFAULT NULL,
  login_fails     TINYINT      NOT NULL DEFAULT 0,
  locked_until    DATETIME     DEFAULT NULL COMMENT '登录锁定到期时间',
  password_changed_at DATETIME DEFAULT NULL COMMENT '密码最后修改时间（用于密码过期策略）',
  created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at      DATETIME     DEFAULT NULL COMMENT '软删除',
  INDEX idx_role (role),
  INDEX idx_status (status),
  INDEX idx_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 资产表 ==========
CREATE TABLE assets (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  name                  VARCHAR(128) NOT NULL,
  host                  VARCHAR(255) NOT NULL,
  port                  INT          NOT NULL,
  protocol              ENUM('ssh','rdp') NOT NULL,
  username              VARCHAR(64)  DEFAULT NULL,
  password_encrypted    TEXT         DEFAULT NULL COMMENT 'AES-256-CBC 加密',
  private_key_encrypted TEXT         DEFAULT NULL COMMENT 'SSH 私钥（AES 加密）',
  group_name            VARCHAR(64)  NOT NULL DEFAULT 'default',
  description           VARCHAR(512) DEFAULT NULL,
  status                ENUM('online','offline','unknown') NOT NULL DEFAULT 'unknown',
  last_checked_at       DATETIME     DEFAULT NULL COMMENT '最后连接测试时间',
  created_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at            DATETIME     DEFAULT NULL,
  INDEX idx_protocol (protocol),
  INDEX idx_group (group_name),
  INDEX idx_status (status),
  INDEX idx_deleted (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 授权表 ==========
CREATE TABLE authorizations (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT       NOT NULL,
  asset_id    INT       NOT NULL,
  start_time  DATETIME  DEFAULT NULL COMMENT '授权生效时间（NULL=永久有效）',
  end_time    DATETIME  DEFAULT NULL COMMENT '授权过期时间（NULL=永不过期）',
  granted_by  INT       DEFAULT NULL COMMENT '授权人 user_id',
  created_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_user_asset (user_id, asset_id),
  INDEX idx_user (user_id),
  INDEX idx_asset (asset_id),
  INDEX idx_end_time (end_time),
  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  FOREIGN KEY (asset_id) REFERENCES assets(id) ON DELETE CASCADE,
  FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 会话表 ==========
CREATE TABLE sessions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT          NOT NULL,
  asset_id        INT          NOT NULL,
  protocol        ENUM('ssh','rdp') NOT NULL,
  start_time      DATETIME(3)  NOT NULL COMMENT '毫秒精度',
  end_time        DATETIME(3)  DEFAULT NULL,
  duration_sec    INT          DEFAULT NULL COMMENT '会话时长（秒）',
  status          ENUM('active','closed','terminated','timeout') NOT NULL DEFAULT 'active',
  command_count   INT          NOT NULL DEFAULT 0,
  recording_path  VARCHAR(512) DEFAULT NULL COMMENT '录像文件路径',
  client_ip       VARCHAR(45)  DEFAULT NULL,
  termination_by  VARCHAR(32)  DEFAULT NULL COMMENT '断开方: user/system/admin',
  INDEX idx_user (user_id),
  INDEX idx_asset (asset_id),
  INDEX idx_status (status),
  INDEX idx_start_time (start_time),
  INDEX idx_end_time (end_time),
  FOREIGN KEY (user_id)  REFERENCES users(id),
  FOREIGN KEY (asset_id) REFERENCES assets(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 命令日志表 ==========
CREATE TABLE command_logs (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  session_id    INT          NOT NULL,
  timestamp     DATETIME(3)  NOT NULL COMMENT '毫秒精度，用于回放时间轴',
  command       TEXT         NOT NULL,
  is_dangerous  TINYINT(1)   NOT NULL DEFAULT 0,
  is_blocked    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '是否已被阻断',
  risk_level    ENUM('low','medium','high','critical') DEFAULT NULL,
  INDEX idx_session (session_id),
  INDEX idx_timestamp (timestamp),
  INDEX idx_dangerous (is_dangerous),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 审计日志表（通用操作审计）==========
CREATE TABLE audit_logs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          DEFAULT NULL,
  username    VARCHAR(64)  DEFAULT NULL COMMENT '冗余用户名，方便查询',
  action      VARCHAR(64)  NOT NULL COMMENT 'login/logout/create/update/delete/connect/disconnect',
  target_type VARCHAR(32)  DEFAULT NULL COMMENT 'user/asset/authorization/session',
  target_id   INT          DEFAULT NULL,
  detail      JSON         DEFAULT NULL COMMENT '操作详情（变更前后对比）',
  ip          VARCHAR(45)  DEFAULT NULL,
  user_agent  VARCHAR(512) DEFAULT NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_user (user_id),
  INDEX idx_action (action),
  INDEX idx_target (target_type, target_id),
  INDEX idx_created_at (created_at)
  -- 审计日志不做 FK：用户被删除后日志仍需保留
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========== 登录日志表（独立于审计日志，便于安全分析）==========
CREATE TABLE login_logs (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT          DEFAULT NULL,
  username    VARCHAR(64)  NOT NULL,
  ip          VARCHAR(45)  DEFAULT NULL,
  user_agent  VARCHAR(512) DEFAULT NULL,
  result      ENUM('success','fail_wrong_password','fail_no_user','fail_locked','fail_mfa') NOT NULL,
  mfa_used    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_user (user_id),
  INDEX idx_result (result),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**数据保留策略**：
| 表 | 保留期 | 清理方式 |
|----|--------|---------|
| `command_logs` | 90 天 | 定时任务，`DELETE WHERE timestamp < NOW() - INTERVAL 90 DAY` |
| `audit_logs` | 1 年 | 定时任务，按月归档到文件后清理 |
| `login_logs` | 180 天 | 定时任务自动清理 |
| `sessions` | 90 天（已关闭的） | 定时任务，连同录像文件一起清理 |

### 3.3 安全设计（增强）

#### 3.3.1 认证安全

```
登录流程（两阶段）：

第一阶段: POST /api/auth/login
  ├─ 检查 IP 是否在白名单（可选）
  ├─ 检查账号是否锁定（login_fails >= 5 且 locked_until > now）
  ├─ 验证 username + password（bcrypt.compare）
  ├─ 失败:
  │   ├─ login_fails += 1
  │   ├─ 达到 5 次 → locked_until = now + 15min
  │   └─ 记录 login_logs (fail_wrong_password)
  ├─ 成功:
  │   ├─ login_fails = 0, locked_until = null
  │   ├─ last_login = now
  │   └─ 如果 mfa_enabled → 返回 { requireMfa: true, mfaToken (5min 临时) }
  │   └─ 如果未启用 MFA → 返回 JWT token
  └─ 记录 login_logs

第二阶段: POST /api/auth/mfa/verify
  ├─ 验证 mfaToken（一次性，使用后立即失效）
  ├─ 验证 totpCode（speakeasy.totp.verify，窗口 ±1）
  ├─ 失败 → 记录 login_logs (fail_mfa)
  └─ 成功 → 返回 JWT token

密码策略:
  - 最小长度 8 位，必须包含字母 + 数字
  - 90 天过期提醒（password_changed_at）
  - 不能与最近 5 次密码重复（需 password_history 表或简单实现）
```

#### 3.3.2 API 安全

```
1. 全局限流（express-rate-limit）:
   - /api/auth/login: 每 IP 每分钟 5 次
   - /api/*: 每 IP 每分钟 60 次

2. JWT 设计:
   - Access Token: 有效期 2 小时，存储在内存（不存 localStorage 更好，但当前方案可接受）
   - 载荷: { userId, username, role, iat, exp }
   - 签名: HS256，密钥长度 ≥ 32 字节

3. RBAC 权限矩阵:
   | 操作               | admin | operator | auditor |
   |--------------------|-------|----------|---------|
   | 用户管理 CRUD       | ✅    | ❌       | ❌      |
   | 资产管理 CRUD       | ✅    | ❌       | ❌      |
   | 授权管理            | ✅    | ❌       | ❌      |
   | SSH/RDP 连接        | ✅    | ✅ (有授权)| ❌    |
   | 查看审计日志         | ✅    | ❌       | ✅      |
   | 查看 Dashboard      | ✅    | ✅       | ✅      |

4. 审计日志防篡改:
   - 每条 audit_log 的 detail JSON 中加入 prev_hash（上一条日志的 SHA-256）
   - 形成哈希链，任何篡改都会破坏链条
   - 定期（每小时）生成快照哈希并存储到独立介质
```

#### 3.3.3 会话安全

```
1. 空闲超时: 15 分钟无操作自动断开（服务端定时器）
2. 最大会话时长: 8 小时强制断开
3. 单用户最大并发: 5 个会话
4. 同资产并发: 允许（审计员可同时监控）
5. 断开时:
   - 记录 sessions.end_time + duration_sec
   - 关闭 SSH/RDP 连接
   - 保存录像文件
   - 广播状态变更
```

### 3.4 RDP 代理实现（Guacamole 方案）

#### 后端 (server/src/terminal/rdpHandler.ts)

```
依赖: guacamole-lite

guacamole-lite 内置了 Guacamole 协议解析和 RDP 客户端。

核心流程:
1. WebSocket 连接 → /ws/rdp?token=xxx
2. 验证 JWT + 资产授权
3. 创建 GuacamoleLite 客户端:
   {
     connection: {
       type: 'rdp',
       settings: {
         hostname:     asset.host,
         port:         asset.port,
         username:     asset.username,
         password:     decrypt(asset.password_encrypted),
         'ignore-cert': true,
         security:     'any',
         'enable-wallpaper': false,
         'enable-font-smoothing': true,
         'enable-drive': false,       // 暂不启用磁盘映射
         'create-drive-path': false,
         'disable-copy': false,       // 允许剪贴板
         'disable-paste': false,
       }
     }
   }
4. WebSocket ↔ GuacamoleLite 双向桥接
5. 记录会话 + 审计日志
6. 处理 reconnect: Guacamole 支持断线重连（相同 connectionId）

运行环境要求:
- CentOS/RHEL: yum install libguac-client-rdp
- Ubuntu/Debian: apt install libguac-client-rdp
- 开发环境 (Windows): Docker 运行 guacamole/guacd 容器
  docker run -d --name guacd -p 4822:4822 guacamole/guacd
  然后 guacamole-lite 连接 localhost:4822

备选方案（如果原生依赖困难）:
- Iron RDP: 纯 JS RDP 客户端，无需原生依赖，但性能和兼容性不如 Guacamole
```

#### 前端 (client/src/pages/TerminalRDP.tsx)

```
依赖: guacamole-common-js

核心流程:
1. 路由: /terminal/rdp/:assetId?
2. 组件加载:
   ├─ 根据 assetId 获取资产信息
   ├─ 创建 <canvas> 全屏自适应容器
   ├─ 实例化 Guacamole.Client:
   │   new Guacamole.Client(
   │     new Guacamole.WebSocketTunnel('/ws/rdp') + '?token=' + token
   │   )
   ├─ 获取 Display: client.getDisplay()
   ├─ 绑定到 Canvas
   ├─ 注册 Mouse: new Guacamole.Mouse(display)
   ├─ 注册 Keyboard: new Guacamole.Keyboard(document)
   └─ 处理 onstatechange:
       ├─ CONNECTING → 显示加载中
       ├─ CONNECTED  → 隐藏加载，开始渲染
       ├─ DISCONNECTING → 显示断开中
       └─ DISCONNECTED → 5 秒后自动重连或手动重连
3. 工具栏:
   ├─ 连接状态 Badge
   ├─ 剪贴板同步: 双向（需用户确认）
   ├─ 全屏切换: document.fullscreenElement API
   ├─ 发送 Ctrl+Alt+Del: client.sendKeyEvent(1, 0xFFE3, true) + sendKeyEvent(1, 0xFFE9, true) + sendKeyEvent(1, 0xFFFF, true)
   └─ 断开按钮
4. resize 处理:
   └─ window resize → 获取 Canvas 实际尺寸 → client.sendSize(width, height)
```

### 3.5 MFA 多因素认证

详见 [3.3.1 认证安全](#331-认证安全)，补充接口设计：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录（返回 token 或 requireMfa） |
| POST | `/api/auth/mfa/verify` | 验证 TOTP，返回正式 JWT |
| POST | `/api/auth/mfa/setup` | 生成 TOTP secret + otpauth URL |
| POST | `/api/auth/mfa/enable` | 验证后启用 MFA |
| POST | `/api/auth/mfa/disable` | 禁用 MFA（需验证密码） |
| POST | `/api/auth/mfa/recovery` | 使用恢复码登录 |

### 3.6 会话录像与回放

```
方案: 终端输入/输出流记录

SSH 录像:
  - 在 sshHandler.ts 中，所有 data 事件双写（一份到 SSH stream，一份到录像文件）
  - 格式: asciicast v2（JSONL，每行 [time, type, data]）
  - 存储路径: recordings/{sessionId}.cast
  - 前端回放: asciinema-player 组件

RDP 录像:
  - Guacamole 原生支持 session recording
  - 配置 guacamole-lite 的 recording_path 参数
  - 格式: Guacamole 内部格式，可转为视频

录像管理:
  - 保留期: 90 天（与 sessions 表同步清理）
  - 重要会话可标记为 "永久保留"
  - 回放接口: GET /api/sessions/:id/recording（流式返回）
  - 回放速度: 1x / 2x / 4x / 8x
```

### 3.7 危险命令拦截

```
1. 危险命令规则库（支持正则）:

   | 等级     | 正则                                     | 行为     |
   |----------|------------------------------------------|----------|
   | critical | rm\s+-rf\s+/                            | 阻断+告警 |
   | critical | :(){ :|:& };:                            | 阻断+告警 |
   | high     | drop\s+table\s+\w+                      | 阻断+确认 |
   | high     | truncate\s+table\s+\w+                  | 阻断+确认 |
   | high     | shutdown\s+-                             | 阻断+告警 |
   | medium   | DROP\s+DATABASE                         | 阻断+确认 |
   | medium   | >\s*/dev/sda                            | 阻断+告警 |
   | low      | DELETE\s+FROM\s+\w+\s+WHERE             | 记录+告警 |

2. 命令在执行前流经检测:
   ├─ 匹配 critical → 阻断 + 弹窗告警 + 记录 audit_logs
   ├─ 匹配 high → 阻断 + 管理后台弹确认框（需输入"确认执行"）
   ├─ 匹配 medium → 阻断 + 二次确认
   ├─ 匹配 low → 放行 + 记录 command_logs (is_dangerous=1) + 通知管理员
   └─ 无匹配 → 放行

3. 白名单机制:
   - 管理员可为特定资产/用户配置命令白名单
   - 白名单中的命令直接放行（即使是危险命令）
```

### 3.8 优雅关闭

```typescript
// server/src/index.ts
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  // 1. 停止接收新连接
  server.close();
  // 2. 通知所有活跃会话
  sessionManager.broadcast({ type: 'system', message: 'Server shutting down...' });
  // 3. 等待会话自然关闭（最多 10 秒）
  await sessionManager.drain(10000);
  // 4. 关闭数据库连接池
  await pool.end();
  // 5. 退出
  process.exit(0);
});
```

---

## 四、前端方案

### 4.1 页面结构

```
client/src/
├── App.tsx                    # 路由配置 + Error Boundary
├── main.tsx                   # 入口（ConfigProvider 暗色主题注入）
├── components/
│   ├── Layout.tsx             # 主布局（侧边栏 + 顶栏 + 面包屑）
│   ├── ErrorBoundary.tsx      # 错误边界组件（新建）
│   ├── BreadcrumbNav.tsx      # 面包屑导航（新建）
│   ├── LoadingSkeleton.tsx    # 通用骨架屏（新建）
│   ├── EmptyState.tsx         # 空状态组件（新建）
│   ├── PageHeader.tsx         # 页面标题统一组件（新建）
│   ├── AssetSelector.tsx      # 资产选择器（新建）
│   ├── MfaSetup.tsx           # MFA 设置组件（新建）
│   └── SessionPlayer.tsx      # 会话回放组件（新建）
├── pages/
│   ├── Login.tsx              # 登录页（增强：MFA 两阶段 + TDesign Input）
│   ├── Dashboard.tsx          # 仪表盘（增强统计）
│   ├── Assets.tsx             # 资产管理（TDesign Table + Pagination）
│   ├── Users.tsx              # 用户管理（TDesign Table + Pagination）
│   ├── Authorizations.tsx     # 授权管理（统一 TDesign Dialog）
│   ├── AuditLog.tsx           # 审计日志（TDesign Table 展开行）
│   ├── TerminalSSH.tsx        # SSH 终端（修复 Bug + 多会话 Tab）
│   ├── TerminalRDP.tsx        # RDP 终端（Guacamole 实现）
│   ├── SessionReplay.tsx      # 会话回放页（新建）
│   └── NotFound.tsx           # 404 页面（新建）
├── hooks/
│   ├── useAuth.ts
│   ├── useTerminal.ts         # SSH 终端 hook
│   ├── useWebSocket.ts        # WebSocket hook（增强：心跳 + 自动重连）
│   ├── useRdp.ts              # RDP/Guacamole hook（新建）
│   ├── useMfa.ts              # MFA hook（新建）
│   └── usePagination.ts       # 分页 hook（新建）
├── services/
│   ├── api.ts                 # axios 实例
│   ├── authService.ts
│   ├── assetService.ts
│   ├── userService.ts
│   ├── auditService.ts
│   └── mfaService.ts          # MFA 服务（新建）
├── stores/
│   ├── authStore.ts           # Zustand 认证状态（修复 hydration）
│   └── appStore.ts            # 全局应用状态（新建）
├── types/
│   └── index.ts               # 类型定义
└── styles/
    └── globals.css            # 全局样式 + Tailwind + TDesign 暗色变量
```

### 4.2 新增依赖

```json
// client/package.json 新增
{
  "guacamole-common-js": "file:./public/guacamole-common-js",
  "asciinema-player": "^3.8.0",
  "qrcode": "^1.5.4"
}

// server/package.json 新增
{
  "guacamole-lite": "^0.6.0",
  "mysql2": "^3.11.0",
  "speakeasy": "^2.0.0",
  "zod": "^3.23.0",
  "express-rate-limit": "^7.4.0",
  "multer": "^1.4.5",
  "csv-parse": "^5.6.0"
}
```

### 4.3 zustand 水合问题修复

```typescript
// authStore.ts - 在 onRehydrateStorage 中确保 hydration 完成
export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      _hasHydrated: false,
      // ...
    }),
    {
      name: 'bastion-auth',
      partialize: (state) => ({ token: state.token, user: state.user }),
      onRehydrateStorage: () => (state, error) => {
        if (!error && state) {
          useAuthStore.setState({ _hasHydrated: true });
        }
      },
    }
  )
);

// App.tsx - 等待 hydration 完成再渲染路由
function App() {
  const { token, _hasHydrated } = useAuthStore();

  if (!_hasHydrated) {
    return <LoadingSkeleton fullScreen />;  // 或 null（闪烁最小）
  }

  return (
    <Routes>
      {/* ... */}
    </Routes>
  );
}
```

### 4.4 WebSocket 健壮性增强

```typescript
// useWebSocket.ts 增强版
// 新增特性:
// 1. 心跳检测: 每 30 秒发送 ping，60 秒无 pong 则重连
// 2. 指数退避重连: 1s → 2s → 4s → 8s → 16s → 30s (max)
// 3. 连接状态枚举: CONNECTING | OPEN | CLOSING | CLOSED | RECONNECTING
// 4. 消息队列: 重连期间缓存待发送消息，重连成功后批量发送
```

---

## 五、UI 设计方案

### 5.1 TDesign 暗色主题适配

```css
/* globals.css 追加 */
:root[theme-mode="dark"],
html.dark {
  --td-brand-color: #06B6D4;
  --td-brand-color-hover: #22D3EE;
  --td-brand-color-active: #0891B2;
  --td-brand-color-focus: rgba(6, 182, 212, 0.2);
  --td-brand-color-light: rgba(6, 182, 212, 0.1);

  --td-bg-color-page: #0F172A;
  --td-bg-color-container: #1E293B;
  --td-bg-color-container-hover: #334155;
  --td-bg-color-container-active: #475569;
  --td-bg-color-component: #1E293B;
  --td-bg-color-component-hover: #334155;
  --td-bg-color-component-disabled: #0F172A;

  --td-text-color-primary: #F8FAFC;
  --td-text-color-secondary: #94A3B8;
  --td-text-color-placeholder: #475569;
  --td-text-color-disabled: #475569;
  --td-text-color-anti: #0F172A;
  --td-text-color-brand: #06B6D4;

  --td-border-level-1-color: #334155;
  --td-border-level-2-color: #475569;

  --td-shadow-1: 0 1px 10px rgba(0, 0, 0, 0.15);
  --td-shadow-2: 0 3px 14px 2px rgba(0, 0, 0, 0.15);
  --td-shadow-3: 0 6px 30px 5px rgba(0, 0, 0, 0.15);

  --td-error-color: #EF4444;
  --td-warning-color: #F59E0B;
  --td-success-color: #22C55E;

  --td-form-bg-color: #1E293B;
  --td-input-bg-color: #0F172A;
}
```

### 5.2 管理页面统一规范

所有管理页面采用统一模式：

```
┌─────────────────────────────────────────────┐
│  <PageHeader title="资产管理" breadcrumb />  │
│  ┌─────────────────────────────────────────┐│
│  │ 搜索/筛选栏                               ││
│  │ [搜索框] [协议] [状态] [添加按钮]         ││
│  └─────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────┐│
│  │ <Table> 组件                             ││
│  │  - columns 配置列                         ││
│  │  - data 绑定数据                          ││
│  │  - 内置排序 + 筛选                        ││
│  │  - rowKey="id"                           ││
│  └─────────────────────────────────────────┘│
│  <Pagination> 分页                           │
└─────────────────────────────────────────────┘
```

**替换计划**：
| 页面 | 当前 | 改为 |
|------|------|------|
| Assets | 手写 `<table>` | TDesign `<Table>` + `<Pagination>` |
| Users | 手写 `<table>` | TDesign `<Table>` + `<Pagination>` |
| Authorizations | 手写 Modal | TDesign `<Dialog>` |
| AuditLog | 手写 `<table>` + 展开行 | TDesign `<Table>` + `expandedRow` |

### 5.3 响应式设计

| 断点 | 宽度 | 布局变化 |
|------|------|---------|
| Desktop | ≥1024px | 侧边栏 220px + 内容区 |
| Tablet | 768-1023px | 侧边栏折叠为图标（60px），hover 展开 |
| Mobile | <768px | 侧边栏隐藏，顶栏汉堡菜单弹出 Drawer |

### 5.4 交互规范

| 场景 | 实现方式 |
|------|---------|
| 数据加载 | `<Loading>` 全屏遮罩 + `<Skeleton>` 骨架屏 |
| 空状态 | 统一 `<EmptyState>` 组件（图标 + 引导文字 + CTA 按钮） |
| 操作确认 | `<Popconfirm>` 删除，`<Dialog>` 确认重要操作 |
| 操作反馈 | `<MessagePlugin>` (success/warning/error/loading) |
| 表单验证 | TDesign Form 内置规则 + zod schema |
| 错误兜底 | `<ErrorBoundary>` 捕获渲染错误，显示友好恢复页 |
| 全局搜索 | `Ctrl+K` 唤起搜索 Dialog（搜索资产/用户/会话） |

---

## 六、实施路线图

### Phase 1: 基础设施升级 + Bug 修复（1-2 周）
| # | 任务 | 类型 |
|----|------|------|
| 1.1 | JSON → MySQL 迁移（schema.sql + migrate.ts） | 后端 |
| 1.2 | 统一配置管理 `config.ts` + 结构化日志 `logger.ts` | 后端 |
| 1.3 | API 统一响应格式 + 错误处理中间件 | 后端 |
| 1.4 | 限流中间件 + 登录失败锁定 | 后端 |
| 1.5 | TDesign 暗色主题 CSS 变量覆盖 | 前端 |
| 1.6 | 修复 `handleConnect` Bug（TerminalSSH.tsx） | 前端 |
| 1.7 | 修复侧边栏高亮（Layout.tsx `useLocation`） | 前端 |
| 1.8 | 修复 zustand hydration 竞态（App.tsx + authStore.ts） | 前端 |
| 1.9 | 添加 404 页面 + ErrorBoundary | 前端 |

### Phase 2: RDP 终端实现（1-2 周）
| # | 任务 | 类型 |
|----|------|------|
| 2.1 | 后端 rdpHandler.ts（guacamole-lite 桥接） | 后端 |
| 2.2 | WebSocket 路由 `/ws/rdp` + JWT 验证 | 后端 |
| 2.3 | 前端 useRdp hook（Guacamole Client 封装） | 前端 |
| 2.4 | 前端 TerminalRDP.tsx（Canvas + 工具栏） | 前端 |
| 2.5 | Guacamole 原生依赖安装文档 | 文档 |

### Phase 3: 安全增强（1-2 周）
| # | 任务 | 类型 |
|----|------|------|
| 3.1 | MFA 多因素认证（speakeasy + TOTP） | 全栈 |
| 3.2 | RBAC 权限中间件 + API 权限校验 | 后端 |
| 3.3 | 危险命令检测 + 阻断 + 告警 | 后端 |
| 3.4 | 审计日志哈希链（防篡改） | 后端 |
| 3.5 | WebSocket 心跳 + 自动重连 | 前端 |
| 3.6 | 审计日志查询增强（时间线视图） | 前端 |

### Phase 4: UI 组件化 + 体验提升（1-2 周）
| # | 任务 | 类型 |
|----|------|------|
| 4.1 | Assets/Users 表格改用 TDesign Table + Pagination | 前端 |
| 4.2 | Authorizations 弹窗统一为 TDesign Dialog | 前端 |
| 4.3 | AuditLog 表格改用 TDesign Table 展开行 | 前端 |
| 4.4 | 面包屑导航 + PageHeader 统一组件 | 前端 |
| 4.5 | 骨架屏 + 空状态组件 | 前端 |
| 4.6 | 表单验证（Login + 所有 CRUD 弹窗） | 前端 |
| 4.7 | 全局搜索（Ctrl+K） | 前端 |

### Phase 5: 审计 + 运维增强（1-2 周）
| # | 任务 | 类型 |
|----|------|------|
| 5.1 | SSH 会话录像（asciicast v2） | 后端 |
| 5.2 | SessionReplay 回放播放器 | 前端 |
| 5.3 | 审计日志导出（CSV/Excel） | 后端 |
| 5.4 | 活跃会话监控（管理员实时查看） | 全栈 |
| 5.5 | 会话超时自动断开（sessionManager 定时器） | 后端 |
| 5.6 | 资产批量导入（CSV） | 全栈 |
| 5.7 | SSH 私钥认证支持 | 后端 |
| 5.8 | 数据保留定时清理任务 | 后端 |

### Phase 6: 生产就绪（1 周）
| # | 任务 | 类型 |
|----|------|------|
| 6.1 | Dockerfile + docker-compose.yml | DevOps |
| 6.2 | 健康检查端点 `/health` + `/ready` | 后端 |
| 6.3 | 优雅关闭逻辑 | 后端 |
| 6.4 | 环境变量文档 + 示例 `.env.example` | 文档 |
| 6.5 | 响应式适配（Tablet/Mobile） | 前端 |
| 6.6 | 前端构建产物托管到 Express 静态服务 | DevOps |

---

## 七、关键接口设计

### 7.1 WebSocket 协议

**SSH 终端 (`/ws/ssh?token=xxx`)**
```json
// Client → Server
{"type":"connect",    "assetId":1}
{"type":"input",      "data":"ls -la\n"}
{"type":"resize",     "cols":80, "rows":24}
{"type":"disconnect"}
{"type":"ping"}

// Server → Client
{"type":"connected",    "sessionId":"abc123"}
{"type":"output",       "data":"[root@server ~]# "}
{"type":"error",        "message":"Connection refused"}
{"type":"disconnected", "reason":"user/timeout/error"}
{"type":"pong"}
{"type":"alert",        "level":"warning", "message":"危险命令已被拦截: rm -rf /"}
```

**RDP 终端 (`/ws/rdp?token=xxx`)**
```
使用 Guacamole 协议（二进制 + JSON 混合）
指令: connect, sync, mouse, key, clipboard, disconnect, size, audio
由 guacamole-lite 和 guacamole-common-js 自动处理
```

### 7.2 REST API

| 方法 | 路径 | 权限 | 说明 |
|------|------|------|------|
| POST | `/api/auth/login` | public | 登录（支持 MFA 两阶段） |
| POST | `/api/auth/mfa/verify` | public (mfaToken) | MFA 验证 |
| POST | `/api/auth/mfa/setup` | user | 生成 MFA 密钥 |
| POST | `/api/auth/mfa/enable` | user | 启用 MFA |
| POST | `/api/auth/logout` | user | 登出 |
| GET | `/api/auth/me` | user | 获取当前用户信息 |
| GET | `/api/users` | admin | 用户列表（分页） |
| POST | `/api/users` | admin | 创建用户 |
| PUT | `/api/users/:id` | admin | 更新用户 |
| DELETE | `/api/users/:id` | admin | 删除用户（软删除） |
| GET | `/api/assets` | user | 资产列表（分页+筛选） |
| POST | `/api/assets` | admin | 创建资产 |
| PUT | `/api/assets/:id` | admin | 更新资产 |
| DELETE | `/api/assets/:id` | admin | 删除资产 |
| POST | `/api/assets/:id/test` | user | 测试连接 |
| POST | `/api/assets/import` | admin | 批量导入（CSV） |
| GET | `/api/authorizations` | admin | 授权列表 |
| POST | `/api/authorizations` | admin | 创建授权 |
| DELETE | `/api/authorizations/:id` | admin | 删除授权 |
| GET | `/api/sessions` | user | 我的会话列表 |
| GET | `/api/sessions/active` | admin | 所有活跃会话（监控） |
| POST | `/api/sessions/:id/terminate` | admin | 强制断开 |
| GET | `/api/sessions/:id/recording` | user | 获取录像 |
| GET | `/api/audit` | admin/auditor | 审计日志（分页+筛选） |
| GET | `/api/audit/export` | admin/auditor | 导出审计日志 |
| GET | `/api/audit/stats` | admin/auditor | 审计统计 |
| GET | `/health` | public | 健康检查 |

---

## 八、部署与运维

### 8.1 开发环境

```bash
# 前置条件
# 1. Node.js >= 18
# 2. MySQL >= 8.0（或 Docker: docker run -d --name mysql -p 3306:3306 -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=bastion_host mysql:8.0）
# 3. Guacamole daemon（Docker: docker run -d --name guacd -p 4822:4822 guacamole/guacd）

# 后端
cd server
cp .env.example .env   # 填写 DB_HOST, DB_PASSWORD, JWT_SECRET 等
npm install
npm run dev             # tsx watch → :3001

# 前端
cd client
npm install
npm run dev             # vite → :5173（proxy /api → :3001, /ws → :3001）
```

### 8.2 Docker 部署

```dockerfile
# server/Dockerfile
FROM node:18-alpine
RUN apk add --no-cache libguac-client-rdp  # Guacamole RDP 客户端
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist/ ./dist/
COPY public/ ./public/
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

```yaml
# docker-compose.yml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
      MYSQL_DATABASE: bastion_host
      MYSQL_USER: bastion
      MYSQL_PASSWORD: ${DB_PASSWORD}
    volumes:
      - mysql_data:/var/lib/mysql
      - ./server/src/database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost"]
      interval: 10s
      retries: 5

  guacd:
    image: guacamole/guacd:latest
    restart: unless-stopped

  bastion:
    build: ./server
    ports:
      - "3001:3001"
    environment:
      NODE_ENV: production
      DB_HOST: mysql
      DB_USER: bastion
      DB_PASSWORD: ${DB_PASSWORD}
      DB_NAME: bastion_host
      JWT_SECRET: ${JWT_SECRET}
      ENCRYPTION_SECRET: ${ENCRYPTION_SECRET}
      GUACD_HOST: guacd
      GUACD_PORT: 4822
    depends_on:
      mysql:
        condition: service_healthy
      guacd:
        condition: service_started

  # 可选：Nginx 反向代理（SSL 终结）
  nginx:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - bastion

volumes:
  mysql_data:
```

### 8.3 环境变量清单

```env
# === 服务器 ===
NODE_ENV=production|development
PORT=3001

# === JWT ===
JWT_SECRET=<至少 32 字节随机字符串>
JWT_EXPIRES_IN=2h

# === 加密 ===
ENCRYPTION_SECRET=<32 字节十六进制密钥，用于 AES-256-CBC>

# === 数据库 ===
DB_HOST=localhost
DB_PORT=3306
DB_USER=bastion
DB_PASSWORD=<数据库密码>
DB_NAME=bastion_host

# === Guacamole (RDP) ===
GUACD_HOST=localhost
GUACD_PORT=4822

# === 日志 ===
LOG_LEVEL=debug|info|warn|error

# === 会话 ===
SESSION_IDLE_TIMEOUT=900        # 空闲超时（秒），默认 15 分钟
SESSION_MAX_DURATION=28800      # 最大时长（秒），默认 8 小时
MAX_SESSIONS_PER_USER=5

# === 安全 ===
LOGIN_MAX_FAILS=5               # 登录失败锁定阈值
LOGIN_LOCK_MINUTES=15           # 锁定时长（分钟）
PASSWORD_MIN_LENGTH=8
PASSWORD_EXPIRE_DAYS=90         # 密码过期天数

# === 保留策略 ===
COMMAND_LOG_RETENTION_DAYS=90
AUDIT_LOG_RETENTION_DAYS=365
SESSION_RETENTION_DAYS=90
```

### 8.4 健康检查

```
GET /health  → 200 { status: "ok", uptime: 12345, db: "connected", guacd: "connected" }
GET /ready   → 200 { status: "ready" } 或 503 { status: "not_ready", reason: "db_not_connected" }
```

---

## 九、与腾讯云架构集成

堡垒机部署在 **腾讯云 VPC 内**：

```
┌──────────────────────────────────────────────────────┐
│              腾讯云 VPC (10.0.0.0/16)                 │
│                                                      │
│  ┌─────────────────┐    ┌──────────────────────┐     │
│  │ 堡垒机 (CVM)     │    │ 目标服务器集群          │     │
│  │ 10.0.3.10       │    │                      │     │
│  │                 │    │ Web 层: 10.0.1.x     │     │
│  │ 公网 CLB + SSL  │────│ DB 层:  10.0.2.x     │     │
│  │ 443 → 3001      │    │ SQL Server AG 组     │     │
│  │                 │    │ Windows RDP 服务器    │     │
│  └─────────────────┘    └──────────────────────┘     │
│                                                      │
│  安全组规则:                                          │
│  - CLB(443) → 堡垒机(3001): 允许                       │
│  - 堡垒机 → 内网:22/3389/1433: 允许                   │
│  - 堡垒机 → MySQL(CDB):3306: 允许                     │
│  - 其他方向: 默认拒绝                                   │
└──────────────────────────────────────────────────────┘
```

**腾讯云服务清单**：
| 服务 | 用途 | 规格建议 |
|------|------|---------|
| CVM | 堡垒机应用服务器 | 4C8G，CentOS 7.9 |
| CDB (MySQL) | 堡垒机数据库 | 2C4G，100GB，开启备份 |
| CLB | 公网负载均衡 + SSL 证书 | 按量计费 |
| CBS | 录像文件存储 | 100GB，按需扩容 |
| COS (可选) | 录像归档（低频存储） | 按量计费 |

---

## 十、风险评估与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| Guacamole 原生依赖安装失败 | 中 | 高 | Docker 运行 guacd 容器；备选 Iron RDP |
| JSON → MySQL 迁移数据丢失 | 低 | 高 | 迁移前自动备份 JSON 文件到 `.bak`；支持 `--rollback` |
| MySQL 连接中断导致服务不可用 | 低 | 高 | mysql2 连接池自动重连；maxReconnects=3；健康检查告警 |
| WebSocket 断连导致终端会话丢失 | 中 | 中 | 前端指数退避重连；Guacamole 原生支持 reconnect |
| 审计日志数据量大导致查询慢 | 中 | 中 | 分区表（按月）；定时归档；ES 可选升级 |
| 单点故障（堡垒机 CVM 宕机） | 低 | 高 | CLB 健康检查 + 自动切换；数据库 CDB 主备切换 |
| RDP 剪贴板/驱动器映射数据泄露 | 低 | 中 | 默认关闭驱动器映射；剪贴板需用户确认 |

---

## 十一、测试策略（新增）

| 层级 | 工具 | 覆盖范围 |
|------|------|---------|
| 后端单元测试 | Vitest + Supertest | 所有 service + route handler |
| 前端组件测试 | Vitest + Testing Library | 关键页面 + 核心组件 |
| API 集成测试 | Supertest | 完整 CRUD 流程 + 认证流程 |
| WebSocket 测试 | ws + 自定义 client | SSH 连接 + 输入/输出流 |
| E2E | Playwright (Phase 6) | 登录 → 资产管理 → SSH 连接 → 审计 |
```

---

## 十二、文档清单（新增）

| 文档 | 说明 |
|------|------|
| `README.md` | 项目概述 + 快速启动 |
| `ARCHITECTURE.md` | 架构设计文档 |
| `API.md` | API 接口文档（可用 Swagger 生成） |
| `DEPLOYMENT.md` | 部署运维手册 |
| `CHANGELOG.md` | 版本变更记录 |
| `server/.env.example` | 环境变量模板 |
