/**
 * File utilities
 * Kiểm tra file size, validate, format
 */

/** Giới hạn file size mặc định (bytes) */
export const FILE_SIZE_LIMITS = {
  /** Email attachment limit (25MB) */
  EMAIL_MAX: 25 * 1024 * 1024,
  /** Cloud upload limit (5GB) */
  CLOUD_MAX: 5 * 1024 * 1024 * 1024,
} as const;

/** Các MIME types được hỗ trợ */
export const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'application/x-rar-compressed',
  'image/jpeg',
  'image/png',
  'image/gif',
  'video/mp4',
  'audio/mpeg',
] as const;

/**
 * Kiểm tra file có vượt giới hạn email attachment không
 */
export function isFileTooLargeForEmail(sizeInBytes: number): boolean {
  return sizeInBytes > FILE_SIZE_LIMITS.EMAIL_MAX;
}

/**
 * Kiểm tra file có vượt giới hạn cloud upload không
 */
export function isFileTooLargeForCloud(sizeInBytes: number): boolean {
  return sizeInBytes > FILE_SIZE_LIMITS.CLOUD_MAX;
}

/**
 * Format file size cho hiển thị
 * Ví dụ: 1024 → "1 KB", 1048576 → "1 MB"
 */
export function formatFileSize(sizeInBytes: number): string {
  if (sizeInBytes < 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = sizeInBytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  // Nếu là byte nguyên, không cần decimal
  if (unitIndex === 0) {
    return `${size} ${units[unitIndex]}`;
  }

  // Bỏ decimal nếu là số tròn
  const formatted = size % 1 === 0 ? size.toString() : size.toFixed(1);
  return `${formatted} ${units[unitIndex]}`;
}

/**
 * Lấy extension từ tên file
 */
export function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileName.length - 1) {
    return '';
  }
  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Validate file trước khi upload
 * Trả về null nếu valid, error message nếu invalid
 */
export function validateFile(
  fileName: string,
  sizeInBytes: number,
): string | null {
  if (!fileName || fileName.trim().length === 0) {
    return 'Tên file không hợp lệ';
  }

  if (sizeInBytes <= 0) {
    return 'File rỗng, không thể tải lên';
  }

  if (isFileTooLargeForCloud(sizeInBytes)) {
    return `File quá lớn (${formatFileSize(sizeInBytes)}). Giới hạn tối đa là ${formatFileSize(FILE_SIZE_LIMITS.CLOUD_MAX)}`;
  }

  return null;
}
