/**
 * Shared Core - Public API
 * Re-export tất cả modules
 */

// Upload types
export type {
  CloudProvider,
  UploadStatus,
  FileInfo,
  UploadResult,
  UploadProgress,
  UploadOptions,
  UploadProvider,
  UploadErrorCode,
} from './upload/types.js';
export { UploadError } from './upload/types.js';

// Upload providers
export { GoogleDriveUploader } from './upload/google-drive.js';
export { OneDriveUploader } from './upload/onedrive.js';

// Upload manager
export type { UploadManagerOptions, UploadManagerResult } from './upload-manager.js';
export { UploadManager } from './upload-manager.js';

// Auth types
export type {
  AuthProvider,
  AuthToken,
  AuthState,
  AuthHandler,
} from './auth/types.js';
export { isTokenValid } from './auth/types.js';

// File utilities
export {
  FILE_SIZE_LIMITS,
  SUPPORTED_MIME_TYPES,
  isFileTooLargeForEmail,
  isFileTooLargeForCloud,
  formatFileSize,
  getFileExtension,
  validateFile,
} from './file-utils.js';

// Link formatter
export type { LinkFormatOptions } from './link-formatter.js';
export { formatLinkHtml, formatLinkPlainText } from './link-formatter.js';

// Progress tracker
export type {
  ProgressEventType,
  ProgressEventHandler,
  ProgressEventData,
} from './progress-tracker.js';
export { ProgressTracker } from './progress-tracker.js';
