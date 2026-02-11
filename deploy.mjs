#!/usr/bin/env zx
import { existsSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { $, which } from 'zx';

// ─── Configuration ────────────────────────────────────────────────────────────
$.verbose = true;

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);
process.chdir(rootDir);

const config = {
  host: process.env.DEPLOY_HOST || '192.168.66.30',
  user: process.env.DEPLOY_USER || 'admin',
  pass: process.env.DEPLOY_PASS || 'admin',
  deployDir: process.env.DEPLOY_DIR || '/Users/admin/Desktop/front-workspace',
  neovateDir: process.env.DEPLOY_NEOVATE_DIR || `/Users/${process.env.DEPLOY_USER || 'admin'}/.neovate`,
  appName: process.env.APP_NAME || 'front-intern-backend',
  localNeovateConfig:
    process.env.NEOVATE_CONFIG_PATH || path.join(process.env.HOME || '', '.neovate', 'config.json'),
  apiInstances: process.env.API_INSTANCES || '2',
};
config.remoteNeovateConfig = `${config.neovateDir}/config.json`;

// ─── CLI args ─────────────────────────────────────────────────────────────────
// Usage:
//   zx deploy.mjs                  # 完整部署
//   zx deploy.mjs --skip-build     # 跳过构建步骤
//   zx deploy.mjs --dry-run        # 本地构建+打包，但不上传/部署
//   zx deploy.mjs logs             # 实时跟踪远程日志
//   zx deploy.mjs logs:view [N]    # 查看最近 N 行日志（默认 100）
//   zx deploy.mjs logs:error [N]   # 查看最近 N 行错误日志（默认 50）
//   zx deploy.mjs status           # 查看 PM2 进程状态
//   zx deploy.mjs restart          # 重启 API 服务
//   zx deploy.mjs restart:worker   # 重启 Worker 服务
//   zx deploy.mjs restart:all      # 重启所有服务
//   zx deploy.mjs remote:init      # 远程初始化项目数据
//   zx deploy.mjs remote:init:dry-run

const positionalArgs = process.argv.slice(3).filter((a) => !a.startsWith('--'));
const subcommand = positionalArgs[0] || 'deploy';
const dryRun = process.argv.includes('--dry-run');
const skipBuild = process.argv.includes('--skip-build');

// ─── Logging helpers ──────────────────────────────────────────────────────────
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

function step(msg) { console.log(cyan(`\n==> ${msg}`)); }
function ok(msg) { console.log(green(`  ✅ ${msg}`)); }
function warn(msg) { console.log(yellow(`  ⚠️  ${msg}`)); }
function fail(msg) { console.error(red(`  ❌ ${msg}`)); }

// ─── SSH / SCP helpers ────────────────────────────────────────────────────────
const sshOpts = [
  '-o', 'StrictHostKeyChecking=no',
  '-o', 'UserKnownHostsFile=/dev/null',
  '-o', 'PreferredAuthentications=password,keyboard-interactive',
  '-o', 'KbdInteractiveAuthentication=yes',
  '-o', 'PubkeyAuthentication=no',
  '-o', 'LogLevel=ERROR',
];
const target = `${config.user}@${config.host}`;

async function ssh(cmd) {
  return $`sshpass -p ${config.pass} ssh ${sshOpts} ${target} ${cmd}`;
}

/** SSH with TTY allocation for interactive commands like `pm2 logs` (streaming) */
async function sshTTY(cmd) {
  return $`sshpass -p ${config.pass} ssh -tt ${sshOpts} ${target} ${cmd}`;
}

async function scp(src, dest) {
  return $`sshpass -p ${config.pass} scp ${sshOpts} ${src} ${dest}`;
}

/**
 * Execute a command on the remote server with proper PATH setup.
 * Writes a temp script file, uploads it, then runs it — avoids all
 * quote-escaping and && chain-breaking issues.
 */
async function runRemote(cmd, { tty = false } = {}) {
  const ts = Date.now();
  const localTmp = `/tmp/rcmd-${ts}.sh`;
  const remoteTmp = `/tmp/rcmd-${ts}.sh`;

  const script = `#!/usr/bin/env bash
# ── PATH setup (tolerant of missing dirs) ──
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -d "$HOME/.local/share/fnm/node-versions" ]; then
  ND=$(find "$HOME/.local/share/fnm/node-versions" -maxdepth 1 -type d -name "v*" | head -1)
  [ -n "$ND" ] && export PATH="$ND/installation/bin:$PATH"
fi
[ -d "$HOME/.local/share/pnpm" ] && export PATH="$HOME/.local/share/pnpm:$PATH"
[ -d "$HOME/Library/pnpm" ] && export PATH="$HOME/Library/pnpm:$PATH"

# ── Execute ──
${cmd}
`;
  writeFileSync(localTmp, script, 'utf8');
  try {
    await scp(localTmp, `${target}:${remoteTmp}`);
    if (tty) {
      await sshTTY(`bash -l ${remoteTmp}`);
    } else {
      await ssh(`bash -l ${remoteTmp}`);
    }
  } finally {
    // Best-effort cleanup
    await ssh(`rm -f ${remoteTmp}`).catch(() => {});
    if (existsSync(localTmp)) rmSync(localTmp, { force: true });
  }
}

/** Clean up all local temp files */
function cleanupLocal() {
  for (const f of [artifact, localScriptFile]) {
    if (existsSync(f)) rmSync(f, { force: true });
  }
}

// ─── Pre-flight checks ───────────────────────────────────────────────────────
const hasSshpass = await which('sshpass').then(() => true).catch(() => false);
if (!hasSshpass) {
  fail('未检测到 sshpass，密码登录无法非交互执行。请先安装 sshpass 或配置 SSH 免密。');
  process.exit(1);
}

// ─── Subcommands ──────────────────────────────────────────────────────────────
const APP = config.appName;

// First positional arg after subcommand can be process ID or name.
// 'all' → pm2 logs (no arg = all processes)
function getLogsTarget() {
  const raw = positionalArgs[1];
  if (!raw || raw === 'all') return '';  // pm2 logs (all)
  return raw;
}

function isProcessNameTarget(target) {
  return !!target && !/^\d+$/.test(target);
}

function buildTailLogsCommand(target, { lines = '15', stream = true, errOnly = false } = {}) {
  const followFlag = stream ? '-F' : '';
  const outPattern = `${target}-out*.log`;
  const errPattern = `${target}-error*.log`;
  const patterns = errOnly ? [errPattern] : [outPattern, errPattern];
  const patternExpr = patterns.map((p) => `"${p}"`).join(' ');
  const fallbackArgs = `${stream ? '' : ` --lines ${lines} --nostream`}${errOnly ? ' --err' : ''}`;

  return `bash -lc '
set -euo pipefail
shopt -s nullglob
files=()
[ -f "$HOME/.pm2/pm2.log" ] && files+=("$HOME/.pm2/pm2.log")
for p in ${patternExpr}; do
  for f in "$HOME/.pm2/logs"/$p; do
    [ -f "$f" ] && files+=("$f")
  done
done
if [ "\${#files[@]}" -eq 0 ]; then
  echo "未找到可读日志文件，回退到 pm2 logs ${target}" >&2
  exec pm2 logs ${target}${fallbackArgs}
fi
exec tail -n ${lines} ${followFlag} "\${files[@]}"
'`;
}

async function cmdLogs() {
  const t = getLogsTarget();
  const label = t || 'all';
  step(`实时跟踪远程日志: ${label}`);
  if (isProcessNameTarget(t)) {
    await runRemote(buildTailLogsCommand(t, { lines: '15', stream: true }), { tty: true });
    return;
  }
  await runRemote(`exec pm2 logs ${t}`, { tty: true });
}

async function cmdLogsView() {
  const t = getLogsTarget();
  const lines = positionalArgs[2] || '100';
  const label = t || 'all';
  step(`查看远程日志最近 ${lines} 行: ${label}`);
  if (isProcessNameTarget(t)) {
    await runRemote(buildTailLogsCommand(t, { lines, stream: false }));
    return;
  }
  await runRemote(`pm2 logs ${t} --lines ${lines} --nostream`);
}

async function cmdLogsError() {
  const t = getLogsTarget();
  const lines = positionalArgs[2] || '50';
  const label = t || 'all';
  step(`查看远程错误日志最近 ${lines} 行: ${label}`);
  if (isProcessNameTarget(t)) {
    await runRemote(buildTailLogsCommand(t, { lines, stream: false, errOnly: true }));
    return;
  }
  await runRemote(`pm2 logs ${t} --err --lines ${lines} --nostream`);
}

async function cmdStatus() {
  step('远程 PM2 进程状态');
  await runRemote('pm2 list');
}

async function cmdRestart() {
  step(`重启 API: ${APP}`);
  await runRemote(`pm2 restart ${APP} && pm2 list`);
  ok('API 重启完成');
}

async function cmdRestartWorker() {
  step(`重启 Worker: ${APP}-worker`);
  await runRemote(`pm2 restart ${APP}-worker && pm2 list`);
  ok('Worker 重启完成');
}

async function cmdRestartAll() {
  step('重启所有服务');
  await runRemote(`pm2 restart ${APP} && pm2 restart ${APP}-worker && pm2 list`);
  ok('所有服务已重启');
}

async function cmdRemoteInit(isDryRun = false) {
  const script = isDryRun ? 'pnpm init:projects:dry-run' : 'pnpm init:projects';
  step(`远程执行: ${script}`);
  await runRemote(`cd ${config.deployDir}/backend && ${script}`);
  ok('完成');
}

// ─── Route subcommands ────────────────────────────────────────────────────────
const subcommandMap = {
  'logs': cmdLogs,
  'logs:view': cmdLogsView,
  'logs:error': cmdLogsError,
  'status': cmdStatus,
  'restart': cmdRestart,
  'restart:worker': cmdRestartWorker,
  'restart:all': cmdRestartAll,
  'remote:init': () => cmdRemoteInit(false),
  'remote:init:dry-run': () => cmdRemoteInit(true),
};

if (subcommand !== 'deploy') {
  const handler = subcommandMap[subcommand];
  if (!handler) {
    fail(`未知子命令: ${subcommand}`);
    console.log('\n可用的子命令:');
    console.log('  deploy (默认)    完整部署');
    console.log('  logs             实时跟踪远程日志');
    console.log('  logs:view [N]    查看最近 N 行日志');
    console.log('  logs:error [N]   查看最近 N 行错误日志');
    console.log('  status           PM2 进程状态');
    console.log('  restart          重启 API');
    console.log('  restart:worker   重启 Worker');
    console.log('  restart:all      重启所有服务');
    console.log('  remote:init      远程初始化项目');
    console.log('  remote:init:dry-run');
    process.exit(1);
  }
  try {
    await handler();
  } catch (error) {
    fail(error.message);
    process.exit(1);
  }
  process.exit(0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Below is the deploy flow (subcommand === 'deploy')
// ═══════════════════════════════════════════════════════════════════════════════

const timestamp = Date.now();
const artifact = `/tmp/front-intern-deploy-${timestamp}.tar.gz`;
const remoteArtifact = `${config.deployDir}/front-intern-deploy.tar.gz`;
const localScriptFile = `/tmp/deploy-script-${timestamp}.sh`;
const remoteScriptFile = `/tmp/deploy-script-${timestamp}.sh`;

if (dryRun) {
  warn('DRY-RUN 模式：将跳过实际部署操作');
}

// ─── Build ────────────────────────────────────────────────────────────────────
async function buildWorkspace() {
  if (skipBuild) {
    warn('已跳过构建（--skip-build）');
    return;
  }
  step('安装工作区依赖...');
  await $`pnpm install --frozen-lockfile`;
  ok('依赖安装完成');

  step('Turbo 构建...');
  await $`pnpm turbo run build --filter=@front/shared --filter=web-frontend-intern-assistant-frontend --filter=web-frontend-intern-assistant-backend`;
  ok('Turbo 构建完成');
}

// ─── Archive ──────────────────────────────────────────────────────────────────
function collectArchiveItems() {
  const required = [
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    'backend/dist',
    'backend/src',
    'backend/package.json',
    'packages/shared/dist',
    'packages/shared/package.json',
  ];
  const optional = [
    'backend/public',
    'backend/drizzle',
    'backend/drizzle.config.ts',
    'backend/.env.production',
    'backend/scripts',
    'backend/templates',
    'infrastructure',
  ];

  const missing = required.filter((item) => !existsSync(path.join(rootDir, item)));
  if (missing.length > 0) {
    fail(`以下必需文件 / 目录不存在:\n    ${missing.join('\n    ')}`);
    process.exit(1);
  }

  const items = [...required];
  for (const item of optional) {
    if (existsSync(path.join(rootDir, item))) {
      items.push(item);
    } else {
      warn(`可选项缺失，已跳过: ${item}`);
    }
  }
  return items;
}

// ─── Sync Neovate config ──────────────────────────────────────────────────────
async function syncNeovateConfig() {
  step(`同步 Neovate 配置: ${config.localNeovateConfig} -> ${config.host}:${config.remoteNeovateConfig}`);
  if (!existsSync(config.localNeovateConfig)) {
    fail(`未找到本地 Neovate 配置文件: ${config.localNeovateConfig}`);
    process.exit(1);
  }
  await ssh(`mkdir -p ${config.neovateDir}`);
  await scp(config.localNeovateConfig, `${target}:${config.remoteNeovateConfig}`);
  ok('Neovate 配置同步完成');
}

// ─── Generate remote deploy script ───────────────────────────────────────────
function generateRemoteScript() {
  const D = config.deployDir;
  const INST = config.apiInstances;

  return `#!/usr/bin/env bash
set -euo pipefail

# ── PATH setup ──────────────────────────────────────────────────────────────
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if [ -d "$HOME/.local/share/fnm/node-versions" ]; then
  NODE_DIR=$(find "$HOME/.local/share/fnm/node-versions" -maxdepth 1 -type d -name "v*" | head -1)
  [ -n "$NODE_DIR" ] && export PATH="$NODE_DIR/installation/bin:$PATH"
fi
for PNPM_DIR in "$HOME/.local/share/pnpm" "$HOME/Library/pnpm"; do
  [ -d "$PNPM_DIR" ] && export PATH="$PNPM_DIR:$PATH"
done

# ── Verify required commands ────────────────────────────────────────────────
for cmd in node pnpm pm2; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "❌ $cmd 不在 PATH 中"; exit 1; }
done
echo "node: $(node -v)  pnpm: $(pnpm -v)  pm2: $(pm2 -v)"

# ── Backup previous release ────────────────────────────────────────────────
BACKUP_DIR="${D}/.backup-$(date +%Y%m%d%H%M%S)"
if [ -d "${D}/backend" ]; then
  echo "==> 备份当前版本到 $BACKUP_DIR"
  mkdir -p "$BACKUP_DIR"
  cp -R "${D}/backend" "$BACKUP_DIR/backend"
fi

# ── Extract ─────────────────────────────────────────────────────────────────
echo "==> 准备目录并解压"
mkdir -p "${D}"
rm -rf "${D}/backend"
tar -xzf "${remoteArtifact}" -C "${D}"

# ── Environment ─────────────────────────────────────────────────────────────
cd "${D}"
if [ -f "backend/.env.production" ]; then
  cp backend/.env.production backend/.env
  echo "✅ 生产环境配置已应用"
fi

# ── Install production deps ─────────────────────────────────────────────────
echo "==> 安装生产依赖"
pnpm install --prod --frozen-lockfile \\
  --filter @front/shared \\
  --filter web-frontend-intern-assistant-backend

cd "${D}/backend"
if [ ! -f "./dist/index.js" ]; then
  echo "❌ 未找到 backend 构建产物 dist/index.js，请先执行本地构建并重新部署"
  exit 1
fi

# ── Verify Neovate ──────────────────────────────────────────────────────────
echo "==> 验证 Neovate 配置"
if pnpm run verify:neovate; then
  echo "✅ verify:neovate 通过"
else
  echo "⚠️  verify:neovate 失败，跳过阻断继续部署"
fi

# ── Helper functions ────────────────────────────────────────────────────────
check_runtime() {
  pm2 jlist | node -e "
    const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    const app = list.find(p => p.name === '${APP}');
    const m = app?.pm2_env?.exec_mode;
    const i = app?.pm2_env?.exec_interpreter;
    const s = String(app?.pm2_env?.pm_exec_path || '');
    process.stdout.write(
      m === 'cluster_mode' && i === 'node' && s.endsWith('/dist/index.js') ? 'ok' : 'bad'
    );
  "
}

count_instances() {
  pm2 jlist | node -e "
    const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    process.stdout.write(String(list.filter(p => p.name === '${APP}').length));
  "
}

check_health() {
  local name="\$1"
  local expect_count="\$2"
  pm2 jlist | node -e "
    const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
    const procs = list.filter(p => p.name === '\$name');
    const ok = procs.length === \$expect_count && procs.every(p => p.pm2_env?.status === 'online');
    const detail = procs.map(p => p.pm_id + ':' + (p.pm2_env?.status || 'unknown')).join(',');
    process.stdout.write(ok ? 'ok' : 'bad:' + detail);
  "
}

show_error_logs() {
  local name="\$1"
  echo "---- pm2 主日志最近 120 行 ----"
  tail -n 120 "$HOME/.pm2/pm2.log" 2>/dev/null || true
  echo "---- \$name 最近错误日志 ----"
  pm2 logs "\$name" --lines 80 --nostream --err 2>/dev/null || true
  echo "---- \$name 最近输出日志 ----"
  pm2 logs "\$name" --lines 40 --nostream 2>/dev/null || true
}

# ── PM2: API (cluster) ─────────────────────────────────────────────────────
echo "==> 部署 API 服务 (cluster, instances=${INST})"
if pm2 describe "${APP}" >/dev/null 2>&1; then
  RUNTIME_OK=$(check_runtime)
  if [ "$RUNTIME_OK" = "ok" ]; then
    CUR=$(count_instances)
    if [ "$CUR" != "${INST}" ]; then
      echo "  Scaling: $CUR -> ${INST}"
      pm2 scale "${APP}" "${INST}"
    fi
    echo "  Rolling reload (zero-downtime)..."
    pm2 reload "${APP}" --update-env
  else
    echo "  ⚠️ 运行时不符合预期，重建进程..."
    pm2 delete "${APP}"
    pm2 start dist/index.js \\
      --name "${APP}" -i "${INST}" --interpreter node --update-env
  fi
else
  echo "  首次启动 ${APP}..."
  pm2 start dist/index.js \\
    --name "${APP}" -i "${INST}" --interpreter node --update-env
fi

# ── PM2: Worker ─────────────────────────────────────────────────────────────
echo "==> 部署 Worker 服务"
if pm2 describe "${APP}-worker" >/dev/null 2>&1; then
  pm2 restart "${APP}-worker" --update-env
else
  echo "  首次启动 ${APP}-worker..."
  pm2 start pnpm --name "${APP}-worker" -- run start:worker
fi

pm2 save --force

# ── Health check ────────────────────────────────────────────────────────────
echo "==> 等待进程稳定..."
sleep 3
pm2 list

API_HEALTH=$(check_health "${APP}" ${INST})
WORKER_HEALTH=$(check_health "${APP}-worker" 1)

if [ "$API_HEALTH" != "ok" ]; then
  echo "❌ API 状态异常: $API_HEALTH"
  show_error_logs "${APP}"

  # Attempt rollback
  if [ -d "$BACKUP_DIR/backend" ]; then
    echo "==> 尝试回滚到上一版本..."
    rm -rf "${D}/backend"
    cp -R "$BACKUP_DIR/backend" "${D}/backend"
    cd "${D}/backend"
    pm2 reload "${APP}" --update-env || true
    echo "⚠️  已尝试回滚，请检查服务状态"
  fi
  exit 1
fi

if [ "$WORKER_HEALTH" != "ok" ]; then
  echo "⚠️  Worker 状态异常（不阻断发布）: $WORKER_HEALTH"
  show_error_logs "${APP}-worker"
fi

# ── Cleanup old backups (keep last 3) ───────────────────────────────────────
echo "==> 清理历史备份"
ls -dt ${D}/.backup-* 2>/dev/null | tail -n +4 | xargs rm -rf 2>/dev/null || true

echo "==> ✅ 远程部署完成"
`;
}

// ─── Deploy main flow ─────────────────────────────────────────────────────────
const startTime = Date.now();

try {
  await buildWorkspace();

  step('收集并校验打包文件...');
  const archiveItems = collectArchiveItems();
  ok(`共 ${archiveItems.length} 个文件 / 目录`);

  step('打包...');
  await $`tar -czf ${artifact} -C ${rootDir} ${archiveItems}`;
  ok(`打包完成: ${artifact}`);

  if (dryRun) {
    step('DRY-RUN 完成，跳过上传和远程部署');
    cleanupLocal();
    process.exit(0);
  }

  step(`上传到 ${config.host}...`);
  await scp(artifact, `${target}:${remoteArtifact}`);
  ok('上传完成');

  await syncNeovateConfig();

  step('生成远程部署脚本...');
  const remoteScript = generateRemoteScript();
  writeFileSync(localScriptFile, remoteScript, 'utf8');

  step('上传部署脚本...');
  await scp(localScriptFile, `${target}:${remoteScriptFile}`);

  step('执行远程部署...');
  await ssh(`bash -l ${remoteScriptFile}`);

  step('清理远程临时文件...');
  await ssh(`rm -f ${remoteScriptFile}`).catch(() => warn('远程临时文件清理失败，非关键'));

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(green(`\n🎉 部署成功完成！耗时 ${elapsed}s\n`));
} catch (error) {
  fail(`部署失败: ${error.message}`);
  process.exit(1);
} finally {
  cleanupLocal();
}
