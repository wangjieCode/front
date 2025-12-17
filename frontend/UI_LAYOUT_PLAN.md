# UI布局调整方案

## 需求
1. 将用户信息、退出登录等功能放到页面顶部Header
2. 将项目选择放到模式选择旁边（ConversationView组件内）

## 调整方案

### 方案A：简化布局（推荐）

#### 1. App.tsx 顶部添加Header
```tsx
<Layout style={{ minHeight: '100vh' }}>
  {/* 顶部Header */}
  <Layout.Header style={{
    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    position: 'fixed',
    width: '100%',
    zIndex: 100,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 24px',
  }}>
    <div>Logo + 标题</div>
    <div>用户信息 + 项目管理 + 退出登录</div>
  </Layout.Header>

  {/* 主体内容，顶部留64px空间 */}
  <Layout style={{ marginTop: 64 }}>
    <Sider>侧边栏</Sider>
    <Content>对话内容</Content>
  </Layout>
</Layout>
```

#### 2. ConversationView 添加项目选择

在renderLandingContent的模式选择器旁边添加项目选择：

```tsx
<div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
  {/* 模式选择 */}
  <div style={{ flex: 1 }}>
    <Text type="secondary">选择对话模式：</Text>
    <ModeSelector value={mode} onChange={onModeChange} />
  </div>

  {/* 项目选择 */}
  <div style={{ flex: 1 }}>
    <Text type="secondary">选择项目：</Text>
    <Select
      value={selectedProjectId}
      onChange={onProjectChange}
      loading={isProjectsLoading}
      style={{ width: '100%' }}
    >
      {projects.map(p => (
        <Select.Option key={p.id} value={p.id}>
          {p.projectName}
        </Select.Option>
      ))}
    </Select>
  </div>
</div>
```

### 方案B：保持原有结构（备选）

保持项目选择在侧边栏，只添加顶部Header显示用户信息和快捷操作。

## 实施步骤

### Step 1: 更新ConversationView Props
```typescript
interface ConversationViewProps {
  // ... existing props
  projects?: Project[];
  selectedProjectId?: string;
  onProjectChange?: (projectId: string) => void;
  isProjectsLoading?: boolean;
}
```

### Step 2: 更新App.tsx传递props
```tsx
<ConversationView
  // ... existing props
  projects={projects}
  selectedProjectId={selectedProjectId}
  onProjectChange={handleProjectChange}
  isProjectsLoading={isProjectsLoading}
/>
```

### Step 3: 修改ConversationView的renderLandingContent

将项目选择器添加到模式选择旁边。

### Step 4: 添加Header到App.tsx

创建固定的顶部Header，显示Logo、用户信息、操作按钮。

## 样式建议

### Header样式
- 高度：64px
- 背景：紫色渐变
- 固定在顶部
- 阴影：轻微阴影
- 文字：白色

### 项目选择样式
- 与模式选择器并排
- 响应式布局（小屏幕垂直排列）
- 统一的圆角和间距

## 注意事项

1. **滚动处理**：Header固定后，内容区域需要设置 `marginTop: 64px`
2. **响应式**：小屏幕时考虑Header和选择器的布局调整
3. **状态同步**：项目选择状态需要在App和Conv之间正确传递
4. **性能**：避免重复渲染，使用useCallback优化回调函数

## 优先级

建议采用方案A，分步骤实施：
1. 先添加Header（不破坏现有功能）
2. 再添加项目选择到ConversationView
3. 移除侧边栏中的项目选择卡片
4. 测试和调整样式

---

**下一步**：是否需要我实施这个方案？
