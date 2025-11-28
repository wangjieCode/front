import { MessageMetadata } from '../types';

/**
 * 消息解析工具类
 * 负责解析消息中的引用、代码块等
 */
export class MessageParser {
  /**
   * 解析消息中的文件引用
   * 格式: @file:path/to/file.ts
   */
  static parseFileReferences(content: string): string[] {
    const filePattern = /@file:([^\s]+)/g;
    const matches = content.matchAll(filePattern);
    const files: string[] = [];

    for (const match of matches) {
      files.push(match[1]);
    }

    return files;
  }

  /**
   * 解析消息中的消息引用
   * 格式: @msg:messageId
   */
  static parseMessageReferences(content: string): string[] {
    const msgPattern = /@msg:([a-f0-9-]+)/g;
    const matches = content.matchAll(msgPattern);
    const messageIds: string[] = [];

    for (const match of matches) {
      messageIds.push(match[1]);
    }

    return messageIds;
  }

  /**
   * 解析消息中的代码块
   * 格式: ```language\ncode\n```
   */
  static parseCodeBlocks(content: string): Array<{
    language: string;
    code: string;
  }> {
    const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
    const matches = content.matchAll(codeBlockPattern);
    const codeBlocks: Array<{ language: string; code: string }> = [];

    for (const match of matches) {
      codeBlocks.push({
        language: match[1] || 'text',
        code: match[2].trim(),
      });
    }

    return codeBlocks;
  }

  /**
   * 解析消息中的所有引用
   */
  static parseReferences(content: string): {
    files: string[];
    messages: string[];
    codeBlocks: Array<{ language: string; code: string }>;
  } {
    return {
      files: this.parseFileReferences(content),
      messages: this.parseMessageReferences(content),
      codeBlocks: this.parseCodeBlocks(content),
    };
  }

  /**
   * 将引用信息添加到元数据
   */
  static enrichMetadata(
    content: string,
    metadata: MessageMetadata = {}
  ): MessageMetadata {
    const references = this.parseReferences(content);

    // 合并文件和消息引用
    const allReferences = [
      ...references.files.map(f => `file:${f}`),
      ...references.messages.map(m => `msg:${m}`),
    ];

    if (allReferences.length > 0) {
      metadata.references = allReferences;
    }

    return metadata;
  }

  /**
   * 标记代码变更为已失效
   */
  static markCodeChangeAsInvalid(metadata: MessageMetadata): MessageMetadata {
    return {
      ...metadata,
      isInvalid: true,
    };
  }

  /**
   * 检查消息是否包含代码变更引用
   */
  static hasCodeChangeReference(metadata?: MessageMetadata): boolean {
    if (!metadata || !metadata.codeChanges) {
      return false;
    }
    return metadata.codeChanges.length > 0;
  }

  /**
   * 提取消息中提到的文件路径(不使用特殊语法)
   * 尝试识别常见的文件路径模式
   */
  static extractFilePaths(content: string): string[] {
    const paths: string[] = [];

    // 匹配常见的文件路径模式
    const patterns = [
      // 相对路径: ./path/to/file.ts, ../path/to/file.ts
      /\.\.?\/[\w\-./]+\.\w+/g,
      // 绝对路径: /path/to/file.ts
      /\/[\w\-./]+\.\w+/g,
      // 简单文件名: filename.ts
      /\b[\w\-]+\.\w{2,4}\b/g,
    ];

    for (const pattern of patterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        const path = match[0];
        // 过滤掉一些常见的误匹配
        if (!path.includes('http') && !path.includes('www.')) {
          paths.push(path);
        }
      }
    }

    // 去重
    return [...new Set(paths)];
  }

  /**
   * 格式化消息用于显示
   * 将引用转换为可点击的链接(前端使用)
   */
  static formatForDisplay(content: string): string {
    let formatted = content;

    // 替换文件引用
    formatted = formatted.replace(
      /@file:([^\s]+)/g,
      '<span class="file-ref" data-file="$1">📄 $1</span>'
    );

    // 替换消息引用
    formatted = formatted.replace(
      /@msg:([a-f0-9-]+)/g,
      '<span class="msg-ref" data-msg-id="$1">💬 消息</span>'
    );

    return formatted;
  }

  /**
   * 清理消息内容
   * 移除多余的空白、规范化换行等
   */
  static cleanContent(content: string): string {
    return content
      .trim()
      .replace(/\r\n/g, '\n') // 统一换行符
      .replace(/\n{3,}/g, '\n\n'); // 最多保留两个连续换行
  }

  /**
   * 检查消息是否为空或只包含空白
   */
  static isEmpty(content: string): boolean {
    return content.trim().length === 0;
  }

  /**
   * 截断过长的消息(用于预览)
   */
  static truncate(content: string, maxLength: number = 100): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength) + '...';
  }

  /**
   * 提取消息摘要(第一行或前N个字符)
   */
  static extractSummary(content: string, maxLength: number = 50): string {
    const firstLine = content.split('\n')[0];
    return this.truncate(firstLine, maxLength);
  }
}
