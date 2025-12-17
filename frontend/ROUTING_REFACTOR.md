# 路由重构说明

## 概述

将登录功能融入到 `/` 根路由中，实现智能路由判断，提供更好的用户体验。

## 主要变更

### 1. 智能首页组件 (HomePage)

创建了新的 `HomePage` 组件，根据用户状态自动显示不同的页面：

```typescript
const HomePage: React.FC = () => {
  const isAuthenticated = authService.isAuthenticated();
  const hasProject = projectService.getSelectedProject() !== null;
  
  // 未登录 -> 显示登录页
  if (!isAuthenticated) {
    return <LoginPage />;
  }
  
  // 已登录但未选择项目 -> 跳转到项目选择页
  if (!hasProject) {
    return <Navigate to="/select-project" replace />;
  }
  
  // 已登录且已选择项目 -> 显示主应用
  return <App />;
};
```

### 2. 路由逻辑

#### 新的路由结构

- **`/`** - 智能首页，根据登录状态自动显示：
  - 未登录 → 登录页面
  - 已登录未选项目 → 跳转到 `/select-project`
  - 已登录已选项目 → 主应用 (对话界面)

- **`/login`** - 重定向到 `/`（保留以兼容旧链接）

- **`/select-project`** - 项目选择页面（需要登录）

- **`/conversation-test`** - 对话测试页面（需要登录）

- **`*`** - 所有未匹配路由重定向到 `/`

#### 受保护路由

更新了 `ProtectedRoute` 组件，未登录时重定向到 `/` 而不是 `/login`：

```typescript
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  if (!authService.isAuthenticated()) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
};
```

### 3. 导航更新

更新了所有页面中的导航逻辑，统一使用 `/` 作为登录/退出的目标：

#### LoginPage.tsx
- 登录成功后导航到 `/`

#### ProjectSelectPage.tsx
- 未登录检查重定向到 `/`
- 退出登录导航到 `/`

#### ConversationTestPage.tsx
- 退出登录导航到 `/`
- 项目选择对话框取消时（未选项目）导航到 `/`

## 用户流程

### 首次访问流程
1. 用户访问 `/` → 看到登录页面
2. 输入用户名登录 → 自动跳转到 `/select-project`
3. 选择项目 → 返回 `/` 看到主应用

### 已登录用户流程
1. 用户访问 `/` → 直接看到主应用（如果已选项目）
2. 用户访问 `/` → 跳转到项目选择（如果未选项目）

### 退出登录流程
1. 点击退出登录按钮 → 确认对话框
2. 确认退出 → 清除登录状态和项目
3. 自动导航到 `/` → 看到登录页面

## 优势

1. **更好的用户体验**
   - 用户只需记住根网址 `/`
   - 自动根据状态显示正确的页面
   - 无需手动输入 `/login` 路径

2. **向后兼容**
   - 保留 `/login` 路由，自动重定向到 `/`
   - 旧的书签和链接仍然有效

3. **更安全**
   - 所有受保护路由仍然需要登录
   - 未登录访问受保护路由会自动回到登录页

4. **更清晰的代码**
   - 集中的路由逻辑
   - 智能的状态判断
   - 统一的导航目标

## 技术实现

### 状态检查
```typescript
const isAuthenticated = authService.isAuthenticated();
const hasProject = projectService.getSelectedProject() !== null;
```

### 条件渲染
使用 React 条件渲染和 React Router 的 `<Navigate>` 组件实现自动跳转。

### 依赖服务
- `authService` - 管理用户认证状态
- `projectService` - 管理选中的项目

## 文件变更清单

- ✏️ `src/main.tsx` - 路由配置重构
- ✏️ `src/pages/LoginPage.tsx` - 更新导航目标
- ✏️ `src/pages/ProjectSelectPage.tsx` - 更新导航目标
- ✏️ `src/pages/ConversationTestPage.tsx` - 更新导航目标

## 测试场景

### 场景 1：未登录用户
- 访问 `/` → 显示登录页
- 访问 `/login` → 重定向到 `/` 显示登录页
- 访问 `/select-project` → 重定向到 `/` 显示登录页
- 访问 `/conversation-test` → 重定向到 `/` 显示登录页

### 场景 2：已登录但未选项目
- 访问 `/` → 重定向到 `/select-project`
- 登录后 → 自动跳转到 `/select-project`

### 场景 3：已登录且已选项目
- 访问 `/` → 显示主应用
- 刷新页面 → 保持在主应用

### 场景 4：退出登录
- 点击退出 → 返回 `/` 显示登录页
- 状态清除完整

## 注意事项

1. **本地存储依赖**
   - 登录状态存储在 `localStorage` 中
   - 项目选择存储在 `localStorage` 中
   - 清除浏览器数据会导致状态丢失

2. **刷新行为**
   - 刷新页面后状态从 `localStorage` 恢复
   - 用户体验连续，不会跳回登录页

3. **安全性**
   - 前端路由保护只是第一层
   - 后端 API 仍需验证 token 的有效性

## 未来优化建议

1. **路由守卫优化**
   - 添加加载状态
   - 优化跳转动画

2. **状态持久化**
   - 考虑使用更可靠的状态管理
   - 添加状态过期机制

3. **错误处理**
   - 处理 localStorage 不可用的情况
   - 添加降级方案

4. **用户引导**
   - 首次访问时的引导流程
   - 项目选择的帮助提示

---

**重构完成时间**：2025-12-12
**影响范围**：路由系统、登录流程、导航逻辑
**风险等级**：低（保持向后兼容）
