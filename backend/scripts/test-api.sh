#!/bin/bash

# API 测试脚本
# 测试后端 API 是否正常工作

BASE_URL="http://localhost:3001"

echo "🧪 测试后端 API..."
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 测试计数
PASS=0
FAIL=0

# 测试函数
test_api() {
  local name=$1
  local method=$2
  local endpoint=$3
  local data=$4
  local expected_status=$5

  echo -n "测试: $name ... "

  if [ -z "$data" ]; then
    response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint")
  else
    response=$(curl -s -w "\n%{http_code}" -X $method "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  fi

  status_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [ "$status_code" = "$expected_status" ]; then
    echo -e "${GREEN}✓ 通过${NC} (HTTP $status_code)"
    PASS=$((PASS + 1))
  else
    echo -e "${RED}✗ 失败${NC} (期望 HTTP $expected_status, 实际 HTTP $status_code)"
    echo "  响应: $body"
    FAIL=$((FAIL + 1))
  fi
}

# 检查服务器是否运行
echo "检查服务器状态..."
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
  echo -e "${RED}❌ 服务器未运行！${NC}"
  echo ""
  echo "请先启动服务器:"
  echo "  cd backend"
  echo "  npm run dev"
  echo ""
  exit 1
fi

echo -e "${GREEN}✓ 服务器正在运行${NC}"
echo ""

# 运行测试
echo "开始 API 测试..."
echo ""

# 1. 健康检查
test_api "健康检查" "GET" "/health" "" "200"

# 2. 获取任务列表（空）
test_api "获取任务列表（空）" "GET" "/api/tasks" "" "200"

# 3. 创建任务
test_api "创建任务" "POST" "/api/tasks" '{"prompt":"测试任务"}' "201"

# 4. 创建任务（空提示词 - 应该失败）
test_api "创建任务（空提示词）" "POST" "/api/tasks" '{"prompt":""}' "400"

# 5. 创建任务（缺少提示词 - 应该失败）
test_api "创建任务（缺少提示词）" "POST" "/api/tasks" '{}' "400"

# 6. 获取任务列表（应该有任务）
test_api "获取任务列表（有任务）" "GET" "/api/tasks" "" "200"

# 7. 获取不存在的任务
test_api "获取不存在的任务" "GET" "/api/tasks/nonexistent" "" "404"

# 8. 获取不存在任务的日志
test_api "获取不存在任务的日志" "GET" "/api/tasks/nonexistent/logs" "" "404"

# 打印结果
echo ""
echo "=============================="
echo "测试结果汇总"
echo "=============================="
echo -e "通过: ${GREEN}$PASS${NC}"
echo -e "失败: ${RED}$FAIL${NC}"
echo "总计: $((PASS + FAIL))"
echo ""

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✅ 所有 API 测试通过！${NC}"
  exit 0
else
  echo -e "${RED}❌ 有 $FAIL 个测试失败${NC}"
  exit 1
fi
