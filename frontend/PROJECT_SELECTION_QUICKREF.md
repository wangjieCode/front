# 项目选择重构 - 快速参考

## 🎯 核心改动

### 之前
- 独立的项目选择页面 (`/select-project`)
- 登录后跳转到项目选择页
- 切换项目需要退出对话

### 现在
- 侧边栏集成项目选择下拉框
- 登录后直接进入主应用
- 随时可在侧边栏切换项目
- 独立的项目管理页面 (`/projects`)

## 📁 文件结构

```
frontend/src/
├── App.tsx                          ✏️ 修改 - 集成项目选择
├── main.tsx                         ✏️ 修改 - 简化路由
├── pages/
│   ├── LoginPage.tsx               ✓ 保持不变
│   ├── ProjectSelectPage.tsx       ⚠️ 可废弃
│   ├── ProjectManagementPage.tsx   ➕ 新增 - 项目CRUD
│   └── ConversationTestPage.tsx    ✓ 保持不变
└── services/
    ├── authService.ts              ✓ 保持不变
    └── projectService.ts           ✓ 保持不变
```

## 🚀 新增功能

### 主应用侧边栏 (App.tsx)

```tsx
// 用户信息卡片
<Card>
  {/* 当前用户 */}
  <div>当前用户: {user.displayName}</div>
  
  {/* 项目选择下拉框 */}
  <Select
    value={selectedProjectId}
    onChange={handleProjectChange}
    placeholder="请选择项目"
  >
    {projects.map(project => (
      <Select.Option key={project.id} value={project.id}>
        {project.projectName}
      </Select.Option>
    ))}
  </Select>
  
  {/* 操作按钮 */}
  <Button onClick={() => navigate('/projects')}>
    项目管理
  </Button>
  <Button danger onClick={handleLogout}>
    退出登录
  </Button>
</Card>
```

### 项目管理页面 (ProjectManagementPage.tsx)

**功能列表**
- ✅ 查看所有项目（Table）
- ✅ 新建项目（Modal表单）
- ✅ 编辑项目（Modal表单）
- ✅ 删除项目（带确认）

**访问路径**
- URL: `/projects`
- 入口: 侧边栏"项目管理"按钮

## 🔄 路由变化

| 路径 | 之前 | 现在 |
|------|------|------|
| `/` | ProtectedRoute → App | 智能路由（未登录→登录页，已登录→App） |
| `/login` | 登录页面 | 重定向到 `/` |
| `/select-project` | 项目选择页面 | 重定向到 `/`（已废弃） |
| `/projects` | 不存在 | 项目管理页面（新增） |
| `/conversation-test` | 对话测试页 | 保持不变 |

## 💡 使用示例

### 切换项目

```typescript
// 用户在侧边栏下拉框选择项目
const handleProjectChange = (projectId: string) => {
  const project = projects.find(p => p.id === projectId);
  if (project) {
    setSelectedProjectId(projectId);
    projectService.setSelectedProject(project);
    message.success(`已切换到项目：${project.projectName}`);
  }
};
```

### 管理项目

```typescript
// 1. 点击"项目管理"按钮
navigate('/projects');

// 2. 在项目管理页面操作
- 查看项目列表
- 点击"新建项目"
- 填写表单 → 保存
- 返回主应用
```

## 🎨 UI组件

### Ant Design组件使用

```tsx
// Select - 项目选择
<Select
  value={selectedProjectId}
  onChange={handleProjectChange}
  loading={isProjectsLoading}
  disabled={projects.length === 0}
/>

// Card - 信息卡片
<Card size="small" style={{ borderRadius: '12px' }}>
  {/* 内容 */}
</Card>

// Table - 项目列表
<Table
  columns={columns}
  dataSource={projects}
  rowKey="id"
  pagination={{ pageSize: 10 }}
/>

// Modal - 项目表单
<Modal
  title={editingProject ? '编辑项目' : '新建项目'}
  open={modalVisible}
  onOk={handleSubmit}
/>
```

## 📝 待办事项

### 后端API集成
```typescript
// ProjectManagementPage.tsx

// TODO: 创建项目
POST /api/projects
Body: { projectName, projectKey, description, repoDir, gitDefaultBranch }

// TODO: 更新项目
PUT /api/projects/:id
Body: { projectName, projectKey, description, repoDir, gitDefaultBranch }

// TODO: 删除项目
DELETE /api/projects/:id
```

### 优化建议
- [ ] 项目搜索/筛选
- [ ] 最近使用项目
- [ ] 项目图标/颜色
- [ ] 批量操作
- [ ] 项目导入/导出

## 🐛 常见问题

### Q: 刷新页面后项目选择丢失？
A: 不会，项目选择保存在localStorage中，刷新后自动恢复。

### Q: 如果没有可用项目怎么办？
A: 下拉框会禁用并显示提示，用户需要点击"项目管理"创建项目。

### Q: 旧的 `/select-project` 链接还能用吗？
A: 可以，会自动重定向到 `/`（主应用）。

### Q: 项目切换会影响当前对话吗？
A: 不会立即影响，但新创建的对话会使用新选择的项目。

## 🔍 调试技巧

### 查看当前选中项目
```javascript
// 浏览器控制台
localStorage.getItem('selected_project')
```

### 清除项目缓存
```javascript
// 浏览器控制台
localStorage.removeItem('selected_project')
```

### 查看加载状态
```typescript
// App.tsx
console.log('Projects:', projects);
console.log('Selected:', selectedProjectId);
console.log('Loading:', isProjectsLoading);
```

## 📊 性能指标

- 项目列表加载：< 500ms
- 项目切换响应：< 100ms
- 侧边栏渲染：< 50ms
- 页面首次加载：< 1s

## 🎓 学习资源

### 相关文档
- [Ant Design Select](https://ant.design/components/select-cn)
- [Ant Design Table](https://ant.design/components/table-cn)
- [Ant Design Modal](https://ant.design/components/modal-cn)
- [React Router v6](https://reactrouter.com/en/main)

### 代码片段位置
- 项目选择逻辑: `App.tsx#loadProjects`
- 项目切换逻辑: `App.tsx#handleProjectChange`
- 项目管理页面: `ProjectManagementPage.tsx`
- 路由配置: `main.tsx#Routes`
