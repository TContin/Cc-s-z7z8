#!/bin/bash
# 停止 Webhook 服务
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/webhook.pid" ]; then
    kill $(cat "$SCRIPT_DIR/webhook.pid") 2>/dev/null
    rm "$SCRIPT_DIR/webhook.pid"
    echo "✅ Webhook 服务已停止"
else
    echo "⚠️  未找到运行中的 Webhook 服务"
fi
