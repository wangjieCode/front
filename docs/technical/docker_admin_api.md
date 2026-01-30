# Docker 与 Compose 管理

## Docker API

- 容器管理：list / inspect / start / stop / restart / remove
- 日志与统计：logs / stats
- 镜像管理：list / inspect / pull / remove / build
- 创建容器：imageName + containerName + ports/env/volumes

## Docker Compose API

- init：初始化 docker-compose.yml
- up/down/restart：服务生命周期
- ps/logs：状态与日志
- build/deploy：构建与部署

## 运行依赖

- Docker API 通过环境变量配置远端访问
- Compose 操作依赖 workDir 下的 docker-compose.yml
