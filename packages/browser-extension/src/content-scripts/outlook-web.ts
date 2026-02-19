/**
 * Outlook Web Content Script
 * Inject vào outlook.live.com / outlook.office.com
 * Tương tự Gmail nhưng cho Outlook web interface
 */

import { isFileTooLargeForEmail, isFileTooLargeForCloud, formatFileSize } from '@email-helper/shared-core';
import { showNotification, showProgress, showError, showSuccess } from '../ui/notification.js';

/**
 * Khởi tạo Outlook Web interceptor
 */
function init(): void {
  console.log('[Email Helper] Outlook Web content script loaded');
  observeComposeWindows();

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'upload-progress') {
      showProgress(message.progress.percentage, message.progress.status);
    }
  });
}

/**
 * Theo dõi compose windows trong Outlook Web
 */
function observeComposeWindows(): void {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof HTMLElement) {
          // Outlook Web compose selectors
          const composeWindows = node.querySelectorAll<HTMLElement>(
            '[role="main"] [aria-label*="message"], [role="dialog"]',
          );
          composeWindows.forEach(setupComposeInterceptor);

          if (node.matches('[role="main"] [aria-label*="message"], [role="dialog"]')) {
            setupComposeInterceptor(node);
          }
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Setup interceptor cho compose window
 */
function setupComposeInterceptor(composeEl: HTMLElement): void {
  if (composeEl.dataset.emailHelperAttached === 'true') return;
  composeEl.dataset.emailHelperAttached = 'true';

  interceptFileInputs(composeEl);
  interceptDragDrop(composeEl);
  console.log('[Email Helper] Outlook compose interceptor attached');
}

function interceptFileInputs(composeEl: HTMLElement): void {
  const observer = new MutationObserver(() => {
    const fileInputs = composeEl.querySelectorAll<HTMLInputElement>('input[type="file"]');
    fileInputs.forEach((input) => {
      if (input.dataset.emailHelperListening === 'true') return;
      input.dataset.emailHelperListening = 'true';
      input.addEventListener('change', (e) => {
        handleFileSelected(e.target as HTMLInputElement, composeEl);
      });
    });
  });

  observer.observe(composeEl, { childList: true, subtree: true });
}

function interceptDragDrop(composeEl: HTMLElement): void {
  const editableArea = composeEl.querySelector<HTMLElement>(
    '[contenteditable="true"], [role="textbox"]',
  );
  if (!editableArea) return;

  editableArea.addEventListener('drop', (e: DragEvent) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (isFileTooLargeForEmail(file.size)) {
        e.preventDefault();
        e.stopPropagation();
        handleLargeFile(file, composeEl);
      }
    }
  }, true);
}

function handleFileSelected(input: HTMLInputElement, composeEl: HTMLElement): void {
  const files = input.files;
  if (!files) return;
  for (const file of Array.from(files)) {
    if (isFileTooLargeForEmail(file.size)) {
      handleLargeFile(file, composeEl);
    }
  }
}

async function handleLargeFile(file: File, composeEl: HTMLElement): Promise<void> {
  if (isFileTooLargeForCloud(file.size)) {
    showError(`File "${file.name}" quá lớn (${formatFileSize(file.size)}). Giới hạn tối đa 5GB.`);
    return;
  }

  showNotification(
    `📎 File lớn! Đang tải "${file.name}" (${formatFileSize(file.size)}) lên OneDrive...`,
  );
  showProgress(0, 'uploading');

  try {
    const base64Data = await fileToBase64(file);

    const response = await chrome.runtime.sendMessage({
      action: 'upload',
      file: {
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        dataBase64: base64Data,
      },
      provider: 'onedrive' as const,
    });

    if (response.success) {
      insertLinkIntoCompose(composeEl, response.linkHtml);
      showSuccess(`✅ Đã tải xong "${file.name}"! Link đã được chèn vào email.`);
    } else {
      showError(`❌ ${response.error}`);
    }
  } catch (error) {
    showError('❌ Có lỗi xảy ra, vui lòng thử lại.');
    console.error('[Email Helper] Upload error:', error);
  }
}

function insertLinkIntoCompose(composeEl: HTMLElement, linkHtml: string): void {
  const editableArea = composeEl.querySelector<HTMLElement>(
    '[contenteditable="true"], [role="textbox"]',
  );
  if (!editableArea) return;

  const linkContainer = document.createElement('div');
  linkContainer.innerHTML = linkHtml;
  linkContainer.style.marginTop = '16px';
  editableArea.appendChild(linkContainer);
  editableArea.dispatchEvent(new Event('input', { bubbles: true }));
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(',')[1]);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

init();
