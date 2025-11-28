import {
  extractSessionId,
  isValidSessionId,
  extractSessionIdFromStream,
} from '../NeovateSessionExtractor';

describe('NeovateSessionExtractor', () => {
  describe('extractSessionId', () => {
    it('should extract session ID from JSON array format', () => {
      const output = '[{"type":"system","subtype":"init","sessionId":"cf00503d","model":"iflow/qwen3-coder-plus"}]';
      const sessionId = extractSessionId(output);
      expect(sessionId).toBe('cf00503d');
    });

    it('should extract session ID from JSON object format', () => {
      const output = '{"type":"system","sessionId":"abc123def","model":"test"}';
      const sessionId = extractSessionId(output);
      expect(sessionId).toBe('abc123def');
    });

    it('should extract session ID from multiple messages', () => {
      const output = '[{"type":"init"},{"type":"message","sessionId":"test-session-id"},{"type":"result"}]';
      const sessionId = extractSessionId(output);
      expect(sessionId).toBe('test-session-id');
    });

    it('should extract session ID from text format', () => {
      const output = 'Session started with sessionId: xyz789';
      const sessionId = extractSessionId(output);
      expect(sessionId).toBe('xyz789');
    });

    it('should extract session ID with various formats', () => {
      const testCases = [
        { input: 'sessionId: abc123', expected: 'abc123' },
        { input: 'Session ID: def456', expected: 'def456' },
        { input: 'session_id: ghi789', expected: 'ghi789' },
        { input: 'session-id: jkl012', expected: 'jkl012' },
      ];

      for (const testCase of testCases) {
        const sessionId = extractSessionId(testCase.input);
        expect(sessionId).toBe(testCase.expected);
      }
    });

    it('should return null for empty output', () => {
      expect(extractSessionId('')).toBeNull();
      expect(extractSessionId('   ')).toBeNull();
    });

    it('should return null when no session ID found', () => {
      const output = '{"type":"message","content":"Hello"}';
      const sessionId = extractSessionId(output);
      expect(sessionId).toBeNull();
    });

    it('should handle malformed JSON gracefully', () => {
      const output = '{invalid json}';
      const sessionId = extractSessionId(output);
      expect(sessionId).toBeNull();
    });

    it('should extract UUID format session ID', () => {
      const output = '{"sessionId":"550e8400-e29b-41d4-a716-446655440000"}';
      const sessionId = extractSessionId(output);
      expect(sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should extract short format session ID', () => {
      const output = '{"sessionId":"a1b2"}';
      const sessionId = extractSessionId(output);
      expect(sessionId).toBe('a1b2');
    });
  });

  describe('isValidSessionId', () => {
    it('should validate correct session IDs', () => {
      expect(isValidSessionId('cf00503d')).toBe(true);
      expect(isValidSessionId('abc123')).toBe(true);
      expect(isValidSessionId('test-session-id')).toBe(true);
      expect(isValidSessionId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject invalid session IDs', () => {
      expect(isValidSessionId(null)).toBe(false);
      expect(isValidSessionId('')).toBe(false);
      expect(isValidSessionId('abc')).toBe(false); // 太短
      expect(isValidSessionId('a'.repeat(65))).toBe(false); // 太长
      expect(isValidSessionId('abc@123')).toBe(false); // 包含非法字符
      expect(isValidSessionId('abc 123')).toBe(false); // 包含空格
      expect(isValidSessionId('abc_123')).toBe(false); // 包含下划线
    });
  });

  describe('extractSessionIdFromStream', () => {
    it('should extract session ID from multi-line stream', () => {
      const stream = `
        {"type":"init"}
        {"type":"message","sessionId":"stream-session-123"}
        {"type":"result"}
      `;
      const sessionId = extractSessionIdFromStream(stream);
      expect(sessionId).toBe('stream-session-123');
    });

    it('should extract session ID from first occurrence in stream', () => {
      const stream = `
        {"type":"message","sessionId":"first-id"}
        {"type":"message","sessionId":"second-id"}
      `;
      const sessionId = extractSessionIdFromStream(stream);
      expect(sessionId).toBe('first-id');
    });

    it('should handle empty stream', () => {
      expect(extractSessionIdFromStream('')).toBeNull();
      expect(extractSessionIdFromStream('\n\n')).toBeNull();
    });

    it('should extract from real Neovate output format', () => {
      const realOutput = '[{"type":"system","subtype":"init","sessionId":"cf00503d","model":"iflow/qwen3-coder-plus","cwd":"/path","tools":["read","write"]},{"parentUuid":"uuid","uuid":"uuid2","role":"assistant","content":[{"type":"text","text":"Hello"}],"sessionId":"cf00503d"}]';
      const sessionId = extractSessionIdFromStream(realOutput);
      expect(sessionId).toBe('cf00503d');
    });

    it('should validate extracted session ID', () => {
      // 包含无效的会话 ID
      const stream = '{"sessionId":"ab"}'; // 太短
      const sessionId = extractSessionIdFromStream(stream);
      expect(sessionId).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle very long output', () => {
      const longOutput = 'x'.repeat(10000) + '{"sessionId":"hidden-id"}' + 'y'.repeat(10000);
      const sessionId = extractSessionId(longOutput);
      expect(sessionId).toBe('hidden-id');
    });

    it('should handle output with multiple JSON objects', () => {
      // 多个 JSON 对象连在一起不是有效的 JSON，应该使用正则提取
      const output = '{"sessionId":"id1"}{"sessionId":"id2"}';
      const sessionId = extractSessionId(output);
      // 应该通过正则提取到第一个
      expect(sessionId).toBe('id1');
    });

    it('should handle mixed format output', () => {
      const output = 'Some text before [{"sessionId":"mixed-id"}] some text after';
      const sessionId = extractSessionId(output);
      expect(sessionId).toBe('mixed-id');
    });
  });
});
