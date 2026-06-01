/**
 * 将 HTTP 状态与接口返回的原始说明转换为用户可读的中文提示（不暴露堆栈与路径）。
 */

const DB_MARKERS = [
  /can't reach database server/i,
  /database server at/i,
  /P1001/i,
  /P1000/i,
  /prisma\./i,
  /prismaclient/i,
  /connection refused/i,
  /ECONNREFUSED/i,
];

export function looksLikeDatabaseConnectivityIssue(detail: string): boolean {
  return DB_MARKERS.some((re) => re.test(detail));
}

function isLikelyBackendUserMessage(detail: string): boolean {
  const t = detail.trim();
  if (!t || t.length > 240) return false;
  if (/Invalid\s+['']?[\w.]+['']?\s+invocation|\.ts:\d+|\\\\|\bprisma\./i.test(t)) return false;
  // 中文短提示：直接透传
  if (/[\u4e00-\u9fff]/.test(t)) return true;

  // 英文短提示：仅对白名单类型透传（避免把无意义的 "bad"/"x" 直接展示给用户）
  // 常见来源：Zod 校验错误、payload 字段检查等。
  if (
    /^(Expected\b|Invalid\b|must\b|should\b|required\b|cannot\b|can not\b)/i.test(t) ||
    // 更具体的字段路径/结构化提示才透传；避免 "bad payload" 这类无信息文案
    /\b(planId|content|deadline|goal|requirement|tags|category)\b/i.test(t) ||
    /\b(payload\.[\w.]+)\b/i.test(t)
  ) {
    return true;
  }

  return false;
}

export function formatHttpApiUserMessage(status: number, detail: string): string {
  const d = (detail ?? '').trim();
  if (looksLikeDatabaseConnectivityIssue(d)) {
    return '服务暂时不可用，请稍后再试；如果反复失败，可以刷新页面后重试。';
  }
  if (isLikelyBackendUserMessage(d)) {
    if (status >= 400 && status < 500) return d;
    if (status >= 500) return `服务遇到点问题：${d}`;
    return d;
  }
  switch (status) {
    case 400:
      return '提交的信息有点问题，请检查后再试。';
    case 401:
      return '登录状态已过期，请重新登录。';
    case 403:
      return '暂时无法执行这个操作。';
    case 404:
      return '请求的资源不存在。';
    case 409:
      return '内容已更新或发生冲突，请刷新后重试。';
    case 413:
      return '上传的文件过大，请更换较小的文件后重试。';
    case 422:
      return '有些内容还不符合要求，请检查后再试。';
    case 429:
      return '请求过于频繁，请稍后再试。';
    case 502:
    case 503:
    case 504:
      return '服务暂时不可用，请稍后再试。';
    default:
      if (status >= 500) return '服务出现异常，请稍后再试。';
      if (status >= 400) return '请求未能完成，请稍后重试。';
      return '操作失败，请稍后重试。';
  }
}

/** 兼容历史 `Request failed: {status} - {detail}` 文案，以及已为中文的 Error.message */
export function formatApiErrorForUser(err: unknown): string {
  const msg =
    err instanceof Error ? err.message : err == null ? '' : String(err);
  if (!msg.trim()) return '';

  const m = msg.match(/^Request failed:\s*(\d+)(?:\s*-\s*([\s\S]*))?$/);
  if (m) {
    const status = Number(m[1]);
    const detail = (m[2] ?? '').trim();
    return formatHttpApiUserMessage(status, detail);
  }
  if (/failed to fetch|networkerror|network request failed|load failed|fetch.*aborted/i.test(msg)) {
    return '网络连接失败，请检查网络或服务地址后重试。';
  }
  const bareHttp = msg.match(/^HTTP\s+(\d{3})$/);
  if (bareHttp) {
    return formatHttpApiUserMessage(Number(bareHttp[1]), '');
  }
  if (/[\u4e00-\u9fff]/.test(msg)) return msg;
  return '操作失败，请稍后重试。';
}
