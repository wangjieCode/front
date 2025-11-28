#!/bin/bash

# 测试 query 任务执行

echo "🧪 测试 Query 任务执行"
echo "===================="
echo ""

# 测试 1: 简单查询
echo "📋 测试 1: 简单查询"
echo "发送请求: /dataCenter 页面的作用是啥"
echo ""

RESPONSE=$(curl -s 'http://localhost:3000/api/tasks' \
  -H 'Content-Type: application/json' \
  --data-raw '{"prompt":"/dataCenter 页面的作用是啥","type":"query"}')

echo "响应:"
echo "$RESPONSE" | jq '.'
echo ""

# 提取任务 ID
TASK_ID=$(echo "$RESPONSE" | jq -r '.data.id')

if [ "$TASK_ID" != "null" ] && [ -n "$TASK_ID" ]; then
  echo "✅ 任务已创建，ID: $TASK_ID"
  echo ""
  
  # 等待任务完成
  echo "⏳ 等待任务完成..."
  sleep 5
  
  # 获取任务详情
  echo "📊 获取任务详情:"
  TASK_DETAIL=$(curl -s "http://localhost:3000/api/tasks/$TASK_ID")
  echo "$TASK_DETAIL" | jq '.'
  echo ""
  
  # 检查任务状态
  TASK_STATUS=$(echo "$TASK_DETAIL" | jq -r '.data.status')
  TASK_RESULT=$(echo "$TASK_DETAIL" | jq -r '.data.result')
  
  echo "任务状态: $TASK_STATUS"
  echo ""
  
  if [ "$TASK_STATUS" = "success" ]; then
    echo "✅ 任务执行成功！"
    echo ""
    echo "结果预览:"
    echo "$TASK_RESULT" | head -c 500
    echo ""
    echo "..."
    echo ""
    
    # 检查结果是否不是用户的输入
    if [ "$TASK_RESULT" != "/dataCenter 页面的作用是啥" ]; then
      echo "✅ 结果不是用户输入，AI 已处理查询"
    else
      echo "❌ 结果是用户输入，AI 未处理查询"
    fi
  else
    echo "❌ 任务执行失败"
    echo "错误: $(echo "$TASK_DETAIL" | jq -r '.data.error')"
  fi
else
  echo "❌ 创建任务失败"
fi

echo ""
echo "===================="
echo "测试完成"
