# 预览部署流程

## 关键步骤

1. 读取会话上下文，确定 workDir 与 gitBranch
2. 分配可用端口
3. 建立 node_modules 软连接（指向主项目）
4. 写入 .env.local（PORT/HOST）
5. 通过 PM2 启动 `pnpm exec max dev`
6. 返回预览 URL 并落库

## 状态管理

- BUILDING：启动中
- RUNNING：运行中
- STOPPED：已停止
- ERROR：异常

## 停止预览

- PM2 delete 进程
- 删除 .env.local
- 更新 preview_info
