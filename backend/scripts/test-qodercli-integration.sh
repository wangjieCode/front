#!/bin/bash

# 测试 qodercli 集成

WORKSPACE_DIR="./workspace/dtmall-admin"

echo "=== 测试 qodercli 非交互模式 ==="
echo "工作目录: $WORKSPACE_DIR"
echo ""

# 测试简单的提示
echo "测试提示: 列出当前目录的文件"
qodercli -p "列出当前目录的文件" -w "$WORKSPACE_DIR" -f json --yolo

echo ""
echo "=== 测试完成 ==="
