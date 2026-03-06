import { buildSlashCommandText, filterSlashCommands, getSlashQuery } from '../utils/slashCommands';
import { SlashCommandMeta } from '../types/conversation';

const commands: SlashCommandMeta[] = [
  { name: 'help', description: '查看帮助', source: 'system' },
  { name: 'model', description: '切换模型', source: 'system' },
  { name: 'skill:zadig-workflow-deploy', description: '调用发布 skill', source: 'skill' },
];

describe('slashCommands utils', () => {
  it('识别以 / 开头且尚未输入参数的查询', () => {
    expect(getSlashQuery('/mo')).toEqual({ active: true, query: 'mo' });
    expect(getSlashQuery('/model main')).toEqual({ active: false, query: '' });
    expect(getSlashQuery('hello')).toEqual({ active: false, query: '' });
  });

  it('按名称与描述过滤命令', () => {
    expect(filterSlashCommands(commands, 'mod').map(item => item.name)).toEqual(['model']);
    expect(filterSlashCommands(commands, '发布').map(item => item.name)).toEqual(['skill:zadig-workflow-deploy']);
  });

  it('生成可插入输入框的命令文本', () => {
    expect(buildSlashCommandText(commands[0])).toBe('/help ');
    expect(buildSlashCommandText(commands[2])).toBe('/skill zadig-workflow-deploy ');
  });
});

