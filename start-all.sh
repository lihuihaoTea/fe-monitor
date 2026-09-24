#!/bin/bash

echo "🚀 启动前端监控系统..."

trap "kill 0" EXIT

pnpm dev:server &
sleep 2

pnpm dev:admin &
sleep 2

pnpm dev:demo &

echo ""
echo "✅ 所有服务已启动！"
echo ""
echo "📊 管理后台: http://localhost:3500"
echo "🧪 演示页面: http://localhost:3200"
echo "🔌 数据 API: http://localhost:3100"
echo ""
echo "按 Ctrl+C 停止所有服务"

wait
