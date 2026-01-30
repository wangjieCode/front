# 前端结构

## 页面

- IntroPage：入口与导航
- ProjectsPage：项目管理
- ConversationView：对话与执行主界面

## 主要组件

- ProjectSelector：选择项目
- ModeSelector：选择编辑/只读模式
- MessageList：消息与流式内容
- LoginModal：登录对话框

## 状态与认证

- 认证信息存储在 localStorage（user_id、username）
- 所有 API 请求通过统一 fetchWithAuth 注入头信息
- 401 时自动清理本地信息并弹出登录框

## 功能入口

- 创建对话：侧边栏输入框
- 创建 MR：会话内按钮
- 预览：会话内按钮
- 归档：会话内按钮
- 可见性切换：会话内按钮
