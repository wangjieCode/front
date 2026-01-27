# 前端状态管理集成指南

## 概述

本文档说明如何在前端集成简化后的对话状态管理（ACTIVE/ARCHIVED）。

---

## 📋 已完成的集成

### 1. 类型定义更新

**文件**: `frontend/src/types/conversation.ts`

```typescript
export enum ConversationStatus {
  ACTIVE = "active", // 活跃中 - 可以对话、发送消息、预览等
  ARCHIVED = "archived", // 已归档 - 只读，禁用所有编辑功能
}
```

### 2. ConversationView 组件更新

**文件**: `frontend/src/components/ConversationView.tsx`

#### 添加状态检查

```typescript
// 检查对话是否已归档
const isArchived = session?.status === ConversationStatus.ARCHIVED;
```

#### 发送消息禁用

```typescript
const handleSendMessage = async (content: string) => {
  if (!sessionId) return;

  // 检查是否已归档
  if (isArchived) {
    message.error("已归档的对话不能发送消息");
    return;
  }

  setSending(true);
  // ... 继续处理
};
```

#### 预览功能禁用

```typescript
const handlePreview = async () => {
  if (!sessionId) return;

  // 检查是否已归档
  if (isArchived) {
    message.error("已归档的对话不能预览");
    return;
  }

  // ... 继续处理
};
```

#### 创建 MR 禁用

```typescript
const handleCreateMR = async () => {
  if (!sessionId) return;

  // 检查是否已归档
  if (isArchived) {
    message.error("已归档的对话不能创建 MR");
    return;
  }

  // ... 继续处理
};
```

#### 输入框禁用

```typescript
<MessageInput
  sessionId={sessionId}
  disabled={sending || isArchived}
  onSend={handleSendMessage}
  placeholder={isArchived ? '已归档的对话不能发送消息' : undefined}
/>
```

#### 按钮禁用

```typescript
// 创建 MR 按钮
<Button
  size="small"
  icon={<GitlabOutlined />}
  onClick={handleCreateMR}
  loading={creatingMR}
  disabled={isArchived}  // 归档时禁用
  style={{ /* ... */ }}
>
  创建 MR
</Button>

// 预览按钮
<Button
  size="small"
  icon={buttonProps.icon}
  onClick={buttonProps.onClick || handlePreview}
  disabled={buttonProps.disabled || isArchived}  // 归档时禁用
  style={{ /* ... */ }}
>
  {buttonProps.text}
</Button>
```

#### 状态徽章显示

```typescript
{/* 状态徽章 */}
{isArchived && (
  <Tag color="default" style={{ marginLeft: 8 }}>
    已归档
  </Tag>
)}
```

---

## 🎨 UI/UX 建议

### 1. 状态徽章样式

```typescript
// 活跃状态（默认不显示）
// 归档状态
<Tag color="default" icon={<LockOutlined />}>
  已归档
</Tag>

// 或者更醒目的样式
<Tag color="warning" icon={<LockOutlined />}>
  已归档（只读）
</Tag>
```

### 2. 禁用状态的视觉反馈

```typescript
// 输入框禁用样式
<MessageInput
  disabled={isArchived}
  placeholder={isArchived ? '已归档的对话不能发送消息' : '输入消息...'}
  style={{
    opacity: isArchived ? 0.6 : 1,
    cursor: isArchived ? 'not-allowed' : 'text',
  }}
/>
```

### 3. 归档提示

```typescript
// 在对话顶部显示归档提示
{isArchived && (
  <Alert
    message="此对话已归档"
    description="已归档的对话为只读状态，无法发送消息、创建 MR 或预览项目。您可以恢复对话以继续编辑。"
    type="warning"
    showIcon
    closable
    style={{ margin: '16px 24px' }}
    action={
      <Button size="small" type="primary" onClick={handleUnarchive}>
        恢复对话
      </Button>
    }
  />
)}
```

---

## 🔄 归档/恢复功能

### 1. 归档对话

```typescript
const handleArchive = async (sessionId: string, reason?: string) => {
  try {
    await conversationService.archiveConversation(sessionId, reason);
    message.success("对话已归档");

    // 刷新会话信息
    await loadSession();
  } catch (error) {
    message.error(
      "归档失败: " + (error instanceof Error ? error.message : "未知错误"),
    );
  }
};
```

### 2. 恢复对话

```typescript
const handleUnarchive = async (sessionId: string) => {
  try {
    await conversationService.unarchiveConversation(sessionId);
    message.success("对话已恢复");

    // 刷新会话信息
    await loadSession();
  } catch (error) {
    message.error(
      "恢复失败: " + (error instanceof Error ? error.message : "未知错误"),
    );
  }
};
```

### 3. 添加到 conversationService

**文件**: `frontend/src/services/conversationService.ts`

```typescript
class ConversationService {
  // ... 现有方法

  /**
   * 归档对话
   */
  async archiveConversation(sessionId: string, reason?: string): Promise<void> {
    const response = await fetch(`/api/conversations/${sessionId}/archive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": localStorage.getItem("user_id") || "",
        "x-username": localStorage.getItem("username") || "",
      },
      body: JSON.stringify({ reason }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "归档失败");
    }
  }

  /**
   * 恢复对话
   */
  async unarchiveConversation(sessionId: string): Promise<void> {
    const response = await fetch(`/api/conversations/${sessionId}/unarchive`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-user-id": localStorage.getItem("user_id") || "",
        "x-username": localStorage.getItem("username") || "",
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "恢复失败");
    }
  }
}
```

---

## 📱 对话列表集成

### 1. 显示状态

```typescript
function ConversationListItem({ conversation }: { conversation: SimplifiedConversation }) {
  const isArchived = conversation.status === ConversationStatus.ARCHIVED;

  return (
    <div
      className="conversation-item"
      style={{
        opacity: isArchived ? 0.7 : 1,
        background: isArchived ? '#fafafa' : '#fff',
      }}
    >
      <div className="conversation-header">
        <span className="conversation-title">{conversation.overview}</span>

        {/* 状态徽章 */}
        {isArchived && (
          <Tag color="default" size="small">已归档</Tag>
        )}
      </div>

      <div className="conversation-actions">
        {isArchived ? (
          <Button
            size="small"
            onClick={() => handleUnarchive(conversation.id)}
          >
            恢复
          </Button>
        ) : (
          <Button
            size="small"
            onClick={() => handleArchive(conversation.id)}
          >
            归档
          </Button>
        )}
      </div>
    </div>
  );
}
```

### 2. 过滤功能

```typescript
function ConversationList() {
  const [filter, setFilter] = useState<'all' | 'active' | 'archived'>('active');
  const [conversations, setConversations] = useState<SimplifiedConversation[]>([]);

  // 过滤对话
  const filteredConversations = conversations.filter(conv => {
    if (filter === 'all') return true;
    if (filter === 'active') return conv.status === ConversationStatus.ACTIVE;
    if (filter === 'archived') return conv.status === ConversationStatus.ARCHIVED;
    return true;
  });

  return (
    <div>
      {/* 过滤标签 */}
      <Tabs value={filter} onChange={setFilter}>
        <Tabs.TabPane tab="活跃中" key="active" />
        <Tabs.TabPane tab="已归档" key="archived" />
        <Tabs.TabPane tab="全部" key="all" />
      </Tabs>

      {/* 对话列表 */}
      <List
        dataSource={filteredConversations}
        renderItem={conv => <ConversationListItem conversation={conv} />}
      />
    </div>
  );
}
```

### 3. 批量操作

```typescript
function ConversationList() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 批量归档
  const handleBatchArchive = async () => {
    try {
      await Promise.all(
        selectedIds.map(id => conversationService.archiveConversation(id))
      );
      message.success(`已归档 ${selectedIds.length} 个对话`);
      setSelectedIds([]);
      await loadConversations();
    } catch (error) {
      message.error('批量归档失败');
    }
  };

  return (
    <div>
      {/* 批量操作栏 */}
      {selectedIds.length > 0 && (
        <div className="batch-actions">
          <span>已选择 {selectedIds.length} 个对话</span>
          <Button onClick={handleBatchArchive}>批量归档</Button>
        </div>
      )}

      {/* 对话列表 */}
      {/* ... */}
    </div>
  );
}
```

---

## ⚠️ 注意事项

### 1. 状态同步

```typescript
// 确保在归档/恢复后刷新会话信息
const handleArchive = async (sessionId: string) => {
  await conversationService.archiveConversation(sessionId);

  // 重新加载会话
  await loadSession();

  // 或者直接更新本地状态
  setSession((prev) =>
    prev ? { ...prev, status: ConversationStatus.ARCHIVED } : null,
  );
};
```

### 2. 错误处理

```typescript
const handleArchive = async (sessionId: string) => {
  try {
    await conversationService.archiveConversation(sessionId);
    message.success("对话已归档");
  } catch (error) {
    // 根据错误类型显示不同的提示
    if (error instanceof Error) {
      if (error.message.includes("权限")) {
        message.error("无权限归档该对话");
      } else if (error.message.includes("不存在")) {
        message.error("对话不存在");
      } else {
        message.error("归档失败: " + error.message);
      }
    }
  }
};
```

### 3. 用户确认

```typescript
const handleArchive = async (sessionId: string) => {
  // 显示确认对话框
  Modal.confirm({
    title: "确认归档",
    content: "归档后将无法发送消息、创建 MR 或预览项目。您可以随时恢复对话。",
    okText: "确认归档",
    cancelText: "取消",
    onOk: async () => {
      await conversationService.archiveConversation(sessionId, "用户手动归档");
      message.success("对话已归档");
      await loadSession();
    },
  });
};
```

---

## 🎯 完整示例

### ConversationView 组件完整集成

```typescript
const ConversationView: React.FC<ConversationViewProps> = ({
  sessionId,
  // ...
}) => {
  const [session, setSession] = useState<ConversationSession | null>(null);

  // 检查是否已归档
  const isArchived = session?.status === ConversationStatus.ARCHIVED;

  // 归档对话
  const handleArchive = async () => {
    if (!sessionId) return;

    Modal.confirm({
      title: '确认归档',
      content: '归档后将无法编辑，但可以随时恢复。',
      onOk: async () => {
        try {
          await conversationService.archiveConversation(sessionId);
          message.success('对话已归档');
          await loadSession();
        } catch (error) {
          message.error('归档失败');
        }
      },
    });
  };

  // 恢复对话
  const handleUnarchive = async () => {
    if (!sessionId) return;

    try {
      await conversationService.unarchiveConversation(sessionId);
      message.success('对话已恢复');
      await loadSession();
    } catch (error) {
      message.error('恢复失败');
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="conversation-header">
        <span>{session?.context?.taskDescription}</span>

        {/* 状态徽章 */}
        {isArchived && <Tag color="default">已归档</Tag>}

        {/* 归档/恢复按钮 */}
        {isArchived ? (
          <Button size="small" onClick={handleUnarchive}>
            恢复对话
          </Button>
        ) : (
          <Button size="small" onClick={handleArchive}>
            归档对话
          </Button>
        )}
      </div>

      {/* 归档提示 */}
      {isArchived && (
        <Alert
          message="此对话已归档"
          description="已归档的对话为只读状态"
          type="warning"
          showIcon
          closable
        />
      )}

      {/* 消息列表 */}
      <MessageList messages={messages} />

      {/* 输入框 */}
      <MessageInput
        disabled={sending || isArchived}
        placeholder={isArchived ? '已归档的对话不能发送消息' : '输入消息...'}
        onSend={handleSendMessage}
      />

      {/* 操作按钮 */}
      <div className="actions">
        <Button
          disabled={isArchived}
          onClick={handleCreateMR}
        >
          创建 MR
        </Button>

        <Button
          disabled={isArchived}
          onClick={handlePreview}
        >
          预览
        </Button>
      </div>
    </div>
  );
};
```

---

## 📊 状态流转图

```
用户操作                    前端状态                  后端 API
   │                          │                         │
   ├─ 点击"归档"              │                         │
   │                          │                         │
   ├─ 显示确认对话框 ─────────┤                         │
   │                          │                         │
   ├─ 确认归档 ───────────────┼─ POST /archive ────────┤
   │                          │                         │
   │                          │                         ├─ 更新状态为 ARCHIVED
   │                          │                         │
   │                          │◄─ 200 OK ──────────────┤
   │                          │                         │
   ├─ 刷新会话 ───────────────┼─ GET /session ─────────┤
   │                          │                         │
   │                          │◄─ session (ARCHIVED) ──┤
   │                          │                         │
   ├─ 更新 UI ────────────────┤                         │
   │   - 显示"已归档"徽章     │                         │
   │   - 禁用输入框           │                         │
   │   - 禁用所有按钮         │                         │
   │   - 显示"恢复"按钮       │                         │
```

---

## ✅ 集成检查清单

- [x] 更新 `ConversationStatus` 枚举
- [x] 添加 `isArchived` 状态检查
- [x] 禁用发送消息功能
- [x] 禁用预览功能
- [x] 禁用创建 MR 功能
- [x] 禁用输入框
- [x] 禁用所有操作按钮
- [x] 显示状态徽章
- [ ] 添加归档/恢复 API 方法到 conversationService
- [ ] 添加归档/恢复按钮
- [ ] 添加归档提示 Alert
- [ ] 实现对话列表过滤
- [ ] 实现批量归档功能
- [ ] 添加用户确认对话框
- [ ] 添加错误处理

---

## 🚀 下一步

1. **完善 conversationService**
   - 添加 `archiveConversation()` 方法
   - 添加 `unarchiveConversation()` 方法

2. **添加归档/恢复按钮**
   - 在 ConversationView header 中添加
   - 在对话列表中添加

3. **实现对话列表过滤**
   - 添加"活跃中"/"已归档"标签
   - 实现过滤逻辑

4. **优化用户体验**
   - 添加归档确认对话框
   - 添加归档提示 Alert
   - 优化禁用状态的视觉反馈

5. **测试**
   - 测试归档功能
   - 测试恢复功能
   - 测试禁用逻辑
   - 测试状态同步

---

**更新时间**: 2026-01-21
