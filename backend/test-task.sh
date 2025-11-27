#!/bin/bash

# 测试创建任务
echo "创建测试任务..."
curl -X POST http://localhost:3001/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"prompt": "测试任务：在 README.md 中添加一行测试文本"}' \
  | jq '.'

echo ""
echo "等待 2 秒..."
sleep 2

echo ""
echo "获取任务列表..."
curl http://localhost:3001/api/tasks | jq '.'
