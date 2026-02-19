/**
 * Google Drive Resumable Upload
 * Upload file lớn lên Google Drive qua REST API v3
 * Sử dụng resumable upload protocol cho file > 5MB
 */

import type {
  FileInfo,
  UploadOptions,
  UploadResult,
  UploadProvider,
} from './types.js';
import { UploadError } from './types.js';

/** Default chunk size: 4MB (phải là bội số của 256KB) */
const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

/** Max retry attempts */
const MAX_RETRIES = 3;

/** Google Drive API base URL */
const DRIVE_API_BASE = 'https://www.googleapis.com/upload/drive/v3/files';
const DRIVE_API_FILES = 'https://www.googleapis.com/drive/v3/files';

/**
 * Google Drive Upload Provider
 * Implements resumable upload protocol
 */
export class GoogleDriveUploader implements UploadProvider {
  /**
   * Upload file lên Google Drive
   */
  async upload(file: FileInfo, options: UploadOptions): Promise<UploadResult> {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

    // Bước 1: Khởi tạo resumable upload session
    const sessionUri = await this.initiateUpload(file, options.accessToken);

    // Bước 2: Upload file theo chunks
    const fileId = await this.uploadChunks(
      sessionUri,
      file,
      chunkSize,
      options,
    );

    // Bước 3: Set sharing permission
    const shareLink = await this.setPermission(fileId, options.accessToken);

    return {
      provider: 'google-drive',
      fileId,
      shareLink,
      fileName: file.name,
      fileSize: file.size,
    };
  }

  /**
   * Bước 1: Khởi tạo resumable upload session
   * POST tới Google Drive API, nhận lại session URI
   */
  private async initiateUpload(
    file: FileInfo,
    accessToken: string,
  ): Promise<string> {
    const metadata = {
      name: file.name,
      mimeType: file.mimeType,
    };

    const response = await fetch(
      `${DRIVE_API_BASE}?uploadType=resumable`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Upload-Content-Type': file.mimeType,
          'X-Upload-Content-Length': file.size.toString(),
        },
        body: JSON.stringify(metadata),
      },
    );

    if (response.status === 401) {
      throw new UploadError(
        'Token đã hết hạn, vui lòng đăng nhập lại',
        'AUTH_EXPIRED',
        false,
      );
    }

    if (response.status === 403) {
      throw new UploadError(
        'Không có quyền upload lên Google Drive',
        'PERMISSION_DENIED',
        false,
      );
    }

    if (response.status === 507 || response.status === 413) {
      throw new UploadError(
        'Bộ nhớ Google Drive đầy, vui lòng giải phóng dung lượng',
        'STORAGE_FULL',
        false,
      );
    }

    if (!response.ok) {
      throw new UploadError(
        `Lỗi khi khởi tạo upload: ${response.status}`,
        'UNKNOWN',
        true,
      );
    }

    const sessionUri = response.headers.get('Location');
    if (!sessionUri) {
      throw new UploadError(
        'Không nhận được session URI từ Google Drive',
        'UNKNOWN',
        false,
      );
    }

    return sessionUri;
  }

  /**
   * Bước 2: Upload file data theo chunks
   * Hỗ trợ resumable - nếu lỗi mạng sẽ retry từ chunk cuối
   */
  private async uploadChunks(
    sessionUri: string,
    file: FileInfo,
    chunkSize: number,
    options: UploadOptions,
  ): Promise<string> {
    const fileData = file.data instanceof Blob
      ? await file.data.arrayBuffer()
      : file.data;

    const totalSize = fileData.byteLength;
    let offset = 0;

    // Report initial status
    options.onProgress?.({
      bytesUploaded: 0,
      totalBytes: totalSize,
      percentage: 0,
      status: 'uploading',
    });

    while (offset < totalSize) {
      // Check if upload was aborted
      if (options.signal?.aborted) {
        throw new UploadError('Upload đã bị hủy', 'UNKNOWN', false);
      }

      const end = Math.min(offset + chunkSize, totalSize);
      const chunk = fileData.slice(offset, end);
      const isLastChunk = end === totalSize;

      let retries = 0;
      let success = false;

      while (retries < MAX_RETRIES && !success) {
        try {
          const response = await fetch(sessionUri, {
            method: 'PUT',
            headers: {
              'Content-Length': chunk.byteLength.toString(),
              'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
            },
            body: chunk,
            signal: options.signal,
          });

          if (response.status === 308) {
            // Chunk uploaded, chưa xong → tiếp tục
            success = true;
          } else if (response.status === 200 || response.status === 201) {
            // Upload hoàn tất
            const result = await response.json();
            options.onProgress?.({
              bytesUploaded: totalSize,
              totalBytes: totalSize,
              percentage: 100,
              status: 'completed',
            });
            return result.id as string;
          } else if (response.status === 401) {
            throw new UploadError(
              'Token đã hết hạn, vui lòng đăng nhập lại',
              'AUTH_EXPIRED',
              false,
            );
          } else if (response.status >= 500) {
            // Server error → retry
            retries++;
            if (retries >= MAX_RETRIES) {
              throw new UploadError(
                'Lỗi server Google Drive, vui lòng thử lại',
                'NETWORK_ERROR',
                true,
              );
            }
            // Exponential backoff
            await this.delay(Math.pow(2, retries) * 1000);
          } else {
            throw new UploadError(
              `Lỗi upload: ${response.status}`,
              'UNKNOWN',
              true,
            );
          }
        } catch (error) {
          if (error instanceof UploadError) throw error;

          retries++;
          if (retries >= MAX_RETRIES) {
            throw new UploadError(
              'Mạng bị ngắt, vui lòng kiểm tra kết nối',
              'NETWORK_ERROR',
              true,
            );
          }
          await this.delay(Math.pow(2, retries) * 1000);
        }
      }

      offset = end;

      // Report progress
      const percentage = Math.round((offset / totalSize) * 100);
      options.onProgress?.({
        bytesUploaded: offset,
        totalBytes: totalSize,
        percentage,
        status: 'uploading',
      });
    }

    throw new UploadError('Upload không hoàn tất', 'UNKNOWN', true);
  }

  /**
   * Bước 3: Set sharing permission
   * "Anyone with link can view"
   */
  async setPermission(fileId: string, accessToken: string): Promise<string> {
    // Tạo permission "anyone with link"
    const permResponse = await fetch(
      `${DRIVE_API_FILES}/${fileId}/permissions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          role: 'reader',
          type: 'anyone',
        }),
      },
    );

    if (!permResponse.ok) {
      throw new UploadError(
        'Không thể set quyền chia sẻ file',
        'PERMISSION_DENIED',
        true,
      );
    }

    // Lấy share link
    const fileResponse = await fetch(
      `${DRIVE_API_FILES}/${fileId}?fields=webViewLink`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      },
    );

    if (!fileResponse.ok) {
      // Fallback link format
      return `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
    }

    const fileData = await fileResponse.json();
    return (fileData.webViewLink as string) ||
      `https://drive.google.com/file/d/${fileId}/view?usp=sharing`;
  }

  /** Helper: delay cho exponential backoff */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
