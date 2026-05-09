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

  it('formatHttpApiUserMessage 应对数据库错误返回用户可读中文且不暴露技术细节', () => {
    const zh = formatHttpApiUserMessage(
      500,
      "Invalid `prisma.plan.findMany()` invocation ... Can't reach database server at 'localhost:5432'",
    );
    expect(zh).toContain('服务暂时不可用');
    expect(zh).not.toMatch(/prisma|localhost|5432|数据库/i);
  });

  it('formatHttpApiUserMessage 应对常见状态码返回固定中文', () => {
    expect(formatHttpApiUserMessage(400, 'bad')).toBe('提交的信息有点问题，请检查后再试。');
    expect(formatHttpApiUserMessage(401, '')).toBe('登录状态已过期，请重新登录。');
    expect(formatHttpApiUserMessage(404, '')).toBe('请求的资源不存在。');
    expect(formatHttpApiUserMessage(409, '')).toBe('内容已更新或发生冲突，请刷新后重试。');
  });

  it('formatHttpApiUserMessage 应透传后端中文 message', () => {
    expect(formatHttpApiUserMessage(400, '标题不能为空')).toBe('标题不能为空');
  });

  it('formatApiErrorForUser 应解析历史 Request failed 文案', () => {
    expect(formatApiErrorForUser(new Error('Request failed: 400 - x'))).toBe(
      '提交的信息有点问题，请检查后再试。',
    );
  });

  it('formatApiErrorForUser 应处理网络类错误', () => {
    expect(formatApiErrorForUser(new Error('Failed to fetch'))).toContain('网络');
  });

  it('formatApiErrorForUser 对空字符串应返回空', () => {
    expect(formatApiErrorForUser('')).toBe('');
  });
});
