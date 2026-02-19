/**
 * Service Worker (Background Script)
 * Xử lý upload file trong background
 * Nhận message từ content scripts, thực hiện upload, trả kết quả
 */

import { GoogleDriveUploader } from '@email-helper/shared-core';
import { formatLinkHtml, formatLinkPlainText } from '@email-helper/shared-core';
import type { FileInfo, UploadProgress, CloudProvider } from '@email-helper/shared-core';

/** Message types từ content script → service worker */
interface UploadRequest {
  action: 'upload';
  file: {
    name: string;
    size: number;
    mimeType: string;
    dataBase64: string;  // Base64 encoded (vì không thể gửi ArrayBuffer qua message)
  };
  provider: CloudProvider;
}

interface AuthRequest {
  action: 'get-auth-token';
  provider: CloudProvider;
}

type ServiceWorkerMessage = UploadRequest | AuthRequest;

/** Response types */
interface UploadResponse {
  success: true;
  linkHtml: string;
  linkText: string;
  fileName: string;
  fileSize: number;
  shareLink: string;
}

interface ErrorResponse {
  success: false;
  error: string;
  retryable: boolean;
}

type ServiceWorkerResponse = UploadResponse | ErrorResponse;

// Upload providers
const googleDriveUploader = new GoogleDriveUploader();

/**
 * Lấy Google OAuth token qua chrome.identity
 */
async function getGoogleAuthToken(interactive: boolean = true): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!token) {
        reject(new Error('Không lấy được token'));
        return;
      }
      resolve(token);
    });
  });
}

/**
 * Lấy Microsoft OAuth token qua launchWebAuthFlow
 */
async function getMicrosoftAuthToken(): Promise<string> {
  const clientId = 'YOUR_MICROSOFT_CLIENT_ID';
  const redirectUri = chrome.identity.getRedirectURL();
  const scope = encodeURIComponent('Files.ReadWrite offline_access');

  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=token&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;

  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl, interactive: true },
      (responseUrl) => {
        if (chrome.runtime.lastError || !responseUrl) {
          reject(new Error('Đăng nhập Microsoft thất bại'));
          return;
        }

        const url = new URL(responseUrl);
        const hash = url.hash.substring(1);
        const params = new URLSearchParams(hash);
        const token = params.get('access_token');

        if (!token) {
          reject(new Error('Không lấy được token Microsoft'));
          return;
        }

        resolve(token);
      },
    );
  });
}

/**
 * Convert base64 string về ArrayBuffer
 */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Xử lý upload request
 */
async function handleUpload(
  request: UploadRequest,
  sendProgress: (progress: UploadProgress) => void,
): Promise<ServiceWorkerResponse> {
  try {
    // Lấy auth token
    const accessToken = request.provider === 'google-drive'
      ? await getGoogleAuthToken()
      : await getMicrosoftAuthToken();

    // Convert base64 → ArrayBuffer
    const fileData = base64ToArrayBuffer(request.file.dataBase64);

    const fileInfo: FileInfo = {
      name: request.file.name,
      size: request.file.size,
      mimeType: request.file.mimeType,
      data: fileData,
    };

    // Upload
    const result = await googleDriveUploader.upload(fileInfo, {
      accessToken,
      onProgress: sendProgress,
    });

    // Format links
    const linkOptions = {
      fileName: result.fileName,
      fileSize: result.fileSize,
      shareLink: result.shareLink,
      provider: request.provider,
    };

    return {
      success: true,
      linkHtml: formatLinkHtml(linkOptions),
      linkText: formatLinkPlainText(linkOptions),
      fileName: result.fileName,
      fileSize: result.fileSize,
      shareLink: result.shareLink,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Lỗi không xác định';
    const retryable = error instanceof Error && 'retryable' in error
      ? (error as any).retryable
      : false;

    return {
      success: false,
      error: message,
      retryable,
    };
  }
}

/**
 * Listen for messages từ content scripts
 */
chrome.runtime.onMessage.addListener((message: ServiceWorkerMessage, sender, sendResponse) => {
  if (message.action === 'upload') {
    // Gửi progress updates qua port hoặc message
    const sendProgress = (progress: UploadProgress) => {
      if (sender.tab?.id) {
        chrome.tabs.sendMessage(sender.tab.id, {
          action: 'upload-progress',
          progress,
        });
      }
    };

    handleUpload(message, sendProgress).then(sendResponse);
    return true; // async response
  }

  if (message.action === 'get-auth-token') {
    const getToken = message.provider === 'google-drive'
      ? getGoogleAuthToken()
      : getMicrosoftAuthToken();

    getToken
      .then((token) => sendResponse({ success: true, token }))
      .catch((error) => sendResponse({ success: false, error: error.message }));

    return true;
  }
});

// Log khi service worker khởi động
console.log('[Email Helper] Service worker started');
