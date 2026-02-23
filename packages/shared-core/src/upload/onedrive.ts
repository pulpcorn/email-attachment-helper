/**
 * OneDrive Upload via Microsoft Graph API
 * Resumable upload cho file lớn (> 4MB)
 */

import type {
  FileInfo,
  UploadOptions,
  UploadResult,
  UploadProvider,
} from './types.js';
import { UploadError } from './types.js';

/** Default chunk size: 4MB (phải là bội số của 320KB cho OneDrive) */
const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024;

/** Max retry attempts */
const MAX_RETRIES = 3;

/** Microsoft Graph API base URL */
const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';

/**
 * OneDrive Upload Provider
 * Sử dụng Microsoft Graph API upload session
 */
export class OneDriveUploader implements UploadProvider {
  /**
   * Upload file lên OneDrive
   */
  async upload(file: FileInfo, options: UploadOptions): Promise<UploadResult> {
    const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;

    // Bước 1: Tạo upload session
    const sessionUrl = await this.createUploadSession(file, options.accessToken);

    // Bước 2: Upload file theo chunks
    const driveItem = await this.uploadChunks(
      sessionUrl,
      file,
      chunkSize,
      options,
    );

    // Bước 3: Tạo sharing link
    const shareLink = await this.setPermission(driveItem.id, options.accessToken);

    return {
      provider: 'onedrive',
      fileId: driveItem.id,
      shareLink,
      fileName: file.name,
      fileSize: file.size,
    };
  }

  /**
   * Bước 1: Tạo upload session
   */
  private async createUploadSession(
    file: FileInfo,
    accessToken: string,
  ): Promise<string> {
    const response = await fetch(
      `${GRAPH_API_BASE}/me/drive/root:/${encodeURIComponent(file.name)}:/createUploadSession`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          item: {
            '@microsoft.graph.conflictBehavior': 'rename',
            name: file.name,
          },
        }),
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
        'Không có quyền upload lên OneDrive',
        'PERMISSION_DENIED',
        false,
      );
    }

    if (response.status === 507) {
      throw new UploadError(
        'Bộ nhớ OneDrive đầy, vui lòng giải phóng dung lượng',
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

    const data = await response.json();
    return data.uploadUrl as string;
  }

  /**
   * Bước 2: Upload file data theo chunks
   */
  private async uploadChunks(
    sessionUrl: string,
    file: FileInfo,
    chunkSize: number,
    options: UploadOptions,
  ): Promise<{ id: string }> {
    const fileData = file.data instanceof Blob
      ? await file.data.arrayBuffer()
      : file.data;

    const totalSize = fileData.byteLength;
    let offset = 0;

    options.onProgress?.({
      bytesUploaded: 0,
      totalBytes: totalSize,
      percentage: 0,
      status: 'uploading',
    });

    while (offset < totalSize) {
      if (options.signal?.aborted) {
        throw new UploadError('Upload đã bị hủy', 'UNKNOWN', false);
      }

      const end = Math.min(offset + chunkSize, totalSize);
      const chunk = fileData.slice(offset, end);

      let retries = 0;
      let success = false;

      while (retries < MAX_RETRIES && !success) {
        try {
          const response = await fetch(sessionUrl, {
            method: 'PUT',
            headers: {
              'Content-Length': chunk.byteLength.toString(),
              'Content-Range': `bytes ${offset}-${end - 1}/${totalSize}`,
            },
            body: chunk,
            signal: options.signal,
          });

          if (response.status === 202) {
            // Chunk accepted, tiếp tục
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
            return { id: result.id as string };
          } else if (response.status === 401) {
            throw new UploadError(
              'Token đã hết hạn, vui lòng đăng nhập lại',
              'AUTH_EXPIRED',
              false,
            );
          } else if (response.status >= 500) {
            retries++;
            if (retries >= MAX_RETRIES) {
              throw new UploadError(
                'Lỗi server OneDrive, vui lòng thử lại',
                'NETWORK_ERROR',
                true,
              );
            }
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
   * Bước 3: Tạo sharing link
   * "Anyone with view permission"
   */
  async setPermission(
    fileId: string,
    accessToken: string,
    permissionType: 'view' | 'edit' = 'view',
  ): Promise<string> {
    const response = await fetch(
      `${GRAPH_API_BASE}/me/drive/items/${fileId}/createLink`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: permissionType,
          scope: 'anonymous',
        }),
      },
    );

    if (!response.ok) {
      throw new UploadError(
        'Không thể tạo link chia sẻ OneDrive',
        'PERMISSION_DENIED',
        true,
      );
    }

    const data = await response.json();
    return data.link?.webUrl as string;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
