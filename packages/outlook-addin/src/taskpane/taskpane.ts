/**
 * TaskPane - Logic chính
 * Flow: Chọn file → OAuth (Office Dialog) → Upload OneDrive → Chọn quyền → Chèn link cuối email
 */

import { OneDriveUploader } from '@email-helper/shared-core';
import { formatLinkHtml, formatFileSize } from '@email-helper/shared-core';
import type { FileInfo } from '@email-helper/shared-core';

const AUTH_DIALOG_URL = 'https://pulpcorn.github.io/email-attachment-helper/src/taskpane/auth-dialog.html';

const uploader = new OneDriveUploader();

// ─── State ───
let currentFile: File | null = null;
let lastUploadResult: { fileId: string; shareLink: string } | null = null;
let cachedAccessToken: string | null = null;

interface UploadedFile {
  name: string;
  size: number;
  shareLink: string;
  permission: 'view' | 'edit';
  uploadedAt: number;
}

// ─── Init ───
Office.onReady(() => {
  console.log('[Email Helper] TaskPane ready');

  // Bind events
  document.getElementById('btn-pick-file')!.addEventListener('click', onPickFile);
  document.getElementById('file-input')!.addEventListener('change', onFileSelected);
  document.getElementById('btn-view')!.addEventListener('click', () => onPermissionChosen('view'));
  document.getElementById('btn-edit')!.addEventListener('click', () => onPermissionChosen('edit'));
  document.getElementById('btn-upload-more')!.addEventListener('click', resetToUpload);
  document.getElementById('btn-retry')!.addEventListener('click', resetToUpload);

  // Load file manager
  renderFileManager();
});

// ─── Step 1: Chọn file ───
function onPickFile(): void {
  document.getElementById('file-input')!.click();
}

async function onFileSelected(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  if (!input.files || input.files.length === 0) return;

  currentFile = input.files[0];

  // Hiện tên file
  const fileInfoEl = document.getElementById('file-info')!;
  document.getElementById('file-name')!.textContent = `📄 ${currentFile.name}`;
  document.getElementById('file-size')!.textContent = `(${formatFileSize(currentFile.size)})`;
  fileInfoEl.style.display = 'block';

  // Reset input để có thể chọn lại cùng file
  input.value = '';

  // Bắt đầu upload
  await startUpload();
}

// ─── Step 2: Upload ───
async function startUpload(): Promise<void> {
  if (!currentFile) return;

  showStep('step-progress');

  try {
    // Lấy access token qua Office Dialog
    const accessToken = await getAccessToken();

    // Đọc file thành ArrayBuffer
    const arrayBuffer = await currentFile.arrayBuffer();
    const fileInfo: FileInfo = {
      name: currentFile.name,
      size: currentFile.size,
      mimeType: currentFile.type || 'application/octet-stream',
      data: arrayBuffer,
    };

    // Upload
    const result = await uploader.upload(fileInfo, {
      accessToken,
      onProgress: (progress) => {
        const bar = document.getElementById('progress-bar')!;
        const text = document.getElementById('progress-text')!;
        bar.style.width = `${progress.percentage}%`;
        text.textContent = `${progress.percentage}%`;
      },
    });

    lastUploadResult = {
      fileId: result.fileId,
      shareLink: result.shareLink,
    };

    // Hiện step chọn quyền
    showStep('step-permission');
  } catch (error: any) {
    console.error('[Email Helper] Upload error:', error);
    showError(error.message || 'Có lỗi xảy ra khi upload file.');
  }
}

// ─── Auth via Office Dialog API ───
function getAccessToken(): Promise<string> {
  // Nếu đã có token (cache), dùng luôn
  if (cachedAccessToken) {
    return Promise.resolve(cachedAccessToken);
  }

  return new Promise((resolve, reject) => {
    Office.context.ui.displayDialogAsync(
      AUTH_DIALOG_URL,
      { height: 60, width: 40, promptBeforeOpen: false, displayInIframe: true },
      (asyncResult) => {
        if (asyncResult.status !== Office.AsyncResultStatus.Succeeded) {
          reject(new Error('Không thể mở cửa sổ đăng nhập'));
          return;
        }

        const dialog = asyncResult.value;

        dialog.addEventHandler(Office.EventType.DialogMessageReceived, (arg: any) => {
          dialog.close();

          try {
            const message = JSON.parse(arg.message);
            if (message.status === 'success') {
              cachedAccessToken = message.token;
              resolve(message.token);
            } else {
              reject(new Error(message.error || 'Đăng nhập thất bại'));
            }
          } catch {
            reject(new Error('Lỗi xử lý đăng nhập'));
          }
        });

        dialog.addEventHandler(Office.EventType.DialogEventReceived, (arg: any) => {
          // Dialog đóng bởi user
          if (arg.error === 12006) {
            reject(new Error('Đã đóng cửa sổ đăng nhập'));
          }
        });
      },
    );
  });
}

// ─── Step 3: Chọn quyền ───
async function onPermissionChosen(permissionType: 'view' | 'edit'): Promise<void> {
  if (!lastUploadResult || !currentFile) return;

  try {
    // Lấy token (đã cache)
    const accessToken = await getAccessToken();

    // Set permission
    const shareLink = await uploader.setPermission(
      lastUploadResult.fileId,
      accessToken,
      permissionType,
    );

    // Format link HTML
    const linkHtml = formatLinkHtml({
      fileName: currentFile.name,
      fileSize: currentFile.size,
      shareLink,
      provider: 'onedrive',
    });

    // Chèn link vào cuối email
    await insertLinkToEmail(linkHtml);

    // Lưu vào file manager
    saveUploadedFile({
      name: currentFile.name,
      size: currentFile.size,
      shareLink,
      permission: permissionType,
      uploadedAt: Date.now(),
    });

    // Hiện step hoàn tất
    showStep('step-done');
    renderFileManager();
  } catch (error: any) {
    console.error('[Email Helper] Permission error:', error);
    showError(error.message || 'Không thể set quyền. Vui lòng thử lại.');
  }
}

// ─── Chèn link cuối email ───
function insertLinkToEmail(linkHtml: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const item = Office.context.mailbox.item;
    if (!item) {
      reject(new Error('Không trong compose'));
      return;
    }

    // Append vào cuối body
    item.body.getAsync(Office.CoercionType.Html, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error('Không thể đọc email'));
        return;
      }

      const currentBody = result.value;
      const separator = '<br><br><hr style="border:none;border-top:1px solid #e0e0e0;margin:16px 0;">';
      const newBody = currentBody + separator + linkHtml;

      item.body.setAsync(newBody, { coercionType: Office.CoercionType.Html }, (setResult) => {
        if (setResult.status === Office.AsyncResultStatus.Succeeded) {
          resolve();
        } else {
          reject(new Error('Không thể chèn link'));
        }
      });
    });
  });
}

// ─── File Manager ───
const STORAGE_KEY = 'emailHelper_uploadedFiles';

function getUploadedFiles(): UploadedFile[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveUploadedFile(file: UploadedFile): void {
  const files = getUploadedFiles();
  files.unshift(file);
  // Giữ tối đa 20 files
  if (files.length > 20) files.length = 20;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
}

function removeUploadedFile(index: number): void {
  const files = getUploadedFiles();
  files.splice(index, 1);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(files));
  renderFileManager();
}

async function reinsertFile(file: UploadedFile): Promise<void> {
  const linkHtml = formatLinkHtml({
    fileName: file.name,
    fileSize: file.size,
    shareLink: file.shareLink,
    provider: 'onedrive',
  });

  try {
    await insertLinkToEmail(linkHtml);
    // Flash hiệu ứng thành công
    const doneSection = document.getElementById('step-done')!;
    doneSection.style.display = 'block';
    setTimeout(() => {
      doneSection.style.display = 'none';
    }, 2000);
  } catch (error: any) {
    showError(error.message || 'Không thể chèn link.');
  }
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function renderFileManager(): void {
  const list = document.getElementById('file-list')!;
  const files = getUploadedFiles();

  if (files.length === 0) {
    list.innerHTML = '<li class="file-list-empty">Chưa có file nào</li>';
    return;
  }

  list.innerHTML = files.map((f, i) => {
    const sizeMB = (f.size / (1024 * 1024)).toFixed(1);
    const permLabel = f.permission === 'view' ? '👁 Xem' : '✏️ Sửa';
    return `<li class="file-list-item">
      <div class="file-list-item-info">
        <span class="file-list-item-name">📄 ${escapeHtml(f.name)}</span>
        <span class="file-list-item-size">${sizeMB}MB · ${permLabel}</span>
      </div>
      <div class="file-list-item-actions">
        <button class="btn-icon" data-action="reinsert" data-index="${i}" title="Chèn lại link">📋</button>
        <button class="btn-icon btn-icon-danger" data-action="remove" data-index="${i}" title="Xóa">🗑</button>
      </div>
    </li>`;
  }).join('');

  // Bind events
  list.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const action = target.dataset.action;
      const index = parseInt(target.dataset.index!, 10);

      if (action === 'reinsert') {
        reinsertFile(files[index]);
      } else if (action === 'remove') {
        removeUploadedFile(index);
      }
    });
  });
}

// ─── UI Helpers ───
function showStep(stepId: string): void {
  const steps = ['step-upload', 'step-progress', 'step-permission', 'step-done', 'step-error'];
  for (const id of steps) {
    const el = document.getElementById(id);
    if (el) el.style.display = id === stepId ? 'block' : 'none';
  }
}

function showError(message: string): void {
  document.getElementById('error-text')!.textContent = message;
  showStep('step-error');
}

function resetToUpload(): void {
  currentFile = null;
  lastUploadResult = null;

  // Reset progress
  const bar = document.getElementById('progress-bar');
  const text = document.getElementById('progress-text');
  if (bar) bar.style.width = '0%';
  if (text) text.textContent = '0%';

  // Ẩn file info
  const fileInfo = document.getElementById('file-info');
  if (fileInfo) fileInfo.style.display = 'none';

  showStep('step-upload');
}
