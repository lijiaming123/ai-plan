import { describe, expect, it } from 'vitest';
import {
  formatApiErrorForUser,
  formatHttpApiUserMessage,
  looksLikeDatabaseConnectivityIssue,
} from '../src/lib/api-error-message';

describe('api-error-message', () => {
  it('应识别数据库不可达类英文详情', () => {
    expect(
      looksLikeDatabaseConnectivityIssue(
        "Can't reach database server at `localhost:5432`",
      ),
    ).toBe(true);
  });

  it('formatHttpApiUserMessage 应对数据库错误返回中文且不包含路径', () => {
    const zh = formatHttpApiUserMessage(
      500,
      "Invalid `prisma.plan.findMany()` invocation ... Can't reach database server at 'localhost:5432'",
    );
    expect(zh).toContain('数据库');
    expect(zh).not.toMatch(/prisma|localhost|5432/i);
  });

  it('formatHttpApiUserMessage 应对常见状态码返回固定中文', () => {
    expect(formatHttpApiUserMessage(400, 'bad')).toBe('请求参数有误，请检查后重试。');
    expect(formatHttpApiUserMessage(401, '')).toBe('登录已失效，请重新登录。');
    expect(formatHttpApiUserMessage(404, '')).toBe('请求的资源不存在。');
    expect(formatHttpApiUserMessage(409, '')).toBe('资源状态已变更或发生冲突，请刷新后重试。');
  });

  it('formatHttpApiUserMessage 应透传后端中文 message', () => {
    expect(formatHttpApiUserMessage(400, '标题不能为空')).toBe('标题不能为空');
  });

  it('formatApiErrorForUser 应解析历史 Request failed 文案', () => {
    expect(formatApiErrorForUser(new Error('Request failed: 400 - x'))).toBe(
      '请求参数有误，请检查后重试。',
    );
  });

  it('formatApiErrorForUser 应处理网络类错误', () => {
    expect(formatApiErrorForUser(new Error('Failed to fetch'))).toContain('网络');
  });

  it('formatApiErrorForUser 对空字符串应返回空', () => {
    expect(formatApiErrorForUser('')).toBe('');
  });
});
