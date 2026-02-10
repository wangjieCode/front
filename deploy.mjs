#!/usr/bin/env zx
import { existsSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { $, which } from 'zx';

// Enable verbose mode for better debugging
$.verbose = true;

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);
process.chdir(rootDir);

const DEPLOY_HOST = process.env.DEPLOY_HOST || '192.168.66.30';
const DEPLOY_USER = process.env.DEPLOY_USER || 'admin';
const DEPLOY_PASS = process.env.DEPLOY_PASS || 'admin';
const DEPLOY_DIR = process.env.DEPLOY_DIR || '/Users/admin/Desktop/front-workspace';
const DEPLOY_NEOVATE_DIR = process.env.DEPLOY_NEOVATE_DIR || `/Users/${DEPLOY_USER}/.neovate`;
const APP_NAME = process.env.APP_NAME || 'front-intern-backend';
const LOCAL_NEOVATE_CONFIG =
  process.env.NEOVATE_CONFIG_PATH || path.join(process.env.HOME || '', '.neovate', 'config.json');
const REMOTE_NEOVATE_CONFIG = `${DEPLOY_NEOVATE_DIR}/config.json`;

const artifact = `/tmp/front-intern-deploy-${Date.now()}.tar.gz`;
const remoteArtifact = `${DEPLOY_DIR}/front-intern-deploy.tar.gz`;

const sshpass = await which('sshpass').then(() => true).catch(() => false);
if (!sshpass) {
  console.error('未检测到 sshpass，密码登录无法非交互执行。请先安装 sshpass 或配置 SSH 免密。');
  process.exit(1);
}
const sshOpts = [
  '-o',
  'StrictHostKeyChecking=no',
  '-o',
  'UserKnownHostsFile=/dev/null',
  '-o',
  'PreferredAuthentications=password',
  '-o',
  'PubkeyAuthentication=no',
  '-o',
  'LogLevel=ERROR',
];
const sshBase = ['sshpass', '-p', DEPLOY_PASS, 'ssh', ...sshOpts];
const scpBase = ['sshpass', '-p', DEPLOY_PASS, 'scp', ...sshOpts];

async function buildWorkspace() {
  console.log('==> 开始安装工作区依赖...');
  await $`pnpm install --frozen-lockfile`;
  console.log('==> 依赖安装完成，开始 Turbo 构建...');
  await $`pnpm turbo run build --filter=@front/shared --filter=web-frontend-intern-assistant-frontend --filter=web-frontend-intern-assistant-backend`;
  console.log('==> Turbo 构建完成');
}

async function syncNeovateConfig() {
  console.log(`==> 同步 Neovate 配置: ${LOCAL_NEOVATE_CONFIG} -> ${DEPLOY_HOST}:${REMOTE_NEOVATE_CONFIG}`);
  if (!existsSync(LOCAL_NEOVATE_CONFIG)) {
    console.error(`❌ 未找到本地 Neovate 配置文件: ${LOCAL_NEOVATE_CONFIG}`);
    process.exit(1);
  }
  await $`${sshBase} ${DEPLOY_USER}@${DEPLOY_HOST} mkdir -p ${DEPLOY_NEOVATE_DIR}`;
  await $`${scpBase} ${LOCAL_NEOVATE_CONFIG} ${DEPLOY_USER}@${DEPLOY_HOST}:${REMOTE_NEOVATE_CONFIG}`;
  console.log('==> Neovate 配置同步完成');
}

console.log('==> 开始构建流程...');
await buildWorkspace();

const archiveItems = [
  'package.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'backend/src',
  'backend/public',
  'backend/drizzle',
  'backend/drizzle.config.ts',
  'backend/package.json',
  'backend/.env.production',  // 部署生产环境配置
  'backend/scripts',          // 添加脚本目录
  'packages/shared/dist',
  'packages/shared/package.json',
  'infrastructure',           // 添加 Docker Compose 配置文件目录
];
const templatesDir = path.join(rootDir, 'backend', 'templates');
if (existsSync(templatesDir)) {
  archiveItems.push('backend/templates');
}

console.log('==> 开始打包文件...');
await $`tar -czf ${artifact} -C ${rootDir} ${archiveItems}`;
console.log(`==> 打包完成: ${artifact}`);

console.log(`==> 开始上传到 ${DEPLOY_HOST}...`);
await $`${scpBase} ${artifact} ${DEPLOY_USER}@${DEPLOY_HOST}:${remoteArtifact}`;
await syncNeovateConfig();

console.log('==> 上传完成，开始远程部署...');

const remoteScript = `
set -euo pipefail

# Setup PATH - add common locations for node, pnpm, and pm2
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"

# Add fnm node installation to PATH
if [ -d "$HOME/.local/share/fnm/node-versions" ]; then
  # Find the current node version directory
  NODE_VERSION_DIR=$(find "$HOME/.local/share/fnm/node-versions" -maxdepth 1 -type d -name "v*" | head -1)
  if [ -n "$NODE_VERSION_DIR" ]; then
    export PATH="$NODE_VERSION_DIR/installation/bin:$PATH"
  fi
fi

# Add pnpm global bin if exists
if [ -d "$HOME/.local/share/pnpm" ]; then
  export PATH="$HOME/.local/share/pnpm:$PATH"
fi
if [ -d "$HOME/Library/pnpm" ]; then
  export PATH="$HOME/Library/pnpm:$PATH"
fi

# Check required commands
command -v node >/dev/null 2>&1 || { echo "❌ node 不在 PATH 中"; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "❌ pnpm 不在 PATH 中"; exit 1; }
command -v pm2 >/dev/null 2>&1 || { echo "❌ pm2 不在 PATH 中"; exit 1; }

echo "==> Prepare directories"
mkdir -p "${DEPLOY_DIR}"
rm -rf "${DEPLOY_DIR}/backend"

echo "==> Extract package"
tar -xzf "${remoteArtifact}" -C "${DEPLOY_DIR}"

echo "==> Setup environment"
cd "${DEPLOY_DIR}"
# 将生产环境配置复制为 .env
if [ -f "backend/.env.production" ]; then
  cp backend/.env.production backend/.env
  echo "✅ 生产环境配置已应用"
fi

echo "==> Install deps"
pnpm install --prod --frozen-lockfile --filter @front/shared --filter web-frontend-intern-assistant-backend

cd "${DEPLOY_DIR}/backend"

echo "==> Verify IFLOW_API_KEY"
if pnpm run verify:neovate; then
  echo "✅ verify:neovate 通过"
else
  echo "⚠️  verify:neovate 失败，跳过阻断继续部署"
fi

echo "==> Start or Restart PM2 (API)"
if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  echo "Stopping and restarting ${APP_NAME} to ensure code update..."
  pm2 restart "${APP_NAME}" --update-env
else
  echo "First time starting ${APP_NAME}..."
  pm2 start pnpm --name "${APP_NAME}" -- start
fi

echo "==> Start or Restart PM2 (Worker)"
if pm2 describe "${APP_NAME}-worker" >/dev/null 2>&1; then
  echo "Stopping and restarting ${APP_NAME}-worker to ensure code update..."
  pm2 restart "${APP_NAME}-worker" --update-env
else
  echo "First time starting ${APP_NAME}-worker..."
  pm2 start pnpm --name "${APP_NAME}-worker" -- run start:worker
fi
pm2 save --force
pm2 list

echo "==> 检查应用状态"
sleep 2
pm2 list

# 检查应用是否正常运行
APP_STATUS=$(pm2 jlist | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ "$APP_STATUS" != "online" ]; then
  echo "⚠️  应用状态异常: $APP_STATUS"
  echo "==> 最近的错误日志:"
  pm2 logs "${APP_NAME}" --lines 20 --nostream --err
  exit 1
fi

echo "==> 远程部署完成"
`;

try {
  // Write remote script to a temporary file and execute it
  const localScriptFile = `/tmp/deploy-script-${Date.now()}.sh`;
  const remoteScriptFile = `/tmp/deploy-script-${Date.now()}.sh`;
  
  // Write script to local temp file using writeFileSync
  console.log('==> 准备部署脚本...');
  writeFileSync(localScriptFile, remoteScript, 'utf8');
  
  // Upload script to remote
  console.log('==> 上传部署脚本到远程服务器...');
  await $`${scpBase} ${localScriptFile} ${DEPLOY_USER}@${DEPLOY_HOST}:${remoteScriptFile}`;
  
  // Execute remote script
  console.log('==> 执行远程部署脚本...');
  await $`${sshBase} ${DEPLOY_USER}@${DEPLOY_HOST} bash -l ${remoteScriptFile}`;
  
  // Cleanup remote script
  console.log('==> 清理远程临时文件...');
  await $`${sshBase} ${DEPLOY_USER}@${DEPLOY_HOST} rm -f ${remoteScriptFile}`;
  
  // Cleanup local files
  console.log('==> 清理本地临时文件...');
  rmSync(artifact, { force: true });
  rmSync(localScriptFile, { force: true });
  
  console.log('==> 部署成功完成！');
} catch (error) {
  console.error('==> 部署失败:', error.message);
  rmSync(artifact, { force: true });
  process.exit(1);
}
