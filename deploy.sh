#!/bin/bash
set -euo pipefail

# ===== 配置区 =====
PROJECT_DIR="/home/admin/projects/fe-monitor"
NGINX_CONF="/etc/nginx/conf.d/fe-monitor.conf"
PM2_NAME="fe-monitor-server"
SERVER_PORT=3100
HEALTH_URL="http://127.0.0.1:${SERVER_PORT}/health"
LOG_FILE="${PROJECT_DIR}/deploy.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# ===== 日志函数 =====
log() { echo "[${TIMESTAMP}] $1" | tee -a "${LOG_FILE}"; }
error() { log "ERROR: $1"; exit 1; }

# ===== 前置检查 =====
log "===== 开始部署 fe-monitor ====="
cd "${PROJECT_DIR}" || error "无法进入项目目录 ${PROJECT_DIR}"

# 检查关键文件是否存在
[ -f "apps/server/dist/index.js" ] || error "后端构建产物缺失: apps/server/dist/index.js"
[ -f "apps/admin/dist/index.html" ] || error "前端构建产物缺失: apps/admin/dist/index.html"
[ -f "${NGINX_CONF}" ] || error "Nginx配置文件缺失: ${NGINX_CONF}"

# ===== Step 1: 拉取最新代码 =====
log "Step 1: 拉取最新代码..."
git fetch origin main || error "git fetch 失败"
BEFORE_COMMIT=$(git rev-parse HEAD)
git reset --hard origin/main || error "git reset 失败"
AFTER_COMMIT=$(git rev-parse HEAD)

if [ "${BEFORE_COMMIT}" = "${AFTER_COMMIT}" ]; then
    log "代码已是最新 (${AFTER_COMMIT:0:8})，跳过后续步骤"
    exit 0
fi
log "代码已更新: ${BEFORE_COMMIT:0:8} → ${AFTER_COMMIT:0:8}"

# ===== Step 2: 验证构建产物完整性 =====
log "Step 2: 验证构建产物..."
[ -f "apps/server/dist/index.js" ] || error "更新后后端构建产物缺失，请手动构建"
[ -f "apps/admin/dist/index.html" ] || error "更新后前端构建产物缺失，请手动构建"
log "构建产物验证通过"

# ===== Step 3: 重启后端服务 =====
log "Step 3: 重启后端服务 (PORT=${SERVER_PORT})..."
pm2 delete "${PM2_NAME}" 2>/dev/null || true
PORT=${SERVER_PORT} pm2 start apps/server/dist/index.js --name "${PM2_NAME}" || error "PM2 启动失败"
sleep 2

# 健康检查
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "${HEALTH_URL}" || echo "000")
if [ "${HTTP_CODE}" != "200" ]; then
    log "健康检查失败 (HTTP ${HTTP_CODE})，尝试回滚..."
    git reset --hard "${BEFORE_COMMIT}"
    pm2 delete "${PM2_NAME}" 2>/dev/null || true
    PORT=${SERVER_PORT} pm2 start apps/server/dist/index.js --name "${PM2_NAME}"
    error "部署失败，已回滚至 ${BEFORE_COMMIT:0:8}"
fi
log "后端服务启动成功，健康检查通过 (HTTP ${HTTP_CODE})"

# ===== Step 4: 重载 Nginx =====
log "Step 4: 验证并重载 Nginx..."
sudo nginx -t 2>&1 | tee -a "${LOG_FILE}" || error "Nginx 配置验证失败"
sudo nginx -s reload || error "Nginx 重载失败"
log "Nginx 重载成功"

# ===== Step 5: 保存 PM2 进程列表 =====
log "Step 5: 保存 PM2 进程列表..."
pm2 save || log "WARNING: pm2 save 失败（非致命）"

# ===== 完成 =====
log "===== 部署完成 ====="
log "提交: ${AFTER_COMMIT:0:8}"
log "后端: PID $(pm2 pid ${PM2_NAME}), 端口 ${SERVER_PORT}"
log "访问: https://log.lihuihao.chat/"
