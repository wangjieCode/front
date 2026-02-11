import type { Logger } from 'drizzle-orm/logger';

/**
 * 统一数据库查询日志
 * - 所有通过 Drizzle 执行的 SQL 都会进入此日志
 * - 默认脱敏参数，仅输出参数数量
 */
export class DbQueryLogger implements Logger {
  private enabled: boolean;
  private includeParams: boolean;
  private maxSqlLength: number;

  constructor() {
    this.enabled = process.env.DB_QUERY_LOG_ENABLED !== '0';
    this.includeParams = process.env.DB_QUERY_LOG_PARAMS === '1';
    this.maxSqlLength = Number(process.env.DB_QUERY_LOG_MAX_LEN || 600);
  }

  logQuery(query: string, params: unknown[]): void {
    if (!this.enabled) {
      return;
    }

    const normalizedSql = query.replace(/\s+/g, ' ').trim();
    const sqlPreview = normalizedSql.length > this.maxSqlLength
      ? `${normalizedSql.slice(0, this.maxSqlLength)}...`
      : normalizedSql;

    if (this.includeParams) {
      console.log(
        `[DB][query] sql="${sqlPreview}" params=${this.safeStringify(params)}`
      );
      return;
    }

    console.log(
      `[DB][query] sql="${sqlPreview}" params_count=${params.length}`
    );
  }

  private safeStringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable]';
    }
  }
}
