FROM node:18-alpine AS server-build

WORKDIR /app

# Use npm mirror for China
RUN npm config set registry https://registry.npmmirror.com

COPY server/package*.json ./
RUN npm install
COPY server/tsconfig.json ./
COPY server/src/ ./src/
RUN npm run build

# ---- Build client ----
FROM node:18-alpine AS client-build

WORKDIR /app

RUN npm config set registry https://registry.npmmirror.com

COPY client/package.json ./
RUN npm install
COPY client/ ./
RUN npm run build

# ---- Runtime ----
FROM node:18-alpine

# Use npm mirror for China
RUN npm config set registry https://registry.npmmirror.com

# Install Guacamole RDP client library
RUN apk add --no-cache libguac-client-rdp openssh-client tzdata && \
    ln -sf /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone

WORKDIR /app

COPY server/package*.json ./
RUN npm install --omit=dev

COPY --from=server-build /app/dist ./dist
COPY --from=server-build /app/src/database/schema.sql ./src/database/schema.sql
COPY --from=client-build /app/dist /client/dist

# Create recordings directory
RUN mkdir -p /app/recordings

EXPOSE 3001

CMD ["node", "dist/index.js"]
