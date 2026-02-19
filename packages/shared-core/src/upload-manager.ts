/**
 * Upload Manager
 * Orchestrator kết nối auth + upload + progress + link formatting
 * Entry point chính mà extension/add-in sẽ gọi
 */

import type {
  FileInfo,
  UploadResult,
  UploadProgress,
  CloudProvider,
} from './upload/types.js';
import { UploadError } from './upload/types.js';
import { GoogleDriveUploader } from './upload/google-drive.js';
import { OneDriveUploader } from './upload/onedrive.js';
import { isFileTooLargeForEmail, isFileTooLargeForCloud, validateFile } from './file-utils.js';
import { formatLinkHtml, formatLinkPlainText } from './link-formatter.js';
import { ProgressTracker } from './progress-tracker.js';

/** Options cho upload manager */
export interface UploadManagerOptions {
  /** Cloud provider */
  provider: CloudProvider;
  /** Access token */
  accessToken: string;
  /** Progress callback */
  onProgress?: (progress: UploadProgress) => void;
  /** AbortSignal */
  signal?: AbortSignal;
}

/** Kết quả đầy đủ sau upload */
export interface UploadManagerResult {
  /** Upload result */
  upload: UploadResult;
  /** HTML link chèn vào email */
  linkHtml: string;
  /** Plain text link (fallback) */
  linkText: string;
}

/**
 * Upload Manager - Façade pattern
 * Kết nối tất cả modules lại với nhau
 */
export class UploadManager {
  private googleUploader = new GoogleDriveUploader();
  private onedriveUploader = new OneDriveUploader();

  /**
   * Kiểm tra file có cần upload lên cloud không
   */
  needsCloudUpload(fileSize: number): boolean {
    return isFileTooLargeForEmail(fileSize);
  }

  /**
   * Upload file và trả về link đã format
   * Entry point chính
   */
  async uploadAndFormat(
    file: FileInfo,
    options: UploadManagerOptions,
  ): Promise<UploadManagerResult> {
    // Validate file
    const validationError = validateFile(file.name, file.size);
    if (validationError) {
      throw new UploadError(validationError, 'FILE_TOO_LARGE', false);
    }

    if (isFileTooLargeForCloud(file.size)) {
      throw new UploadError(
        'File quá lớn, giới hạn tối đa là 5GB',
        'FILE_TOO_LARGE',
        false,
      );
    }

    // Setup progress tracker
    const tracker = new ProgressTracker(file.size);
    if (options.onProgress) {
      tracker.on('progress', (data) => options.onProgress!(data.progress));
    }

    // Chọn uploader theo provider
    const uploader = options.provider === 'google-drive'
      ? this.googleUploader
      : this.onedriveUploader;

    // Upload
    tracker.updateStatus('uploading');
    const uploadResult = await uploader.upload(file, {
      accessToken: options.accessToken,
      onProgress: options.onProgress,
      signal: options.signal,
    });

    // Format links
    tracker.updateStatus('completed');
    const linkOptions = {
      fileName: uploadResult.fileName,
      fileSize: uploadResult.fileSize,
      shareLink: uploadResult.shareLink,
      provider: options.provider,
    };

    return {
      upload: uploadResult,
      linkHtml: formatLinkHtml(linkOptions),
      linkText: formatLinkPlainText(linkOptions),
    };
  }
}
