# Supabase 数据库设置指南

## 步骤 1: 执行 SQL 脚本

1. **打开 Supabase SQL Editor**
   - 访问: https://supabase.com/dashboard/project/pemhklrpojvctogksabk/sql/new

2. **复制 SQL 脚本**
   - 打开文件: `backend/drizzle/setup-supabase.sql`
   - 复制全部内容

3. **执行脚本**
   - 粘贴到 SQL Editor
   - 点击右下角的 "Run" 按钮
   - 等待执行完成，应该看到 "Database setup completed successfully!"

## 步骤 2: 获取数据库连接字符串

1. **访问数据库设置**
   - 进入: Project Settings > Database
   - 或直接访问: https://supabase.com/dashboard/project/pemhklrpojvctogksabk/settings/database

2. **复制连接字符串**
   - 找到 "Connection string" 部分
   - 选择 "URI" 模式
   - 点击 "Copy" 复制连接字符串
   - 格式类似: `postgresql://postgres.pemhklrpojvctogksabk:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres`

3. **注意事项**
   - 连接字符串中的 `[YOUR-PASSWORD]` 需要替换为你的数据库密码
   - 如果忘记密码，可以在 Database Settings 中重置

## 步骤 3: 更新环境变量

1. **编辑 .env 文件**
   ```bash
   # 在 backend/.env 文件中更新以下内容
   DATABASE_URL=postgresql://postgres.pemhklrpojvctogksabk:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
   ```

2. **替换密码**
   - 将 `[YOUR-PASSWORD]` 替换为你的实际数据库密码

## 步骤 4: 测试连接

运行测试脚本验证连接：

```bash
cd backend
pnpm db:test
```

如果看到以下输出，说明连接成功：
```
Database initialized successfully
Database connection test successful
✓ Database initialization test passed
```

## 常见问题

### 1. 连接超时
- 检查网络连接
- 确认 Supabase 项目状态正常
- 验证连接字符串格式正确

### 2. 认证失败
- 确认数据库密码正确
- 检查是否需要重置密码

### 3. 表已存在错误
- SQL 脚本使用了 `IF NOT EXISTS`，可以安全重复执行
- 如需重新创建，先在 SQL Editor 中删除表：
  ```sql
  DROP TABLE IF EXISTS message_metadata CASCADE;
  DROP TABLE IF EXISTS messages CASCADE;
  DROP TABLE IF EXISTS branches CASCADE;
  DROP TABLE IF EXISTS conversation_contexts CASCADE;
  DROP TABLE IF EXISTS conversations CASCADE;
  ```

## 验证数据库结构

在 Supabase SQL Editor 中运行以下查询验证表结构：

```sql
-- 查看所有表
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- 查看 conversations 表结构
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'conversations'
ORDER BY ordinal_position;
```

## 下一步

数据库设置完成后，可以继续：
1. 实现 DatabaseManager 连接测试
2. 实现 DrizzleConversationStorage 类
3. 开始数据存储层的开发

## 有用的链接

- Supabase Dashboard: https://supabase.com/dashboard/project/pemhklrpojvctogksabk
- SQL Editor: https://supabase.com/dashboard/project/pemhklrpojvctogksabk/sql/new
- Database Settings: https://supabase.com/dashboard/project/pemhklrpojvctogksabk/settings/database
- Table Editor: https://supabase.com/dashboard/project/pemhklrpojvctogksabk/editor
