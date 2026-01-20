# Infrastructure & Preview Configuration

此目录包含用于项目的集中式 Docker 配置。这允许我们在不污染各个业务代码仓库的情况下启动预览环境。

## 目录结构

- `Dockerfile`: 通用的构建定义。
- `docker-compose.yml`: 编排服务，支持动态挂载项目目录。

## 如何使用

### 1. 启动主项目 (scrm-boss)

默认配置指向 `../front-workspace/scrm-boss`。直接运行：

```bash
docker-compose up
```

### 2. 启动特定 Worktree 或分支

使用 `PROJECT_DIR` 环境变量指定你的项目根目录路径（可以是绝对路径或相对路径）。

```bash
# 示例：启动一个 worktree
export PROJECT_DIR=../front-workspace/worktrees/project-feature-login
docker-compose up

# 或者单行命令
PROJECT_DIR=../front-workspace/worktrees/project-abc docker-compose up --build
```

### 注意事项

- 首次切换项目时建议添加 `--build` 参数以确保依赖安装正确。
- `docker-compose.yml` 默认假设 `Dockerfile` 位于当前目录 (`infrastructure`)。如果需要自定义 Dockerfile 位置，可以设置 `DOCKERFILE` 环境变量。
- 如果端口 8001 被占用，可以使用 `HOST_PORT` 更改端口：`HOST_PORT=8002 docker-compose up`。

### 3. 动态后端接口 (API Proxy)

默认情况下使用开发环境接口。如果需要代理到特定后端（如测试环境或本地后端），使用 `API_TARGET`：

```bash
# 将请求代理到指定后端
API_TARGET=http://192.168.1.50:8080 docker-compose up
```

注意：这会将所有 `/api/scrm` 等请求转发到目标地址。
