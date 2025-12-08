import Docker from 'dockerode';

/**
 * Docker 容器操作服务
 * 支持连接本地和远程 Docker 守护进程
 */
export class DockerService {
  private docker: Docker;

  /**
   * 创建 Docker 服务实例
   * @param options Docker 连接配置
   */
  constructor(options?: Docker.DockerOptions) {
    this.docker = new Docker(options);
  }

  /**
   * 连接到远程 Docker
   * @param host 远程主机地址
   * @param port 端口号，默认 2375
   * @param username 用户名（可选）
   * @param password 密码（可选）
   */
  static connectRemote(
    host: string,
    port: number = 2375,
    username?: string,
    password?: string
  ): DockerService {
    const options: Docker.DockerOptions = {
      host,
      port,
    };

    // 如果提供了认证信息，添加到 headers
    if (username && password) {
      const auth = Buffer.from(`${username}:${password}`).toString('base64');
      options.headers = {
        Authorization: `Basic ${auth}`,
      };
    }

    return new DockerService(options);
  }

  /**
   * 通过 SSH 连接远程 Docker
   * @param host SSH 主机
   * @param port SSH 端口
   * @param username SSH 用户名
   * @param privateKey SSH 私钥路径或内容
   */
  static connectRemoteSSH(
    host: string,
    username: string,
    privateKey: string,
    port: number = 22
  ): DockerService {
    return new DockerService({
      protocol: 'ssh',
      host,
      port,
      username,
      sshOptions: {
        privateKey,
      },
    });
  }

  /**
   * 列出所有容器
   * @param all 是否包含停止的容器
   */
  async listContainers(all: boolean = false) {
    return await this.docker.listContainers({ all });
  }

  /**
   * 获取容器详细信息
   * @param containerId 容器 ID 或名称
   */
  async inspectContainer(containerId: string) {
    const container = this.docker.getContainer(containerId);
    return await container.inspect();
  }

  /**
   * 启动容器
   * @param containerId 容器 ID 或名称
   */
  async startContainer(containerId: string) {
    const container = this.docker.getContainer(containerId);
    return await container.start();
  }

  /**
   * 停止容器
   * @param containerId 容器 ID 或名称
   */
  async stopContainer(containerId: string) {
    const container = this.docker.getContainer(containerId);
    return await container.stop();
  }

  /**
   * 重启容器
   * @param containerId 容器 ID 或名称
   */
  async restartContainer(containerId: string) {
    const container = this.docker.getContainer(containerId);
    return await container.restart();
  }

  /**
   * 删除容器
   * @param containerId 容器 ID 或名称
   * @param force 是否强制删除
   */
  async removeContainer(containerId: string, force: boolean = false) {
    const container = this.docker.getContainer(containerId);
    return await container.remove({ force });
  }

  /**
   * 创建并启动容器
   * @param options 容器创建选项
   */
  async createAndStartContainer(options: Docker.ContainerCreateOptions) {
    const container = await this.docker.createContainer(options);
    await container.start();
    return container;
  }

  /**
   * 执行容器内命令
   * @param containerId 容器 ID 或名称
   * @param cmd 要执行的命令数组
   */
  async execCommand(containerId: string, cmd: string[]) {
    const container = this.docker.getContainer(containerId);
    const exec = await container.exec({
      Cmd: cmd,
      AttachStdout: true,
      AttachStderr: true,
    });

    return new Promise<string>((resolve, reject) => {
      exec.start({ hijack: true, stdin: false }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let output = '';
        stream?.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });

        stream?.on('end', () => {
          resolve(output);
        });

        stream?.on('error', reject);
      });
    });
  }

  /**
   * 获取容器日志
   * @param containerId 容器 ID 或名称
   * @param tail 获取最后 N 行日志
   */
  async getContainerLogs(containerId: string, tail: number = 100) {
    const container = this.docker.getContainer(containerId);
    const logs = await container.logs({
      stdout: true,
      stderr: true,
      tail,
    });
    return logs.toString();
  }

  /**
   * 获取容器统计信息（CPU、内存等）
   * @param containerId 容器 ID 或名称
   */
  async getContainerStats(containerId: string) {
    const container = this.docker.getContainer(containerId);
    const stats = await container.stats({ stream: false });
    return stats;
  }

  /**
   * 列出所有镜像
   */
  async listImages() {
    return await this.docker.listImages();
  }

  /**
   * 拉取镜像
   * @param imageName 镜像名称，如 'nginx:latest'
   */
  async pullImage(imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.pull(imageName, (err: Error, stream: NodeJS.ReadableStream) => {
        if (err) {
          reject(err);
          return;
        }

        this.docker.modem.followProgress(stream, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  /**
   * 删除镜像
   * @param imageId 镜像 ID 或名称
   */
  async removeImage(imageId: string) {
    const image = this.docker.getImage(imageId);
    return await image.remove();
  }

  /**
   * 获取 Docker 系统信息
   */
  async getSystemInfo() {
    return await this.docker.info();
  }

  /**
   * 获取 Docker 版本信息
   */
  async getVersion() {
    return await this.docker.version();
  }

  /**
   * Ping Docker 守护进程
   */
  async ping() {
    return await this.docker.ping();
  }

  /**
   * 从 Dockerfile 构建镜像
   * @param dockerfilePath Dockerfile 路径或内容
   * @param imageName 镜像名称和标签
   * @param context 构建上下文路径
   */
  async buildImageFromDockerfile(
    dockerfilePath: string,
    imageName: string,
    context: string = '.'
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.buildImage(
        {
          context,
          src: [dockerfilePath],
        },
        { t: imageName },
        (err, stream) => {
          if (err) {
            reject(err);
            return;
          }

          this.docker.modem.followProgress(stream!, (err) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          });
        }
      );
    });
  }

  /**
   * 从 tar 包构建镜像
   * @param tarStream tar 包流
   * @param imageName 镜像名称
   */
  async buildImageFromTar(tarStream: NodeJS.ReadableStream, imageName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.docker.buildImage(tarStream, { t: imageName }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        this.docker.modem.followProgress(stream!, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    });
  }

  /**
   * 获取镜像详细信息
   * @param imageId 镜像 ID 或名称
   */
  async inspectImage(imageId: string) {
    const image = this.docker.getImage(imageId);
    return await image.inspect();
  }

  /**
   * 根据镜像创建容器
   * @param imageName 镜像名称
   * @param containerName 容器名称
   * @param options 额外配置
   */
  async createContainerFromImage(
    imageName: string,
    containerName: string,
    options: Partial<Docker.ContainerCreateOptions> = {}
  ) {
    return await this.docker.createContainer({
      Image: imageName,
      name: containerName,
      ...options,
    });
  }
}
