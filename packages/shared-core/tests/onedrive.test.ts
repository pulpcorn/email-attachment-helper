import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OneDriveUploader } from '../src/upload/onedrive.js';
import { UploadError } from '../src/upload/types.js';
import type { FileInfo, UploadOptions } from '../src/upload/types.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function createTestFile(size: number = 1024): FileInfo {
  return {
    name: 'test.pdf',
    size,
    mimeType: 'application/pdf',
    data: new ArrayBuffer(size),
  };
}

function createMockOptions(overrides?: Partial<UploadOptions>): UploadOptions {
  return {
    accessToken: 'mock-token',
    onProgress: vi.fn(),
    ...overrides,
  };
}

describe('OneDriveUploader', () => {
  let uploader: OneDriveUploader;

  beforeEach(() => {
    uploader = new OneDriveUploader();
    mockFetch.mockReset();
  });

  describe('upload', () => {
    it('upload file thành công', async () => {
      mockFetch
        // Step 1: Create upload session
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            uploadUrl: 'https://graph.microsoft.com/upload-session/123',
          }),
        })
        // Step 2: Upload chunk → 201 (completed)
        .mockResolvedValueOnce({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ id: 'onedrive-file-123' }),
        })
        // Step 3: Create sharing link
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            link: { webUrl: 'https://1drv.ms/u/s!ABC123' },
          }),
        });

      const file = createTestFile(1024);
      const options = createMockOptions();

      const result = await uploader.upload(file, options);

      expect(result.provider).toBe('onedrive');
      expect(result.fileId).toBe('onedrive-file-123');
      expect(result.shareLink).toBe('https://1drv.ms/u/s!ABC123');
    });

    it('throw AUTH_EXPIRED khi session trả về 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const file = createTestFile();
      const options = createMockOptions();

      await expect(uploader.upload(file, options)).rejects.toMatchObject({
        code: 'AUTH_EXPIRED',
      });
    });

    it('throw STORAGE_FULL khi session trả về 507', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 507,
      });

      const file = createTestFile();
      const options = createMockOptions();

      await expect(uploader.upload(file, options)).rejects.toMatchObject({
        code: 'STORAGE_FULL',
      });
    });
  });

  describe('setPermission', () => {
    it('tạo sharing link thành công', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({
          link: { webUrl: 'https://1drv.ms/u/s!XYZ' },
        }),
      });

      const link = await uploader.setPermission('file-id', 'token');
      expect(link).toBe('https://1drv.ms/u/s!XYZ');
    });

    it('throw error khi tạo link thất bại', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
      });

      await expect(
        uploader.setPermission('file-id', 'token'),
      ).rejects.toThrow(UploadError);
    });
  });
});
