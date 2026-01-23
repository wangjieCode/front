import { LogEntry, LogLevel } from '../types';
import dayjs from 'dayjs';

/**
 * 创建日志条目
 * @param level 日志级别
 * @param source 日志来源
 * @param message 日志消息
 * @returns 日志条目对象
 */
export function createLogEntry(
  level: LogLevel,
  source: string,
  message: string
): LogEntry {
  return {
    timestamp: dayjs().toDate(),
    level,
    source,
    message,
  };
}

/**
 * 创建信息级别日志
 * @param source 日志来源
 * @param message 日志消息
 * @returns 日志条目对象
 */
export function createInfoLog(source: string, message: string): LogEntry {
  return createLogEntry(LogLevel.INFO, source, message);
}

/**
 * 创建错误级别日志
 * @param source 日志来源
 * @param message 日志消息
 * @returns 日志条目对象
 */
export function createErrorLog(source: string, message: string): LogEntry {
  return createLogEntry(LogLevel.ERROR, source, message);
}

/**
 * 格式化日志消息用于显示
 * @param log 日志条目
 * @returns 格式化后的日志字符串
 */
export function formatLogEntry(log: LogEntry): string {
  const timestamp = dayjs(log.timestamp).toISOString();
  const level = log.level.toUpperCase().padEnd(5);
  return `[${timestamp}] [${level}] [${log.source}] ${log.message}`;
}
