/**
 * 与「对象存储」相关的最小工具集。
 *
 * 当前仓库未接 S3/OSS：提交接口只接收客户端可访问的图片 URL，库内用 hashUrl 生成确定性指纹。
 * 若未来同一 URL 内容变更，哈希不变——需要内容寻址时应改为下载后 hash 文件体。
 */
import { createHash } from 'node:crypto';

/** 对整段 URL 字符串做 SHA256 hex，用作 TaskSubmissionImage.hash */
export function hashUrl(url: string) {
  return createHash('sha256').update(url).digest('hex');
}
