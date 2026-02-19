/**
 * TaskPane Script
 * Hiện trạng thái add-in và queue file
 */

Office.onReady(() => {
  console.log('[Email Helper] TaskPane ready');
  updateStatus();
});

function updateStatus(): void {
  const item = Office.context.mailbox.item;
  if (!item) {
    setStatus('⚠️', 'Không trong compose', 'Mở email mới để bắt đầu');
    return;
  }

  // Kiểm tra attachments
  item.getAttachmentsAsync((result) => {
    if (result.status !== Office.AsyncResultStatus.Succeeded) {
      setStatus('✅', 'Đang hoạt động', 'Sẵn sàng xử lý file lớn');
      return;
    }

    const largeFiles = result.value.filter(
      (att) => att.size && att.size > 25 * 1024 * 1024,
    );

    if (largeFiles.length > 0) {
      setStatus(
        '📎',
        `${largeFiles.length} file lớn phát hiện`,
        'Sẽ upload lên OneDrive khi gửi email',
      );
      showQueue(largeFiles);
    } else {
      setStatus('✅', 'Đang hoạt động', 'Sẵn sàng xử lý file lớn');
      hideQueue();
    }
  });
}

function setStatus(icon: string, label: string, detail: string): void {
  const iconEl = document.querySelector('.status-icon');
  const labelEl = document.getElementById('status-label');
  const detailEl = document.getElementById('status-detail');

  if (iconEl) iconEl.textContent = icon;
  if (labelEl) labelEl.textContent = label;
  if (detailEl) detailEl.textContent = detail;
}

function showQueue(files: Office.AttachmentDetails[]): void {
  const section = document.getElementById('queue-section');
  const list = document.getElementById('queue-list');
  if (!section || !list) return;

  section.style.display = 'block';
  list.innerHTML = files.map((f) => {
    const sizeMB = f.size ? (f.size / (1024 * 1024)).toFixed(1) : '?';
    return `<li class="queue-item">📄 ${f.name} <span class="queue-size">(${sizeMB} MB)</span></li>`;
  }).join('');
}

function hideQueue(): void {
  const section = document.getElementById('queue-section');
  if (section) section.style.display = 'none';
}
