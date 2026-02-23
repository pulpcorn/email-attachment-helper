/**
 * TaskPane - Logic chính
 * Flow: Đăng nhập (nếu cần) → Chọn file → Upload OneDrive → Chọn quyền → Chèn link
 *
 * Auth: MSAL redirect trực tiếp trong TaskPane
 * - Lần đầu: trang tự chuyển sang Microsoft login → redirect về
 * - Sau đó: token cached, acquireTokenSilent
 */

import { PublicClientApplication } from '@azure/msal-browser';
import { OneDriveUploader } from '@email-helper/shared-core';
import { formatLinkHtml, formatFileSize } from '@email-helper/shared-core';
import type { FileInfo } from '@email-helper/shared-core';

// ─── Config ───
const MSAL_CLIENT_ID = '6a71bcce-b6c7-493a-a23d-c9bdcfaaee78';
const MSAL_SCOPES = ['Files.ReadWrite', 'User.Read'];

const msalInstance = new PublicClientApplication({
  auth: {
    clientId: MSAL_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    redirectUri: window.location.origin + window.location.pathname,
  },
  cache: {
    cacheLocation: 'localStorage',
  },
});

const uploader = new OneDriveUploader();

// ─── State ───
let currentFile: File | null = null;
let lastUploadResult: { fileId: string; shareLink: string } | null = null;
let cachedToken: string | null = null;

interface UploadedFile {
  name: string;
  size: number;
  shareLink: string;
  permission: 'view' | 'edit';
  uploadedAt: number;
}

// ─── Init ───
Office.onReady(async () => {
  console.log('[Email Helper] TaskPane ready');

  // 1. Init MSAL + xử lý redirect callback (nếu vừa login xong quay về)
  await msalInstance.initialize();
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response && response.accessToken) {
      cachedToken = response.accessToken;
      console.log('[Email Helper] Login thành công!');
      // Hiện thông báo đã đăng nhập
      showLoginStatus(true, response.account?.username || '');
    }
  } catch (error) {
    console.error('[Email Helper] Redirect error:', error);
  }

  // Kiểm tra đã có account chưa
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    showLoginStatus(true, accounts[0].username || '');
  }

  // 2. Bind events
  document.getElementById('btn-pick-file')!.addEventListener('click', onPickFile);
  document.getElementById('file-input')!.addEventListener('change', onFileSelected);
  document.getElementById('btn-view')!.addEventListener('click', () => onPermissionChosen('view'));
  document.getElementById('btn-edit')!.addEventListener('click', () => onPermissionChosen('edit'));
  document.getElementById('btn-upload-more')!.addEventListener('click', resetToUpload);
  document.getElementById('btn-retry')!.addEventListener('click', resetToUpload);
  document.getElementById('btn-login')?.addEventListener('click', doLogin);

  // 3. Load file manager
  renderFileManager();
});

// ─── Auth ───
async function doLogin(): Promise<void> {
  // Redirect sang Microsoft login (trang sẽ reload sau khi login)
  await msalInstance.acquireTokenRedirect({
    scopes: MSAL_SCOPES,
  });
}

async function getAccessToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  // Thử silent
  const accounts = msalInstance.getAllAccounts();
  if (accounts.length > 0) {
    try {
      const result = await msalInstance.acquireTokenSilent({
        scopes: MSAL_SCOPES,
        account: accounts[0],
      });
      cachedToken = result.accessToken;
      return result.accessToken;
    } catch {
      // Silent fail
    }
  }

  // Chưa đăng nhập → redirect
  await msalInstance.acquireTokenRedirect({
    scopes: MSAL_SCOPES,
  });
  // Page sẽ reload, không bao giờ đến đây
  throw new Error('Đang chuyển trang đăng nhập...');
}

function showLoginStatus(loggedIn: boolean, username: string): void {
  const loginSection = document.getElementById('step-login');
  const uploadSection = document.getElementById('step-upload');
  if (loginSection && uploadSection) {
    if (loggedIn) {
      loginSection.style.display = 'none';
      uploadSection.style.display = 'block';
      // Hiện username nếu có element
      const userEl = document.getElementById('logged-in-user');
      if (userEl) userEl.textContent = `Đã đăng nhập: ${username}`;
    } else {
      loginSection.style.display = 'block';
      uploadSection.style.display = 'none';
    }
  }
}

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

  input.value = '';

  await startUpload();
}

// ─── Step 2: Upload ───
async function startUpload(): Promise<void> {
  if (!currentFile) return;

  showStep('step-progress');

  try {
    const accessToken = await getAccessToken();

    const arrayBuffer = await currentFile.arrayBuffer();
    const fileInfo: FileInfo = {
      name: currentFile.name,
      size: currentFile.size,
      mimeType: currentFile.type || 'application/octet-stream',
      data: arrayBuffer,
    };

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

    showStep('step-permission');
  } catch (error: any) {
    console.error('[Email Helper] Upload error:', error);
    if (error.message !== 'Đang chuyển trang đăng nhập...') {
      showError(error.message || 'Có lỗi xảy ra khi upload file.');
    }
  }
}

// ─── Step 3: Chọn quyền ───
async function onPermissionChosen(permissionType: 'view' | 'edit'): Promise<void> {
  if (!lastUploadResult || !currentFile) return;

  try {
    const accessToken = await getAccessToken();

    const shareLink = await uploader.setPermission(
      lastUploadResult.fileId,
      accessToken,
      permissionType,
    );

    const linkHtml = formatLinkHtml({
      fileName: currentFile.name,
      fileSize: currentFile.size,
      shareLink,
      provider: 'onedrive',
    });

    await insertLinkToEmail(linkHtml);

    saveUploadedFile({
      name: currentFile.name,
      size: currentFile.size,
      shareLink,
      permission: permissionType,
      uploadedAt: Date.now(),
    });

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
    const doneSection = document.getElementById('step-done')!;
    doneSection.style.display = 'block';
    setTimeout(() => { doneSection.style.display = 'none'; }, 2000);
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

  list.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const target = e.currentTarget as HTMLElement;
      const action = target.dataset.action;
      const index = parseInt(target.dataset.index!, 10);
      if (action === 'reinsert') reinsertFile(files[index]);
      else if (action === 'remove') removeUploadedFile(index);
    });
  });
}

// ─── UI Helpers ───
function showStep(stepId: string): void {
  const steps = ['step-login', 'step-upload', 'step-progress', 'step-permission', 'step-done', 'step-error'];
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
  const bar = document.getElementById('progress-bar');
  const text = document.getElementById('progress-text');
  if (bar) bar.style.width = '0%';
  if (text) text.textContent = '0%';
  const fileInfo = document.getElementById('file-info');
  if (fileInfo) fileInfo.style.display = 'none';
  showStep('step-upload');
}
