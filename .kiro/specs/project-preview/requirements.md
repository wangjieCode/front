# 需求文档

## 简介

在线预览项目功能允许用户在远程虚拟机上启动前端项目的开发服务器，并通过新窗口预览整个项目的运行效果。该功能与现有的对话系统集成，用户可以在对话界面中手动触发预览。

## 术语表

- **System**: Web 前端实习生助手系统
- **User**: 使用系统的前端开发人员
- **Preview Server**: 在远程虚拟机上运行的前端项目开发服务器
- **Project**: 需要预览的前端项目（如 dtmall-admin）
- **Conversation Session**: 用户与 AI 助手的对话会话
- **Remote VM**: 远程虚拟机，使用 Docker 容器运行项目
- **Docker Container**: 运行前端项目的 Docker 容器
- **Preview URL**: 可访问预览服务器的 URL 地址
- **Dev Server**: 前端项目的开发服务器（如 npm run dev）
- **Port Mapping**: Docker 容器端口到宿主机端口的映射

## 需求

### 需求 1

**用户故事**: 作为用户，我想要在对话界面中启动项目预览，以便查看前端项目的实际运行效果。

#### 验收标准

1. WHEN User 点击预览按钮 THEN System SHALL 在远程虚拟机上启动 Dev Server
2. WHEN Dev Server 启动成功 THEN System SHALL 返回 Preview URL
3. WHEN User 收到 Preview URL THEN System SHALL 在新窗口中打开预览页面
4. WHEN Dev Server 启动失败 THEN System SHALL 向 User 显示错误信息
5. WHEN Dev Server 正在启动 THEN System SHALL 向 User 显示加载状态

### 需求 2

**用户故事**: 作为用户，我想要管理预览服务器的生命周期，以便控制服务器的启动和停止。

#### 验收标准

1. WHEN User 请求启动预览 THEN System SHALL 检查是否已有运行中的 Preview Server
2. WHEN Preview Server 已在运行 THEN System SHALL 直接返回现有的 Preview URL
3. WHEN User 关闭对话会话 THEN System SHALL 自动停止关联的 Preview Server
4. WHEN User 手动停止预览 THEN System SHALL 终止 Preview Server 进程
5. WHEN Preview Server 空闲超过配置时间 THEN System SHALL 自动停止该服务器

### 需求 3

**用户故事**: 作为用户，我想要查看预览服务器的状态，以便了解服务器是否正常运行。

#### 验收标准

1. WHEN User 查询预览状态 THEN System SHALL 返回 Preview Server 的运行状态
2. WHEN Preview Server 正在运行 THEN System SHALL 显示服务器 URL 和端口信息
3. WHEN Preview Server 未运行 THEN System SHALL 显示"未启动"状态
4. WHEN Preview Server 启动失败 THEN System SHALL 显示错误日志
5. WHEN Preview Server 状态变化 THEN System SHALL 通过 SSE 推送状态更新

### 需求 4

**用户故事**: 作为用户，我想要系统自动检测项目配置，以便使用正确的命令启动开发服务器。

#### 验收标准

1. WHEN System 启动预览 THEN System SHALL 检测项目的包管理器类型（npm/pnpm/yarn）
2. WHEN System 检测到 package.json THEN System SHALL 读取启动脚本配置
3. WHEN package.json 包含 dev 脚本 THEN System SHALL 使用该脚本启动服务器
4. WHEN package.json 不包含 dev 脚本 THEN System SHALL 尝试使用 start 脚本
5. WHEN 无法检测启动命令 THEN System SHALL 返回配置错误信息

### 需求 5

**用户故事**: 作为用户，我想要系统处理端口冲突，以便在端口被占用时仍能启动预览。

#### 验收标准

1. WHEN System 启动 Dev Server THEN System SHALL 检测默认端口是否可用
2. WHEN 默认端口被占用 THEN System SHALL 尝试使用下一个可用端口
3. WHEN System 找到可用端口 THEN System SHALL 使用该端口启动服务器
4. WHEN 端口范围内无可用端口 THEN System SHALL 返回端口冲突错误
5. WHEN Dev Server 使用非默认端口 THEN System SHALL 在 Preview URL 中包含正确端口

### 需求 6

**用户故事**: 作为用户，我想要系统支持多个项目的预览，以便同时查看不同项目的效果。

#### 验收标准

1. WHEN User 在不同 Conversation Session 中启动预览 THEN System SHALL 为每个会话创建独立的 Preview Server
2. WHEN 多个 Preview Server 同时运行 THEN System SHALL 为每个服务器分配不同端口
3. WHEN User 查询所有预览 THEN System SHALL 返回所有运行中的 Preview Server 列表
4. WHEN System 资源不足 THEN System SHALL 限制同时运行的 Preview Server 数量
5. WHEN 达到最大预览数量 THEN System SHALL 提示 User 停止现有预览

### 需求 7

**用户故事**: 作为用户，我想要查看开发服务器的日志输出，以便调试项目启动问题。

#### 验收标准

1. WHEN Dev Server 启动 THEN System SHALL 捕获服务器的标准输出和错误输出
2. WHEN User 请求查看日志 THEN System SHALL 返回最近的日志内容
3. WHEN Dev Server 输出新日志 THEN System SHALL 通过 SSE 实时推送日志
4. WHEN 日志超过大小限制 THEN System SHALL 保留最新的日志内容
5. WHEN Dev Server 停止 THEN System SHALL 保存完整的日志记录

### 需求 8

**用户故事**: 作为系统管理员，我想要配置预览服务器的参数，以便适应不同的部署环境。

#### 验收标准

1. WHEN System 初始化 THEN System SHALL 从环境变量读取预览配置
2. WHEN 配置包含端口范围 THEN System SHALL 在该范围内分配端口
3. WHEN 配置包含超时时间 THEN System SHALL 使用该时间作为空闲超时
4. WHEN 配置包含最大预览数 THEN System SHALL 限制同时运行的服务器数量
5. WHEN 配置缺失 THEN System SHALL 使用合理的默认值

### 需求 9

**用户故事**: 作为用户，我想要系统使用 Docker 容器运行预览服务器，以便提供隔离和一致的运行环境。

#### 验收标准

1. WHEN System 启动预览 THEN System SHALL 在 Docker Container 中运行 Dev Server
2. WHEN Docker Container 启动 THEN System SHALL 映射容器端口到宿主机端口
3. WHEN 容器端口映射成功 THEN System SHALL 生成可访问的 Preview URL
4. WHEN Docker Container 停止 THEN System SHALL 清理容器和相关资源
5. WHEN 容器启动失败 THEN System SHALL 返回 Docker 错误日志

### 需求 10

**用户故事**: 作为用户，我想要系统在预览界面提供快捷操作，以便快速执行常见任务。

#### 验收标准

1. WHEN User 查看预览状态 THEN System SHALL 显示"打开预览"按钮
2. WHEN Preview Server 正在运行 THEN System SHALL 显示"停止预览"按钮
3. WHEN User 点击"刷新预览" THEN System SHALL 重新加载预览窗口
4. WHEN User 点击"查看日志" THEN System SHALL 显示服务器日志
5. WHEN User 点击"复制链接" THEN System SHALL 复制 Preview URL 到剪贴板


### 需求 11

**用户故事**: 作为用户，我想要系统管理 Docker 容器的生命周期，以便确保资源的有效利用。

#### 验收标准

1. WHEN System 创建预览 THEN System SHALL 为每个预览创建独立的 Docker Container
2. WHEN Docker Container 创建 THEN System SHALL 挂载项目目录到容器
3. WHEN 项目代码更新 THEN Docker Container SHALL 通过挂载卷实时同步代码
4. WHEN User 停止预览 THEN System SHALL 停止并删除 Docker Container
5. WHEN System 重启 THEN System SHALL 清理所有孤立的 Docker Container

### 需求 12

**用户故事**: 作为用户，我想要系统配置 Docker 网络，以便预览服务器可以被外部访问。

#### 验收标准

1. WHEN Docker Container 启动 THEN System SHALL 配置容器网络为桥接模式
2. WHEN 配置端口映射 THEN System SHALL 将容器内部端口映射到宿主机端口
3. WHEN 宿主机端口被占用 THEN System SHALL 自动选择下一个可用端口
4. WHEN 端口映射成功 THEN System SHALL 使用宿主机 IP 和端口生成 Preview URL
5. WHEN 网络配置失败 THEN System SHALL 返回详细的网络错误信息
