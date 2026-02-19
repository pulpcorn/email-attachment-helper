/**
 * Gmail Content Script
 * Inject vào mail.google.com
 * Phát hiện file attachment lớn, intercept, gửi lên cloud
 */

import { isFileTooLargeForEmail, isFileTooLargeForCloud, formatFileSize } from '@email-helper/shared-core';
import { showNotification, showProgress, hideNotification, showError, showSuccess } from '../ui/notification.js';

/** Giới hạn file size email (bytes) */
const EMAIL_SIZE_LIMIT = 25 * 1024 * 1024;

/**
 * Khởi tạo Gmail interceptor
 */
function init(): void {
  console.log('[Email Helper] Gmail content script loaded');

  // Theo dõi compose windows mới
  observeComposeWindows();

  // Lắng nghe progress updates từ service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'upload-progress') {
      showProgress(message.progress.percentage, message.progress.status);
    }
  });
}

/**
 * MutationObserver theo dõi khi compose window mở
 * Gmail tạo compose windows dynamically
 */
function observeComposeWindows(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          // Tìm compose window (Gmail dùng class .nH .aHU)
          const composeWindows = node.querySelectorAll<HTMLElement>(
            '[role="dialog"], .nH .aHU, .nH .aaZ',
          );
          composeWindows.forEach(setupComposeInterceptor);

          // Cũng check nếu node chính nó là compose
          if (node.matches('[role="dialog"], .nH .aHU, .nH .aaZ')) {
            setupComposeInterceptor(node);
          }
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Setup interceptor cho 1 compose window
 * Theo dõi file input changes và drag-drop
 */
function setupComposeInterceptor(composeEl: HTMLElement): void {
  // Tránh setup nhiều lần
  if (composeEl.dataset.emailHelperAttached === 'true') return;
  composeEl.dataset.emailHelperAttached = 'true';

  // Theo dõi file input
  interceptFileInputs(composeEl);

  // Theo dõi drag-drop
  interceptDragDrop(composeEl);

  console.log('[Email Helper] Compose interceptor attached');
}

/**
 * Intercept file input elements trong compose window
 */
function interceptFileInputs(composeEl: HTMLElement): void {
  // Gmail tạo file input dynamic, cần observer
  const observer = new MutationObserver(() => {
    const fileInputs = composeEl.querySelectorAll<HTMLInputElement>(
      'input[type="file"]',
    );
    fileInputs.forEach((input) => {
      if (input.dataset.emailHelperListening === 'true') return;
      input.dataset.emailHelperListening = 'true';

      input.addEventListener('change', (e) => {
        handleFileSelected(e.target as HTMLInputElement, composeEl);
      });
    });
  });

  observer.observe(composeEl, { childList: true, subtree: true });

  // Check existing file inputs
  const existingInputs = composeEl.querySelectorAll<HTMLInputElement>(
    'input[type="file"]',
  );
  existingInputs.forEach((input) => {
    input.dataset.emailHelperListening = 'true';
    input.addEventListener('change', (e) => {
      handleFileSelected(e.target as HTMLInputElement, composeEl);
    });
  });
}

/**
 * Intercept drag-drop trên compose window
 */
function interceptDragDrop(composeEl: HTMLElement): void {
  // Tìm editable area (email body)
  const editableArea = composeEl.querySelector<HTMLElement>(
    '[contenteditable="true"], .editable',
  );

  if (!editableArea) return;

  editableArea.addEventListener('drop', (e: DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    // Kiểm tra từng file
    for (const file of Array.from(files)) {
      if (isFileTooLargeForEmail(file.size)) {
        e.preventDefault();
        e.stopPropagation();
        handleLargeFile(file, composeEl);
      }
    }
  }, true); // capture phase để intercept trước Gmail
}

/**
 * Xử lý khi user chọn file qua file input
 */
function handleFileSelected(input: HTMLInputElement, composeEl: HTMLElement): void {
  const files = input.files;
  if (!files) return;

  for (const file of Array.from(files)) {
    if (isFileTooLargeForEmail(file.size)) {
      handleLargeFile(file, composeEl);
    }
  }
}

/**
 * Xử lý file lớn: upload lên cloud
 */
async function handleLargeFile(file: File, composeEl: HTMLElement): Promise<void> {
  // Kiểm tra giới hạn cloud
  if (isFileTooLargeForCloud(file.size)) {
    showError(`File "${file.name}" quá lớn (${formatFileSize(file.size)}). Giới hạn tối đa 5GB.`);
    return;
  }

  // Hiện thông báo
  showNotification(
    `📎 File lớn! Đang tải "${file.name}" (${formatFileSize(file.size)}) lên Google Drive...`,
  );
  showProgress(0, 'uploading');

  try {
    // Đọc file thành base64 để gửi qua chrome.runtime.sendMessage
    const base64Data = await fileToBase64(file);

    // Gửi request tới service worker
    const response = await chrome.runtime.sendMessage({
      action: 'upload',
      file: {
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        dataBase64: base64Data,
      },
      provider: 'google-drive' as const,
    });

    if (response.success) {
      // Chèn link vào email body
      insertLinkIntoCompose(composeEl, response.linkHtml);
      showSuccess(`✅ Đã tải xong "${file.name}"! Link đã được chèn vào email.`);
    } else {
      if (response.retryable) {
        showError(`❌ Không tải được "${file.name}". ${response.error}. Vui lòng thử lại.`);
      } else {
        showError(`❌ ${response.error}`);
      }
    }
  } catch (error) {
    showError('❌ Có lỗi xảy ra, vui lòng thử lại.');
    console.error('[Email Helper] Upload error:', error);
  }
}

/**
 * Chèn HTML link vào compose body
 */
function insertLinkIntoCompose(composeEl: HTMLElement, linkHtml: string): void {
  // Tìm editable area
  const editableArea = composeEl.querySelector<HTMLElement>(
    '[contenteditable="true"], .editable, [role="textbox"]',
  );

  if (!editableArea) {
    console.error('[Email Helper] Cannot find editable area');
    return;
  }

  // Thêm link vào cuối email body
  const linkContainer = document.createElement('div');
  linkContainer.innerHTML = linkHtml;
  linkContainer.style.marginTop = '16px';

  editableArea.appendChild(linkContainer);

  // Trigger input event để Gmail nhận biết thay đổi
  editableArea.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Convert File thành base64 string
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove data URL prefix: "data:...;base64,"
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Khởi động
init();
