# Docker 远程操作使用指南

本项目集成了 `dockerode` 库，用于操作本地和远程 Docker 容器。

## 快速开始

### 1. 运行示例脚本

```bash
# 本地 Docker 操作示例
pnpm docker:example

# 远程 Docker 测试 (192.168.66.30)
pnpm docker:remote
```

### 2. 配置环境变量

在 `backend/.env` 文件中添加：

```env
DOCKER_HOST=192.168.66.30
DOCKER_PORT=2375
DOCKER_USERNAME=admin
DOCKER_PASSWORD=admin
```

### 3. 在代码中使用

```typescript
import { DockerService } from './services/DockerService';

// 连接本地 Docker
const localDocker = new DockerService();

// 连接远程 Docker (TCP，无认证)
const remoteDocker = DockerService.connectRemote('192.168.66.30', 2375);

// 连接远程 Docker (TCP，带认证)
const authDocker = DockerService.connectRemote('192.168.66.30', 2375, 'admin', 'admin');

// 连接远程 Docker (SSH)
const sshDocker = DockerService.connectRemoteSSH(
  '192.168.66.30',
  'username',
  '/path/to/private/key'
);
```

## 远程 Docker 配置

### 方式 1: TCP 连接（带 HTTP Basic 认证）

如果远程 Docker 已配置 HTTP Basic 认证（如使用 Nginx 反向代理），在代码中使用：

```typescript
const docker = DockerService.connectRemote(
  '192.168.66.30',
  2375,
  'admin',  // 用户名
  'admin'   // 密码
);
```

或通过环境变量配置（推荐）：

```env
DOCKER_HOST=192.168.66.30
DOCKER_PORT=2375
DOCKER_USERNAME=admin
DOCKER_PASSWORD=admin
```

### 方式 2: TCP 连接（无认证，仅用于内网测试）

在远程主机上编辑 `/etc/docker/daemon.json`:

```json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2375"]
}
```

重启 Docker:

```bash
sudo systemctl restart docker
```

### 方式 2: TLS 加密连接（推荐）

1. 生成证书：

```bash
# 在远程主机上
cd /etc/docker
sudo ./generate-certs.sh
```

2. 配置 Docker:

```json
{
  "hosts": ["unix:///var/run/docker.sock", "tcp://0.0.0.0:2376"],
  "tls": true,
  "tlscert": "/etc/docker/server-cert.pem",
  "tlskey": "/etc/docker/server-key.pem",
  "tlsverify": true,
  "tlscacert": "/etc/docker/ca.pem"
}
```

3. 在代码中使用：

```typescript
const docker = new DockerService({
  host: '192.168.66.30',
  port: 2376,
  ca: fs.readFileSync('/path/to/ca.pem'),
  cert: fs.readFileSync('/path/to/cert.pem'),
  key: fs.readFileSync('/path/to/key.pem'),
});
```

### 方式 3: SSH 连接（最安全）

```typescript
const docker = DockerService.connectRemoteSSH(
  '192.168.66.30',
  'your-username',
  fs.readFileSync('/path/to/private/key', 'utf8')
);
```

## API 使用示例

### 容器操作

```typescript
// 列出所有容器
const containers = await docker.listContainers(true);

// 启动容器
await docker.startContainer('container-id');

// 停止容器
await docker.stopContainer('container-id');

// 重启容器
await docker.restartContainer('container-id');

// 删除容器
await docker.removeContainer('container-id', true);

// 创建并启动容器
const container = await docker.createAndStartContainer({
  Image: 'nginx:alpine',
  name: 'my-nginx',
  HostConfig: {
    PortBindings: {
      '80/tcp': [{ HostPort: '8080' }],
    },
  },
});

// 在容器中执行命令
const output = await docker.execCommand('container-id', ['ls', '-la']);

// 获取容器日志
const logs = await docker.getContainerLogs('container-id', 100);

// 获取容器统计信息
const stats = await docker.getContainerStats('container-id');
```

### 镜像操作

```typescript
// 列出所有镜像
const images = await docker.listImages();

// 拉取镜像
await docker.pullImage('nginx:latest');

// 删除镜像
await docker.removeImage('image-id');
```

### 系统信息

```typescript
// 获取 Docker 版本
const version = await docker.getVersion();

// 获取系统信息
const info = await docker.getSystemInfo();

// 测试连接
await docker.ping();
```

## 常见问题

### 1. 连接失败

**错误**: `connect ECONNREFUSED`

**解决方案**:
- 检查远程主机 Docker 是否开启 TCP 端口
- 检查防火墙是否允许连接
- 确认 Docker 守护进程正在运行

### 2. 权限错误

**错误**: `permission denied`

**解决方案**:
- 确保用户在 docker 组中: `sudo usermod -aG docker $USER`
- 或使用 sudo 运行 Docker

### 3. SSH 连接失败

**错误**: `All configured authentication methods failed`

**解决方案**:
- 检查 SSH 私钥路径是否正确
- 确认远程主机允许 SSH 密钥认证
- 检查私钥权限: `chmod 600 /path/to/private/key`

## 安全建议

1. **不要在生产环境使用未加密的 TCP 连接**
2. **使用 TLS 或 SSH 连接远程 Docker**
3. **限制 Docker API 访问的 IP 地址**
4. **定期更新 Docker 和相关证书**
5. **使用防火墙规则保护 Docker 端口**

## 参考资料

- [Dockerode 文档](https://github.com/apocas/dockerode)
- [Docker API 文档](https://docs.docker.com/engine/api/)
- [Docker 安全最佳实践](https://docs.docker.com/engine/security/)
