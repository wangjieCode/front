#!/usr/bin/env ts-node

/**
 * 项目预览功能测试脚本
 * 测试预览部署的完整流程
 */

import dotenv from 'dotenv';
import { ProjectPreviewService } from '../src/services/ProjectPreviewService';
import { ConversationManager } from '../src/services/ConversationManager';
import { SSHExecutor } from '../src/services/SSHExecutor';
import { LocalExecutor } from '../src/services/LocalExecutor';
import { DrizzleConversationStorage } from '../src/storage/DrizzleConversationStorage';
import { ConversationStorageAdapter } from '../src/storage/ConversationStorageAdapter';
import { GitService } from '../src/services/GitService';
import { GitLabMCPService } from '../src/services/GitLabMCPService';
import { loadSSHConfig } from '../src/utils/config';

dotenv.config();

const runMode = process.env.RUN_MODE || 'local';

async function testPreviewService() {
  console.log('🧪 开始测试项目预览功能\n');

  try {
    // 1. 初始化 executor
    console.log('📦 初始化执行器...');
    let executor: any;
    
    if (runMode === 'local') {
      executor = new LocalExecutor();
      console.log('✅ 使用本地执行器\n');
    } else {
      const sshConfig = loadSSHConfig();
      executor = new SSHExecutor();
      await executor.connect(sshConfig);
      console.log('✅ SSH 连接已建立\n');
    }

    // 2. 初始化存储和服务
    console.log('📦 初始化服务...');
    const conversationStorage = new DrizzleConversationStorage();
    const storageAdapter = new ConversationStorageAdapter(conversationStorage);
    const gitService = new GitService(executor, process.env.GIT_WORK_DIR || './workspace');
    const gitlabService = new GitLabMCPService({
      url: process.env.GITLAB_URL || '',
      token: process.env.GITLAB_TOKEN || '',
      projectId: process.env.GITLAB_PROJECT_ID || '',
    });
    const conversationManager = new ConversationManager(storageAdapter, gitService, gitlabService);
    console.log('✅ 服务初始化完成\n');

    // 3. 创建预览服务
    console.log('📦 创建预览服务...');
    const previewService = new ProjectPreviewService(
      conversationManager,
      executor,
      process.env.SSH_HOST
    );
    console.log('✅ 预览服务创建成功\n');

    // 4. 列出现有会话
    console.log('📋 列出现有会话...');
    const sessions = await conversationManager.listSessions();
    console.log(`找到 ${sessions.length} 个会话\n`);

    if (sessions.length === 0) {
      console.log('⚠️  没有可用的会话，请先创建一个对话会话');
      return;
    }

    // 选择第一个编辑模式的会话
    const editSession = sessions.find((s: any) => s.context.mode === 'edit' && s.context.gitBranch);
    
    if (!editSession) {
      console.log('⚠️  没有找到编辑模式且有 Git 分支的会话');
      console.log('   可用会话:');
      sessions.slice(0, 5).forEach((s: any) => {
        console.log(`   - ${s.id} (mode: ${s.context.mode}, gitBranch: ${s.context.gitBranch || 'null'})`);
      });
      return;
    }

    console.log(`📌 使用会话: ${editSession.id}`);
    console.log(`   Git 分支: ${editSession.context.gitBranch}`);
    console.log(`   工作目录: ${editSession.context.projectInfo.workDir}\n`);

    // 5. 测试创建预览
    console.log('🚀 开始创建预览...');
    const startTime = Date.now();
    const result = await previewService.createPreview(editSession.id, undefined, false);
    const duration = Math.round((Date.now() - startTime) / 1000);

    if (result.success) {
      console.log(`✅ 预览创建成功！（耗时: ${duration}s）`);
      console.log(`   预览 URL: ${result.previewUrl}`);
      console.log(`   容器 ID: ${result.containerId}`);
      if (result.deploymentInfo) {
        console.log(`   构建耗时: ${result.deploymentInfo.buildTime}s`);
        console.log(`   启动耗时: ${result.deploymentInfo.startTime}s`);
        console.log(`   端口映射:`);
        result.deploymentInfo.ports.forEach(p => {
          console.log(`     - ${p.service}: ${p.host} -> ${p.container}`);
        });
      }
      console.log();

      // 6. 测试获取预览状态
      console.log('🔍 获取预览状态...');
      const status = await previewService.getPreviewStatus(editSession.id);
      console.log(`   状态: ${status.status}`);
      console.log(`   URL: ${status.url}`);
      console.log(`   容器 ID: ${status.containerId}`);
      console.log(`   分支: ${status.branchName}`);
      if (status.healthCheck) {
        console.log(`   健康检查: ${status.healthCheck.healthy ? '✅ 健康' : '❌ 不健康'}`);
      }
      console.log();

      // 7. 询问是否停止预览
      console.log('⏸️  测试完成');
      console.log(`   预览 URL: ${result.previewUrl}`);
      console.log('   可以在浏览器中访问查看效果');
      console.log();
      console.log('💡 提示: 使用以下命令停止预览:');
      console.log(`   curl -X DELETE http://localhost:3001/api/conversations/${editSession.id}/preview`);
      
    } else {
      console.log(`❌ 预览创建失败: ${result.error}`);
    }

  } catch (error) {
    console.error('❌ 测试失败:', error);
    if (error instanceof Error) {
      console.error('   错误详情:', error.message);
      console.error('   堆栈:', error.stack);
    }
  }

  console.log('\n🏁 测试结束');
}

// 运行测试
testPreviewService().catch(console.error);
