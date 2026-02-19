import { describe, it, expect } from 'vitest';
import {
  isFileTooLargeForEmail,
  isFileTooLargeForCloud,
  formatFileSize,
  getFileExtension,
  validateFile,
  FILE_SIZE_LIMITS,
} from '../src/file-utils.js';

describe('isFileTooLargeForEmail', () => {
  it('trả về false khi file < 25MB', () => {
    expect(isFileTooLargeForEmail(10 * 1024 * 1024)).toBe(false);
  });

  it('trả về false khi file đúng 25MB', () => {
    expect(isFileTooLargeForEmail(FILE_SIZE_LIMITS.EMAIL_MAX)).toBe(false);
  });

  it('trả về true khi file > 25MB', () => {
    expect(isFileTooLargeForEmail(26 * 1024 * 1024)).toBe(true);
  });

  it('trả về false khi file = 0', () => {
    expect(isFileTooLargeForEmail(0)).toBe(false);
  });
});

describe('isFileTooLargeForCloud', () => {
  it('trả về false khi file < 5GB', () => {
    expect(isFileTooLargeForCloud(1 * 1024 * 1024 * 1024)).toBe(false);
  });

  it('trả về true khi file > 5GB', () => {
    expect(isFileTooLargeForCloud(6 * 1024 * 1024 * 1024)).toBe(true);
  });
});

describe('formatFileSize', () => {
  it('format bytes', () => {
    expect(formatFileSize(500)).toBe('500 B');
  });

  it('format kilobytes', () => {
    expect(formatFileSize(1024)).toBe('1 KB');
  });

  it('format megabytes', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1 MB');
  });

  it('format với decimal', () => {
    expect(formatFileSize(1536 * 1024)).toBe('1.5 MB');
  });

  it('format gigabytes', () => {
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
  });

  it('format 48MB (use case phổ biến)', () => {
    expect(formatFileSize(48 * 1024 * 1024)).toBe('48 MB');
  });

  it('trả về "0 B" khi size < 0', () => {
    expect(formatFileSize(-1)).toBe('0 B');
  });
});

describe('getFileExtension', () => {
  it('lấy extension PDF', () => {
    expect(getFileExtension('bao_cao.pdf')).toBe('pdf');
  });

  it('lấy extension DOCX', () => {
    expect(getFileExtension('document.docx')).toBe('docx');
  });

  it('trả về rỗng khi không có extension', () => {
    expect(getFileExtension('noextension')).toBe('');
  });

  it('trả về rỗng khi file kết thúc bằng dot', () => {
    expect(getFileExtension('file.')).toBe('');
  });

  it('xử lý nhiều dots', () => {
    expect(getFileExtension('my.file.name.pdf')).toBe('pdf');
  });

  it('trả về lowercase', () => {
    expect(getFileExtension('FILE.PDF')).toBe('pdf');
  });
});

describe('validateFile', () => {
  it('trả về null khi file hợp lệ', () => {
    expect(validateFile('bao_cao.pdf', 10 * 1024 * 1024)).toBeNull();
  });

  it('trả về lỗi khi tên file rỗng', () => {
    expect(validateFile('', 1024)).not.toBeNull();
    expect(validateFile('   ', 1024)).not.toBeNull();
  });

  it('trả về lỗi khi file rỗng (0 bytes)', () => {
    expect(validateFile('test.pdf', 0)).not.toBeNull();
  });

  it('trả về lỗi khi file quá lớn (> 5GB)', () => {
    const result = validateFile('huge.pdf', 6 * 1024 * 1024 * 1024);
    expect(result).not.toBeNull();
    expect(result).toContain('quá lớn');
  });
});
