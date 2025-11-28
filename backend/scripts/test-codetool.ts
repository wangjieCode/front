/**
 * 代码工具配置验证脚本
 * 测试 CodeToolConfig 和 CodeToolService 的基本功能
 */

import { CodeToolConfig } from '../src/config/CodeToolConfig';
import { CodeToolService } from '../src/services/CodeToolService';
import { LocalExecutor } from '../src/services/LocalExecutor';

async function testCodeToolConfig() {
  console.log('=== 测试 CodeToolConfig ===\n');

  // 测试配置加载
  const config = new CodeToolConfig();
  console.log('✅ CodeToolConfig 实例创建成功');
  
  const toolType = config.getToolType();
  console.log(`📦 工具类型: ${toolType}`);
  
  const toolOptions = config.getToolOptions();
  console.log(`⚙️  工具选项:`, toolOptions);
  
  // 测试配置验证
  const validation = config.validate();
  if (validation.valid) {
    console.log('✅ 配置验证通过');
  } else {
    console.log(`❌ 配置验证失败: ${validation.error}`);
  }
  
  console.log('\n');
}

async function testCodeToolService() {
  console.log('=== 测试 CodeToolService ===\n');

  try {
    // 创建本地执行器
    const executor = new LocalExecutor();
    console.log('✅ LocalExecutor 创建成功');
    
    // 创建代码工具服务
    const codeToolService = new CodeToolService(executor);
    console.log('✅ CodeToolService 创建成功');
    
    // 获取工具名称
    const toolName = codeToolService.getToolName();
    console.log(`🔧 当前工具: ${toolName}`);
    
    // 获取工具信息
    const workDir = './workspace/dtmall-admin';
    console.log(`📁 工作目录: ${workDir}`);
    
    const toolInfo = await codeToolService.getToolInfo(workDir);
    console.log(`📊 工具信息:`);
    console.log(`   - 名称: ${toolInfo.name}`);
    console.log(`   - 版本: ${toolInfo.version}`);
    console.log(`   - 可用: ${toolInfo.available ? '✅' : '❌'}`);
    
    if (!toolInfo.available) {
      console.log(`\n⚠️  工具 ${toolInfo.name} 不可用`);
      console.log(`   请确保 ${toolInfo.name} 已安装并在 PATH 中`);
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error instanceof Error ? error.message : error);
  }
  
  console.log('\n');
}

async function testToolSwitch() {
  console.log('=== 测试工具切换 ===\n');

  try {
    const executor = new LocalExecutor();
    
    // 测试 qodercli
    console.log('测试 qodercli:');
    const config1 = new CodeToolConfig();
    config1.setToolType('qodercli');
    const service1 = new CodeToolService(executor, config1);
    console.log(`  工具名称: ${service1.getToolName()}`);
    
    // 测试 neovate
    console.log('测试 neovate:');
    const config2 = new CodeToolConfig();
    config2.setToolType('neovate');
    const service2 = new CodeToolService(executor, config2);
    console.log(`  工具名称: ${service2.getToolName()}`);
    
    console.log('✅ 工具切换测试通过');
    
  } catch (error) {
    console.error('❌ 工具切换测试失败:', error instanceof Error ? error.message : error);
  }
  
  console.log('\n');
}

async function main() {
  console.log('🚀 开始验证代码工具配置\n');
  console.log('='.repeat(50));
  console.log('\n');
  
  await testCodeToolConfig();
  await testCodeToolService();
  await testToolSwitch();
  
  console.log('='.repeat(50));
  console.log('\n✅ 验证完成！');
}

main().catch(error => {
  console.error('❌ 验证过程出错:', error);
  process.exit(1);
});
