import { describe, it, expect, vi } from 'vitest';
import { ProgressTracker } from '../src/progress-tracker.js';

describe('ProgressTracker', () => {
  it('khởi tạo với totalBytes', () => {
    const tracker = new ProgressTracker(1000);
    const progress = tracker.getProgress();
    expect(progress.totalBytes).toBe(1000);
    expect(progress.bytesUploaded).toBe(0);
    expect(progress.percentage).toBe(0);
    expect(progress.status).toBe('pending');
  });

  it('cập nhật bytes và tính percentage', () => {
    const tracker = new ProgressTracker(1000);
    tracker.updateBytes(500);
    const progress = tracker.getProgress();
    expect(progress.bytesUploaded).toBe(500);
    expect(progress.percentage).toBe(50);
  });

  it('percentage không vượt quá 100', () => {
    const tracker = new ProgressTracker(1000);
    tracker.updateBytes(1500);
    expect(tracker.getProgress().percentage).toBe(100);
  });

  it('percentage = 0 khi totalBytes = 0', () => {
    const tracker = new ProgressTracker(0);
    tracker.updateBytes(100);
    expect(tracker.getProgress().percentage).toBe(0);
  });

  it('emit progress event khi updateBytes', () => {
    const tracker = new ProgressTracker(1000);
    const handler = vi.fn();
    tracker.on('progress', handler);

    tracker.updateBytes(300);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'progress',
        progress: expect.objectContaining({
          bytesUploaded: 300,
          percentage: 30,
        }),
      }),
    );
  });

  it('emit status-change event khi status thay đổi', () => {
    const tracker = new ProgressTracker(1000);
    const handler = vi.fn();
    tracker.on('status-change', handler);

    tracker.updateStatus('uploading');

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'status-change',
        progress: expect.objectContaining({
          status: 'uploading',
        }),
      }),
    );
  });

  it('không emit status-change nếu status giống cũ', () => {
    const tracker = new ProgressTracker(1000);
    const handler = vi.fn();
    tracker.on('status-change', handler);

    tracker.updateStatus('uploading');
    tracker.updateStatus('uploading');

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('emit complete khi status = completed', () => {
    const tracker = new ProgressTracker(1000);
    const completeHandler = vi.fn();
    tracker.on('complete', completeHandler);

    tracker.updateStatus('completed');

    expect(completeHandler).toHaveBeenCalledTimes(1);
    const progress = tracker.getProgress();
    expect(progress.percentage).toBe(100);
    expect(progress.bytesUploaded).toBe(1000);
  });

  it('emit error với message', () => {
    const tracker = new ProgressTracker(1000);
    const errorHandler = vi.fn();
    tracker.on('error', errorHandler);

    tracker.reportError('Mạng bị ngắt');

    expect(errorHandler).toHaveBeenCalledTimes(1);
    expect(errorHandler).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'error',
        error: 'Mạng bị ngắt',
        progress: expect.objectContaining({
          status: 'failed',
        }),
      }),
    );
  });

  it('off() hủy listener', () => {
    const tracker = new ProgressTracker(1000);
    const handler = vi.fn();
    tracker.on('progress', handler);
    tracker.off('progress', handler);

    tracker.updateBytes(500);

    expect(handler).not.toHaveBeenCalled();
  });

  it('removeAllListeners() hủy tất cả', () => {
    const tracker = new ProgressTracker(1000);
    const handler1 = vi.fn();
    const handler2 = vi.fn();
    tracker.on('progress', handler1);
    tracker.on('error', handler2);

    tracker.removeAllListeners();
    tracker.updateBytes(500);
    tracker.reportError('test');

    expect(handler1).not.toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('getProgress() trả về copy, không phải reference', () => {
    const tracker = new ProgressTracker(1000);
    const progress1 = tracker.getProgress();
    tracker.updateBytes(500);
    const progress2 = tracker.getProgress();

    expect(progress1.bytesUploaded).toBe(0);
    expect(progress2.bytesUploaded).toBe(500);
  });
});
