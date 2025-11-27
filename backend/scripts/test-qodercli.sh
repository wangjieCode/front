#!/bin/bash

# 测试 qodercli 是否可用

echo "=== 检查 qodercli 是否安装 ==="
which qodercli

if [ $? -eq 0 ]; then
    echo "✅ qodercli 已安装"
    
    echo ""
    echo "=== 查看 qodercli 版本 ==="
    qodercli --version
    
    echo ""
    echo "=== 查看 qodercli 帮助信息 ==="
    qodercli --help || qodercli -h || echo "无法获取帮助信息"
else
    echo "❌ qodercli 未安装"
    echo ""
    echo "请安装 qodercli："
    echo "npm install -g qodercli"
fi
