import { validatePrompt, validateTaskId, isWhitespaceOnly, ValidationError } from '../validation';

describe('Validation Utils', () => {
  describe('validatePrompt', () => {
    it('应该接受有效的提示词', () => {
      expect(() => validatePrompt('修改登录按钮颜色')).not.toThrow();
      expect(() => validatePrompt('a')).not.toThrow();
    });

    it('应该拒绝空字符串', () => {
      expect(() => validatePrompt('')).toThrow(ValidationError);
      expect(() => validatePrompt('')).toThrow('提示词不能为空');
    });

    it('应该拒绝仅包含空白字符的字符串', () => {
      expect(() => validatePrompt('   ')).toThrow(ValidationError);
      expect(() => validatePrompt('\t\n  ')).toThrow(ValidationError);
    });

    it('应该拒绝超过 5000 字符的提示词', () => {
      const longPrompt = 'a'.repeat(5001);
      expect(() => validatePrompt(longPrompt)).toThrow(ValidationError);
      expect(() => validatePrompt(longPrompt)).toThrow('提示词长度不能超过 5000 字符');
    });

    it('应该接受恰好 5000 字符的提示词', () => {
      const maxPrompt = 'a'.repeat(5000);
      expect(() => validatePrompt(maxPrompt)).not.toThrow();
    });
  });

  describe('validateTaskId', () => {
    it('应该接受有效的任务 ID', () => {
      expect(() => validateTaskId('task-123')).not.toThrow();
      expect(() => validateTaskId('abc-def-ghi')).not.toThrow();
    });

    it('应该拒绝空字符串', () => {
      expect(() => validateTaskId('')).toThrow(ValidationError);
      expect(() => validateTaskId('')).toThrow('任务 ID 不能为空');
    });

    it('应该拒绝仅包含空白字符的字符串', () => {
      expect(() => validateTaskId('   ')).toThrow(ValidationError);
    });
  });

  describe('isWhitespaceOnly', () => {
    it('应该识别仅包含空白字符的字符串', () => {
      expect(isWhitespaceOnly('')).toBe(true);
      expect(isWhitespaceOnly('   ')).toBe(true);
      expect(isWhitespaceOnly('\t\n  ')).toBe(true);
      expect(isWhitespaceOnly('\r\n')).toBe(true);
    });

    it('应该识别包含非空白字符的字符串', () => {
      expect(isWhitespaceOnly('a')).toBe(false);
      expect(isWhitespaceOnly('  a  ')).toBe(false);
      expect(isWhitespaceOnly('测试')).toBe(false);
    });
  });
});
