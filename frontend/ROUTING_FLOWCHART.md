# 路由流程图

## 用户访问 / 路由的流程

```
                    用户访问 /
                         |
                         v
                  检查登录状态
                         |
         +---------------+---------------+
         |                               |
    未登录                            已登录
         |                               |
         v                               v
    显示登录页                      检查项目状态
    (LoginPage)                          |
         |                    +----------+----------+
         |                    |                     |
    用户输入用户名          未选择项目            已选择项目
         |                    |                     |
         v                    v                     v
    点击登录按钮          跳转到项目选择        显示主应用
         |              (/select-project)         (App)
         v                    |                     |
    调用登录API                v                     |
         |              显示项目列表                  |
         v                    |                     |
    登录成功                   v                     |
         |              用户选择项目                  |
         v                    |                     |
    导航到 /                  v                     |
         |              保存项目到localStorage        |
         |                    |                     |
         |                    v                     |
         |              导航到 /                   |
         |                    |                     |
         +--------------------+---------------------+
                              |
                              v
                        显示主应用
                           (App)


## 退出登录流程

```
              用户点击退出登录
                      |
                      v
              显示确认对话框
                      |
          +-----------+-----------+
          |                       |
       点击取消                点击确认
          |                       |
          v                       v
      关闭对话框            清除登录状态
      (无操作)                    |
                                  v
                          清除项目选择
                                  |
                                  v
                          显示成功提示
                                  |
                                  v
                            导航到 /
                                  |
                                  v
                            显示登录页
                          (LoginPage)


## 路由保护机制

```
        用户访问受保护路由
        (/select-project 或
         /conversation-test)
                |
                v
        ProtectedRoute 检查
                |
        +-------+-------+
        |               |
    已登录          未登录
        |               |
        v               v
    渲染目标页面    重定向到 /
                        |
                        v
                    显示登录页


## 兼容性处理

```
        用户访问 /login
              |
              v
        检测到 /login 路由
              |
              v
        自动重定向到 /
              |
              v
        HomePage 智能判断
              |
        (参考第一个流程图)


## 404 处理

```
        用户访问未知路由
        (如 /unknown)
              |
              v
        匹配到 * 通配符
              |
              v
        重定向到 /
              |
              v
        HomePage 智能判断
              |
        (参考第一个流程图)
```

## 状态存储

```
localStorage 存储结构：

{
  "auth_token": "jwt_token_string",
  "auth_user": {
    "id": "user_id",
    "username": "username",
    "displayName": "Display Name"
  },
  "selected_project": {
    "id": "project_id",
    "projectName": "Project Name",
    "projectKey": "PROJECT_KEY",
    "repoDir": "/path/to/repo",
    "gitDefaultBranch": "main"
  }
}
```

## 关键决策点

### 1. HomePage 组件的检查顺序
```
1. 检查是否登录
2. 检查是否选择项目
3. 根据结果返回对应组件
```

### 2. 导航统一性
所有认证相关的导航都指向 `/`，包括：
- 登录成功
- 退出登录
- 未登录重定向
- 取消项目选择（未选项目时）

### 3. 向后兼容
- `/login` 重定向到 `/`
- 保持所有功能不变
- 旧的书签和链接仍然有效
