import { prompt } from '@neovate/code';

async function testPrompt() {
  const model = 'iflow/qwen3-coder-plus';
  const cwd = process.cwd();
  
  console.log(`[Test] Calling @neovate/code prompt with model: ${model}`);
  
  try {
    const result = await prompt('Explain what this code does', {
      model: model,
      cwd: cwd,
    });

    console.log('[Test] Result content:');
    console.log(result.content);
  } catch (error) {
    console.error('[Test] Error during prompt:', error);
  }
}

testPrompt();
