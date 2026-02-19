import { describe, it, expect } from 'vitest';
import { formatLinkHtml, formatLinkPlainText } from '../src/link-formatter.js';
import type { LinkFormatOptions } from '../src/link-formatter.js';

const sampleOptions: LinkFormatOptions = {
  fileName: 'bao_cao_2026.pdf',
  fileSize: 48 * 1024 * 1024,
  shareLink: 'https://drive.google.com/file/d/abc123/view',
  provider: 'google-drive',
};

describe('formatLinkHtml', () => {
  it('chứa tên file', () => {
    const html = formatLinkHtml(sampleOptions);
    expect(html).toContain('bao_cao_2026.pdf');
  });

  it('chứa dung lượng đã format', () => {
    const html = formatLinkHtml(sampleOptions);
    expect(html).toContain('48 MB');
  });

  it('chứa share link', () => {
    const html = formatLinkHtml(sampleOptions);
    expect(html).toContain('https://drive.google.com/file/d/abc123/view');
  });

  it('chứa tên provider Google Drive', () => {
    const html = formatLinkHtml(sampleOptions);
    expect(html).toContain('Google Drive');
  });

  it('chứa tên provider OneDrive', () => {
    const html = formatLinkHtml({
      ...sampleOptions,
      provider: 'onedrive',
      shareLink: 'https://onedrive.live.com/xxx',
    });
    expect(html).toContain('OneDrive');
  });

  it('escape HTML trong tên file', () => {
    const html = formatLinkHtml({
      ...sampleOptions,
      fileName: '<script>alert("xss")</script>.pdf',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('chứa inline styles (email compatible)', () => {
    const html = formatLinkHtml(sampleOptions);
    expect(html).toContain('style="');
  });

  it('có emoji icons', () => {
    const html = formatLinkHtml(sampleOptions);
    expect(html).toContain('📎');
    expect(html).toContain('🔗');
  });
});

describe('formatLinkPlainText', () => {
  it('chứa tên file và dung lượng', () => {
    const text = formatLinkPlainText(sampleOptions);
    expect(text).toContain('bao_cao_2026.pdf');
    expect(text).toContain('48 MB');
  });

  it('chứa share link', () => {
    const text = formatLinkPlainText(sampleOptions);
    expect(text).toContain('https://drive.google.com/file/d/abc123/view');
  });

  it('có emoji icons', () => {
    const text = formatLinkPlainText(sampleOptions);
    expect(text).toContain('📎');
    expect(text).toContain('🔗');
  });
});
