/**
 * Outlook Add-in Event Handlers
 * OnAttachmentsChanged: phát hiện file lớn
 * OnMessageSend: upload + chèn link trước khi gửi
 */

import { OneDriveUploader } from '@email-helper/shared-core';
import { formatLinkHtml, formatLinkPlainText, isFileTooLargeForEmail, formatFileSize } from '@email-helper/shared-core';
import type { FileInfo } from '@email-helper/shared-core';

/** Queue lưu file lớn cần xử lý khi send */
const largeFileQueue: Array<{
  id: string;
  name: string;
  size: number;
}> = [];

const oneDriveUploader = new OneDriveUploader();

/**
 * Handler: OnAttachmentsChanged
 * Được gọi khi user thêm/xóa attachment
 */
function onAttachmentsChanged(event: Office.AddinCommands.Event): void {
  const item = Office.context.mailbox.item;
  if (!item) {
    event.completed();
    return;
  }

  // Lấy danh sách attachments hiện tại
  item.getAttachmentsAsync((result) => {
    if (result.status !== Office.AsyncResultStatus.Succeeded) {
      event.completed();
      return;
    }

    // Clear queue cũ
    largeFileQueue.length = 0;

    // Kiểm tra từng attachment
    for (const attachment of result.value) {
      if (attachment.size && isFileTooLargeForEmail(attachment.size)) {
        largeFileQueue.push({
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
        });

        // Thông báo cho user qua notification
        showNotificationMessage(
          item,
          `📎 File "${attachment.name}" (${formatFileSize(attachment.size)}) sẽ được tải lên OneDrive khi gửi email.`,
        );
      }
    }

    event.completed();
  });
}

/**
 * Handler: OnMessageSend (Smart Alerts)
 * Được gọi khi user nhấn Send
 * Upload các file lớn, xóa attachment, chèn link
 */
function onMessageSend(event: Office.AddinCommands.Event): void {
  if (largeFileQueue.length === 0) {
    // Không có file lớn → cho gửi bình thường
    event.completed({ allowEvent: true });
    return;
  }

  const item = Office.context.mailbox.item;
  if (!item) {
    event.completed({ allowEvent: true });
    return;
  }

  // Lấy access token qua Office SSO
  Office.auth.getAccessToken({ allowSignInPrompt: true })
    .then(async (accessToken) => {
      const links: string[] = [];

      for (const fileInfo of largeFileQueue) {
        try {
          // Lấy nội dung attachment
          const content = await getAttachmentContent(item, fileInfo.id);
          if (!content) continue;

          const uploadFile: FileInfo = {
            name: fileInfo.name,
            size: fileInfo.size,
            mimeType: content.mimeType,
            data: content.data,
          };

          // Upload lên OneDrive
          const result = await oneDriveUploader.upload(uploadFile, {
            accessToken,
          });

          // Format link
          const linkHtml = formatLinkHtml({
            fileName: result.fileName,
            fileSize: result.fileSize,
            shareLink: result.shareLink,
            provider: 'onedrive',
          });

          links.push(linkHtml);

          // Xóa attachment gốc
          await removeAttachment(item, fileInfo.id);
        } catch (error) {
          console.error(`[Email Helper] Upload failed for ${fileInfo.name}:`, error);
          // Nếu upload thất bại, cho phép gửi với attachment gốc
          showNotificationMessage(
            item,
            `❌ Không thể upload "${fileInfo.name}". File sẽ được đính kèm bình thường.`,
          );
        }
      }

      if (links.length > 0) {
        // Chèn links vào email body
        await appendToBody(item, links.join('<br><br>'));
      }

      // Clear queue
      largeFileQueue.length = 0;

      // Cho phép send
      event.completed({ allowEvent: true });
    })
    .catch((error) => {
      console.error('[Email Helper] Auth failed:', error);
      // Auth thất bại → cho gửi bình thường
      showNotificationMessage(
        item,
        '⚠️ Không thể đăng nhập OneDrive. File sẽ được đính kèm bình thường.',
      );
      largeFileQueue.length = 0;
      event.completed({ allowEvent: true });
    });
}

/**
 * Lấy nội dung attachment
 */
function getAttachmentContent(
  item: Office.MessageCompose,
  attachmentId: string,
): Promise<{ data: ArrayBuffer; mimeType: string } | null> {
  return new Promise((resolve) => {
    item.getAttachmentContentAsync(attachmentId, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        resolve(null);
        return;
      }

      const content = result.value;
      // Content có thể là base64
      if (content.format === Office.MailboxEnums.AttachmentContentFormat.Base64) {
        const binaryString = atob(content.content);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        resolve({
          data: bytes.buffer,
          mimeType: 'application/octet-stream',
        });
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * Xóa attachment
 */
function removeAttachment(
  item: Office.MessageCompose,
  attachmentId: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    item.removeAttachmentAsync(attachmentId, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve();
      } else {
        reject(new Error('Cannot remove attachment'));
      }
    });
  });
}

/**
 * Thêm HTML vào cuối email body
 */
function appendToBody(
  item: Office.MessageCompose,
  html: string,
): Promise<void> {
  return new Promise((resolve, reject) => {
    item.body.getAsync(Office.CoercionType.Html, (result) => {
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error('Cannot read body'));
        return;
      }

      const currentBody = result.value;
      const newBody = currentBody + '<br><br>' + html;

      item.body.setAsync(newBody, { coercionType: Office.CoercionType.Html }, (setResult) => {
        if (setResult.status === Office.AsyncResultStatus.Succeeded) {
          resolve();
        } else {
          reject(new Error('Cannot set body'));
        }
      });
    });
  });
}

/**
 * Hiện notification trong Outlook
 */
function showNotificationMessage(
  item: Office.MessageCompose,
  message: string,
): void {
  item.notificationMessages.replaceAsync('emailHelper', {
    type: Office.MailboxEnums.ItemNotificationMessageType.InformationalMessage,
    message,
    icon: 'icon-16',
    persistent: false,
  });
}

// Register event handlers với Office
Office.actions.associate('onAttachmentsChanged', onAttachmentsChanged);
Office.actions.associate('onMessageSend', onMessageSend);
