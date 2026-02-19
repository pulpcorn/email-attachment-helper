/**
 * Extension Popup Script
 * Hiện trạng thái extension
 */

// Kiểm tra trạng thái auth khi popup mở
async function checkStatus(): Promise<void> {
  const statusLabel = document.querySelector('.status-label');
  const statusValue = document.querySelector('.status-value');

  if (!statusLabel || !statusValue) return;

  try {
    // Kiểm tra Google auth
    const response = await chrome.runtime.sendMessage({
      action: 'get-auth-token',
      provider: 'google-drive',
    });

    if (response.success) {
      statusLabel.textContent = '✅ Đã đăng nhập Google';
      statusValue.textContent = 'Sẵn sàng upload lên Google Drive';
    } else {
      statusLabel.textContent = '⚠️ Chưa đăng nhập';
      statusValue.textContent = 'Sẽ yêu cầu đăng nhập khi cần';
      (statusLabel.closest('.status') as HTMLElement).style.background = '#fff8e1';
      (statusLabel.closest('.status') as HTMLElement).style.borderColor = '#f9a825';
      statusLabel.style.color = '#f57c00';
    }
  } catch {
    statusLabel.textContent = '✅ Đang hoạt động';
    statusValue.textContent = 'Sẵn sàng xử lý file lớn';
  }
}

checkStatus();
