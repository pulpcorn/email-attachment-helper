import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GoogleDriveUploader } from '../src/upload/google-drive.js';
import { UploadError } from '../src/upload/types.js';
import type { FileInfo, UploadOptions } from '../src/upload/types.js';

// Mock fetch globally
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

describe('GoogleDriveUploader', () => {
  let uploader: GoogleDriveUploader;

  beforeEach(() => {
    uploader = new GoogleDriveUploader();
    mockFetch.mockReset();
  });

  describe('upload', () => {
    it('upload file thành công qua 3 bước', async () => {
      // Step 1: Initiate → 200 + Location header
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ Location: 'https://upload.googleapis.com/session/123' }),
        })
        // Step 2: Upload chunk → 200 (file nhỏ, 1 chunk)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'file-id-123' }),
        })
        // Step 3a: Set permission → 200
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        })
        // Step 3b: Get webViewLink → 200
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ webViewLink: 'https://drive.google.com/file/d/file-id-123/view' }),
        });

      const file = createTestFile(1024);
      const options = createMockOptions();

      const result = await uploader.upload(file, options);

      expect(result.provider).toBe('google-drive');
      expect(result.fileId).toBe('file-id-123');
      expect(result.shareLink).toBe('https://drive.google.com/file/d/file-id-123/view');
      expect(result.fileName).toBe('test.pdf');
      expect(result.fileSize).toBe(1024);
    });

    it('throw AUTH_EXPIRED khi initiate trả về 401', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });

      const file = createTestFile();
      const options = createMockOptions();

      try {
        await uploader.upload(file, options);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(UploadError);
        expect((error as UploadError).code).toBe('AUTH_EXPIRED');
      }
    });

    it('throw STORAGE_FULL khi initiate trả về 507', async () => {
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

    it('throw PERMISSION_DENIED khi initiate trả về 403', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
      });

      const file = createTestFile();
      const options = createMockOptions();

      await expect(uploader.upload(file, options)).rejects.toMatchObject({
        code: 'PERMISSION_DENIED',
      });
    });
  });

  describe('setPermission', () => {
    it('tạo sharing link thành công', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({
            webViewLink: 'https://drive.google.com/file/d/abc/view',
          }),
        });

      const link = await uploader.setPermission('abc', 'token');
      expect(link).toBe('https://drive.google.com/file/d/abc/view');
    });

    it('fallback link khi get file info thất bại', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const link = await uploader.setPermission('xyz', 'token');
      expect(link).toContain('drive.google.com');
      expect(link).toContain('xyz');
    });
  });
});
