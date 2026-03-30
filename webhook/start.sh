#!/bin/bash
# Webhook 服务 - 监听 Git Push 自动部署小程序
# 用法: bash start.sh

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT=${WEBHOOK_PORT:-9000}
LOG_FILE="$PROJECT_DIR/webhook/webhook.log"

echo "🚀 Webhook 服务启动中... 端口: $PORT"
echo "📁 项目目录: $PROJECT_DIR"
echo "📋 日志文件: $LOG_FILE"

cd "$PROJECT_DIR/webhook"
nohup python3 server.py > "$LOG_FILE" 2>&1 &
echo $! > webhook.pid

echo "✅ Webhook 服务已启动 (PID: $(cat webhook.pid))"
echo "🔗 地址: http://你的服务器IP:$PORT/webhook"
