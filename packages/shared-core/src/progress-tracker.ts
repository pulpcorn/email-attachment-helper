/**
 * Progress Tracker
 * Quản lý trạng thái upload, emit events cho UI
 * Event-based design cho loose coupling với UI layer
 */

import type { UploadProgress, UploadStatus } from './upload/types.js';

/** Event types cho progress tracker */
export type ProgressEventType = 'progress' | 'status-change' | 'error' | 'complete';

/** Event handler */
export type ProgressEventHandler = (data: ProgressEventData) => void;

/** Event data */
export interface ProgressEventData {
  type: ProgressEventType;
  progress: UploadProgress;
  error?: string;
}

/**
 * Progress Tracker class
 * Emits events cho UI layer để hiện progress bar & notifications
 */
export class ProgressTracker {
  private listeners = new Map<ProgressEventType, Set<ProgressEventHandler>>();
  private currentProgress: UploadProgress = {
    bytesUploaded: 0,
    totalBytes: 0,
    percentage: 0,
    status: 'pending',
  };

  constructor(totalBytes: number) {
    this.currentProgress.totalBytes = totalBytes;
  }

  /** Đăng ký listener */
  on(event: ProgressEventType, handler: ProgressEventHandler): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler);
  }

  /** Hủy đăng ký listener */
  off(event: ProgressEventType, handler: ProgressEventHandler): void {
    this.listeners.get(event)?.delete(handler);
  }

  /** Hủy tất cả listeners */
  removeAllListeners(): void {
    this.listeners.clear();
  }

  /** Lấy progress hiện tại */
  getProgress(): Readonly<UploadProgress> {
    return { ...this.currentProgress };
  }

  /** Cập nhật bytes đã upload */
  updateBytes(bytesUploaded: number): void {
    this.currentProgress.bytesUploaded = bytesUploaded;
    this.currentProgress.percentage = this.currentProgress.totalBytes > 0
      ? Math.min(100, Math.round((bytesUploaded / this.currentProgress.totalBytes) * 100))
      : 0;

    this.emit('progress', { ...this.currentProgress });
  }

  /** Cập nhật trạng thái */
  updateStatus(status: UploadStatus): void {
    const oldStatus = this.currentProgress.status;
    this.currentProgress.status = status;

    if (oldStatus !== status) {
      this.emit('status-change', { ...this.currentProgress });
    }

    if (status === 'completed') {
      this.currentProgress.percentage = 100;
      this.currentProgress.bytesUploaded = this.currentProgress.totalBytes;
      this.emit('complete', { ...this.currentProgress });
    }
  }

  /** Báo lỗi */
  reportError(errorMessage: string): void {
    this.currentProgress.status = 'failed';
    this.emitWithError('error', { ...this.currentProgress }, errorMessage);
  }

  /** Emit event */
  private emit(type: ProgressEventType, progress: UploadProgress): void {
    const data: ProgressEventData = { type, progress };
    this.listeners.get(type)?.forEach((handler) => handler(data));
  }

  /** Emit event kèm error */
  private emitWithError(
    type: ProgressEventType,
    progress: UploadProgress,
    error: string,
  ): void {
    const data: ProgressEventData = { type, progress, error };
    this.listeners.get(type)?.forEach((handler) => handler(data));
  }
}
