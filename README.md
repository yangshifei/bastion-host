# 🏰 Bastion Host (堡垒机)

A comprehensive Bastion Host web application for secure remote server access management.

## Features

- **SSH Terminal** — Web-based SSH terminal via xterm.js with WebSocket proxy
- **RDP Terminal** — Web-based RDP client via Guacamole protocol relay
- **MFA (Multi-Factor Authentication)** — TOTP-based 2FA with recovery codes
- **Asset Management** — CRUD for SSH/RDP servers with encrypted credential storage
- **User Management** — Role-based access control (admin, operator, auditor)
- **Authorization Management** — User-to-asset binding with time-based access
- **Audit Logging** — Full operation audit trail with detailed change tracking
- **Command Logging** — All terminal commands logged with dangerous command detection
- **Session Recording** — asciicast v2 format recording with web playback
- **Dangerous Command Blocking** — Real-time detection and blocking of destructive commands

## Architecture

```
Browser ──HTTP──▶ Express (REST + JWT + MFA)
  │                  │
  ├──WS──▶ SSH Proxy (ssh2) ──▶ SSH Servers
  │                  │
  └──WS──▶ RDP Proxy (guacamole-lite→guacd) ──▶ RDP Servers
                     │
                  MySQL (7 tables)
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, TDesign, xterm.js, Zustand |
| Backend | Express, TypeScript, WebSocket (ws), ssh2, JWT, bcrypt, speakeasy |
| Database | MySQL 8.0 + mysql2 |
| RDP | Guacamole (guacd + guacamole-lite) |

## Quick Start (Development)

### Prerequisites

- Node.js >= 18
- MySQL >= 8.0
- Docker (for RDP support via guacd)

### Setup

```bash
# 1. Clone & install
cd E:/vscodeai
npm install

# 2. Start MySQL (if not running)
docker run -d --name mysql -p 3306:3306 \
  -e MYSQL_ROOT_PASSWORD=root123 \
  -e MYSQL_DATABASE=bastion_host \
  -e MYSQL_USER=bastion \
  -e MYSQL_PASSWORD=bastion123 \
  mysql:8.0

# 3. (Optional) Start guacd for RDP support
docker run -d --name guacd -p 4822:4822 guacamole/guacd

# 4. Run database migration
cd server
npm run migrate

# 5. Start development servers
cd ..
npm run dev

# Backend: http://localhost:3001
# Frontend: http://localhost:5173
```

### Default Admin Account

- Username: `admin`
- Password: `admin123`

## Environment Variables

See [.env.example](.env.example) for the complete list.

Key variables:
- `JWT_SECRET` — JWT signing secret (min 32 bytes)
- `ENCRYPTION_SECRET` — AES-256 key for credential encryption (32 hex chars)
- `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` — MySQL connection
- `GUACD_HOST`, `GUACD_PORT` — Guacamole daemon for RDP

## Docker Deployment

```bash
# Build and start all services
docker-compose up -d

# Services:
# - MySQL (3306)
# - guacd (4822)
# - Bastion App (3001)
# - Nginx (443/80)
```

## Project Structure

```
vscodeai/
├── server/                    # Express backend
│   └── src/
│       ├── index.ts           # Entry + WebSocket routing
│       ├── app.ts             # Express configuration
│       ├── config.ts          # Environment configuration
│       ├── database/          # MySQL connection + schema
│       ├── middleware/         # Auth, RBAC, rate limiting, validation
│       ├── routes/            # REST API routes
│       ├── terminal/          # SSH/RDP handlers + session manager
│       ├── services/          # Business logic
│       └── utils/             # Crypto, logging, response helpers
├── client/                    # React frontend
│   └── src/
│       ├── components/        # Reusable UI components
│       ├── pages/             # Page components
│       ├── hooks/             # Custom React hooks
│       ├── services/          # API client services
│       ├── stores/            # Zustand state stores
│       └── types/             # TypeScript types
├── docker-compose.yml         # Full stack deployment
├── nginx.conf                 # Reverse proxy config
└── PLAN.md                    # Detailed design document
```

## RBAC Permissions

| Action | Admin | Operator | Auditor |
|--------|-------|----------|---------|
| User/Asset CRUD | ✅ | ❌ | ❌ |
| Authorization | ✅ | ❌ | ❌ |
| SSH/RDP Connect | ✅ | ✅ (with authz) | ❌ |
| View Audit Logs | ✅ | ❌ | ✅ |
| Dashboard | ✅ | ✅ | ✅ |

## License

MIT
