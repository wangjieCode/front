import { Client } from 'ssh2';
import * as dotenv from 'dotenv';

dotenv.config();

const SSH_HOST = process.env.DOCKER_SSH_HOST || '122.51.50.97';
const SSH_PORT = parseInt(process.env.DOCKER_SSH_PORT || '22');
const SSH_USERNAME = process.env.DOCKER_SSH_USERNAME || 'root';
const SSH_PASSWORD = process.env.DOCKER_SSH_PASSWORD || 'Wj1314HHXXttxs';

/**
 * 通过 SSH 执行 Docker 命令
 */
class SSHDockerClient {
  private client: Client;

  constructor() {
    this.client = new Client();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`连接到 SSH: ${SSH_USERNAME}@${SSH_HOST}:${SSH_PORT}\n`);

      this.client
        .on('ready', () => {
          console.log('✓ SSH 连接成功\n');
          resolve();
        })
        .on('error', reject)
        .connect({
          host: SSH_HOST,
          port: SSH_PORT,
          username: SSH_USERNAME,
          password: SSH_PASSWORD,
        });
    });
  }

  async exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.client.exec(command, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        let output = '';
        let errorOutput = '';

        stream
          .on('data', (data: Buffer) => {
            output += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });

        stream.on('close', (code: number) => {
          if (code !== 0) {
            reject(new Error(errorOutput || `命令执行失败，退出码: ${code}`));
          } else {
            resolve(output);
          }
        });
      });
    });
  }

  close(): void {
    this.client.end();
  }
}

async function main() {
  console.log('=== 通过 SSH 管理远程 Docker ===\n');

  const ssh = new SSHDockerClient();

  try {
    await ssh.connect();

    // 检查 Docker 是否安装
    console.log('1. 检查 Docker 版本');
    const version = await ssh.exec('docker --version');
    console.log(version.trim());

    // 获取 Docker 信息
    console.log('\n2. 获取 Docker 系统信息');
    const info = await ssh.exec('docker info --format "{{.ServerVersion}}"');
    console.log(`Docker 版本: ${info.trim()}`);

    const containers = await ssh.exec('docker info --format "{{.Containers}}"');
    console.log(`容器总数: ${containers.trim()}`);

    const running = await ssh.exec('docker info --format "{{.ContainersRunning}}"');
    console.log(`运行中: ${running.trim()}`);

    // 列出容器
    console.log('\n3. 列出所有容器');
    const containerList = await ssh.exec('docker ps -a --format "{{.ID}}\\t{{.Names}}\\t{{.Image}}\\t{{.Status}}"');

    if (containerList.trim()) {
      const lines = containerList.trim().split('\n');
      console.log(`找到 ${lines.length} 个容器:\n`);
      lines.forEach((line, index) => {
        const [id, name, image, status] = line.split('\t');
        console.log(`[${index + 1}] ${name}`);
        console.log(`    ID: ${id}`);
        console.log(`    镜像: ${image}`);
        console.log(`    状态: ${status}`);
      });
    } else {
      console.log('(无容器)');
    }

    // 列出镜像
    console.log('\n4. 列出所有镜像');
    const imageList = await ssh.exec('docker images --format "{{.Repository}}:{{.Tag}}\\t{{.Size}}"');

    if (imageList.trim()) {
      const lines = imageList.trim().split('\n');
      console.log(`找到 ${lines.length} 个镜像:\n`);
      lines.slice(0, 5).forEach((line, index) => {
        const [name, size] = line.split('\t');
        console.log(`[${index + 1}] ${name}`);
        console.log(`    大小: ${size}`);
      });
    } else {
      console.log('(无镜像)');
    }

    // 创建测试容器
    console.log('\n5. 创建 Nginx 测试容器');
    console.log('拉取 nginx:alpine 镜像...');
    await ssh.exec('docker pull nginx:alpine');
    console.log('✓ 镜像拉取完成');

    console.log('创建并启动容器...');
    const containerId = await ssh.exec(
      'docker run -d --name test-nginx-ssh -p 8081:80 --restart unless-stopped nginx:alpine'
    );
    console.log(`✓ 容器已创建: ${containerId.trim().substring(0, 12)}`);

    // 等待容器启动
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 检查容器状态
    console.log('\n6. 检查容器状态');
    const status = await ssh.exec('docker ps --filter name=test-nginx-ssh --format "{{.Status}}"');
    console.log(`容器状态: ${status.trim()}`);

    console.log('\n✅ 测试完成！');
    console.log(`\n访问测试: http://${SSH_HOST}:8081`);
    console.log('\n管理容器:');
    console.log(`  停止: ssh ${SSH_USERNAME}@${SSH_HOST} "docker stop test-nginx-ssh"`);
    console.log(`  删除: ssh ${SSH_USERNAME}@${SSH_HOST} "docker rm -f test-nginx-ssh"`);

    ssh.close();
  } catch (error: any) {
    console.error('\n❌ 错误:', error.message);
    ssh.close();
    process.exit(1);
  }
}

main();
