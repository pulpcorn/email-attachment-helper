/**
 * Link Formatter
 * Tạo HTML link đẹp chèn vào email body
 * Thiết kế cho người cao tuổi: chữ lớn, icon rõ ràng
 */

import { formatFileSize } from './file-utils.js';
import type { CloudProvider } from './upload/types.js';

/** Options cho link formatter */
export interface LinkFormatOptions {
  /** Tên file */
  fileName: string;
  /** Dung lượng file (bytes) */
  fileSize: number;
  /** Link chia sẻ */
  shareLink: string;
  /** Cloud provider */
  provider: CloudProvider;
}

/**
 * Tạo HTML link chèn vào email body
 * Format thân thiện với người cao tuổi
 */
export function formatLinkHtml(options: LinkFormatOptions): string {
  const { fileName, fileSize, shareLink, provider } = options;
  const sizeFormatted = formatFileSize(fileSize);
  const providerName = provider === 'google-drive' ? 'Google Drive' : 'OneDrive';

  return `
<div style="
  border: 2px solid #1a73e8;
  border-radius: 12px;
  padding: 16px 20px;
  margin: 12px 0;
  font-family: Arial, sans-serif;
  background-color: #f8f9fa;
  max-width: 500px;
">
  <p style="margin: 0 0 8px 0; font-size: 16px; color: #333;">
    📎 <strong>File đính kèm:</strong> ${escapeHtml(fileName)} (${sizeFormatted})
  </p>
  <p style="margin: 0; font-size: 16px;">
    🔗 <a href="${escapeHtml(shareLink)}" style="
      color: #1a73e8;
      text-decoration: underline;
      font-weight: bold;
    ">Nhấn vào đây để tải file</a>
  </p>
  <p style="margin: 8px 0 0 0; font-size: 12px; color: #888;">
    Lưu trữ trên ${providerName}
  </p>
</div>`.trim();
}

/**
 * Tạo plain text link (fallback khi không hỗ trợ HTML)
 */
export function formatLinkPlainText(options: LinkFormatOptions): string {
  const { fileName, fileSize, shareLink } = options;
  const sizeFormatted = formatFileSize(fileSize);

  return [
    `📎 File đính kèm: ${fileName} (${sizeFormatted})`,
    `🔗 Nhấn vào đây để tải: ${shareLink}`,
  ].join('\n');
}

/**
 * Escape HTML để tránh XSS
 */
function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (char) => htmlEscapes[char] || char);
}
