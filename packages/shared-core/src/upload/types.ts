/**
 * Upload types & interfaces
 * Định nghĩa shared types cho upload module
 */

/** Cloud provider được hỗ trợ */
export type CloudProvider = 'google-drive' | 'onedrive';

/** Trạng thái upload */
export type UploadStatus =
  | 'pending'
  | 'uploading'
  | 'setting-permissions'
  | 'completed'
  | 'failed';

/** Thông tin file cần upload */
export interface FileInfo {
  /** Tên file gốc (vd: "bao_cao.pdf") */
  name: string;
  /** Dung lượng file (bytes) */
  size: number;
  /** MIME type (vd: "application/pdf") */
  mimeType: string;
  /** File data */
  data: ArrayBuffer | Blob;
}

/** Kết quả upload thành công */
export interface UploadResult {
  /** Cloud provider đã upload */
  provider: CloudProvider;
  /** ID file trên cloud */
  fileId: string;
  /** Link chia sẻ */
  shareLink: string;
  /** Tên file */
  fileName: string;
  /** Dung lượng (bytes) */
  fileSize: number;
}

/** Progress event khi đang upload */
export interface UploadProgress {
  /** Số bytes đã upload */
  bytesUploaded: number;
  /** Tổng số bytes */
  totalBytes: number;
  /** Phần trăm 0-100 */
  percentage: number;
  /** Trạng thái hiện tại */
  status: UploadStatus;
}

/** Options cho upload */
export interface UploadOptions {
  /** OAuth access token */
  accessToken: string;
  /** Chunk size cho resumable upload (mặc định 256KB * 16 = 4MB) */
  chunkSize?: number;
  /** Callback khi progress thay đổi */
  onProgress?: (progress: UploadProgress) => void;
  /** AbortSignal để hủy upload */
  signal?: AbortSignal;
}

/** Interface cho upload provider */
export interface UploadProvider {
  /** Upload file lên cloud */
  upload(file: FileInfo, options: UploadOptions): Promise<UploadResult>;
  /** Set sharing permission */
  setPermission(fileId: string, accessToken: string, permissionType?: 'view' | 'edit'): Promise<string>;
}

/** Error types cho upload */
export class UploadError extends Error {
  constructor(
    message: string,
    public readonly code: UploadErrorCode,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = 'UploadError';
  }
}

export type UploadErrorCode =
  | 'AUTH_EXPIRED'
  | 'AUTH_REQUIRED'
  | 'NETWORK_ERROR'
  | 'STORAGE_FULL'
  | 'FILE_TOO_LARGE'
  | 'PERMISSION_DENIED'
  | 'UNKNOWN';
