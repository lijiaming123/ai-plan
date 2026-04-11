import DOMPurify from 'dompurify';
import MarkdownIt from 'markdown-it';

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
});

/** 将 Markdown 转为可安全用于 v-html 的 HTML（禁止原始 HTML 注入） */
export function renderMarkdownToHtml(src: string): string {
  if (!src?.trim()) return '';
  const dirty = md.render(src);
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      'p',
      'br',
      'strong',
      'em',
      'b',
      'i',
      'ul',
      'ol',
      'li',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'blockquote',
      'code',
      'pre',
      'a',
      'hr',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  });
}
