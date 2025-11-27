# Web 前端实习生助手系统 - 前端

## 功能特性

- ✅ 任务输入面板：支持自然语言输入任务描述
- ✅ 任务列表：展示所有任务及其状态
- ✅ 响应式设计：支持桌面和移动端
- ✅ 实时状态更新：通过 WebSocket 实时推送任务状态
- ✅ 代码变更展示：diff 视图展示代码修改

## 技术栈

- React 18
- TypeScript
- Ant Design 5
- Vite
- react-diff-viewer

## 开发

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
pnpm run build
```

### 预览生产构建

```bash
pnpm run preview
```

## 环境变量

复制 `.env.example` 为 `.env` 并配置：

```env
# API 服务器地址
VITE_API_URL=http://localhost:3000

# WebSocket 服务器地址
VITE_WS_URL=ws://localhost:3000
```

## 组件说明

### TaskInputPanel

任务输入面板，提供文本输入框和提交按钮。

**Props:**
- `onSubmit: (prompt: string) => void` - 提交任务回调
- `isLoading: boolean` - 加载状态

**功能:**
- 支持多行文本输入
- 字符计数（最多 5000 字符）
- Ctrl/Cmd + Enter 快速提交
- 输入验证（非空检查）

### TaskList

任务列表组件，展示所有任务及其状态。

**Props:**
- `tasks: Task[]` - 任务列表
- `onTaskClick?: (taskId: string) => void` - 点击任务回调
- `selectedTaskId?: string` - 当前选中的任务 ID

**功能:**
- 任务状态图标和标签
- 相对时间显示
- MR 链接展示
- 错误信息展示
- 任务描述展开/折叠

## API 服务

`src/services/api.ts` 提供了与后端通信的方法：

- `createTask(prompt: string)` - 创建新任务
- `getTasks()` - 获取所有任务
- `getTask(taskId: string)` - 获取任务详情
- `getTaskLogs(taskId: string)` - 获取任务日志

## 下一步

- [ ] 实现任务执行视图（任务 12）
- [ ] 实现 WebSocket 客户端（任务 13）
- [ ] 实现历史记录功能（任务 14）
- [ ] 实现常用操作模板（任务 15）
