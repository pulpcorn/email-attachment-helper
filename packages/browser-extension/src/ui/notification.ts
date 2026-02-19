/**
 * Notification UI
 * Toast notifications cho người cao tuổi
 * Inject trực tiếp vào page DOM
 */

const CONTAINER_ID = 'email-helper-notification';
const PROGRESS_ID = 'email-helper-progress';

/**
 * Lấy hoặc tạo notification container
 */
function getContainer(): HTMLElement {
  let container = document.getElementById(CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONTAINER_ID;
    container.className = 'email-helper-toast';
    document.body.appendChild(container);
  }
  return container;
}

/**
 * Hiện thông báo chung
 */
export function showNotification(message: string): void {
  const container = getContainer();
  container.innerHTML = `
    <div class="email-helper-toast-content">
      <p class="email-helper-toast-message">${message}</p>
      <div id="${PROGRESS_ID}" class="email-helper-progress-bar" style="display: none;">
        <div class="email-helper-progress-fill"></div>
        <span class="email-helper-progress-text">0%</span>
      </div>
    </div>
  `;
  container.classList.add('email-helper-toast-visible');
}

/**
 * Cập nhật progress bar
 */
export function showProgress(percentage: number, status: string): void {
  const progressBar = document.getElementById(PROGRESS_ID);
  if (!progressBar) return;

  progressBar.style.display = 'block';

  const fill = progressBar.querySelector<HTMLElement>('.email-helper-progress-fill');
  const text = progressBar.querySelector<HTMLElement>('.email-helper-progress-text');

  if (fill) fill.style.width = `${percentage}%`;
  if (text) text.textContent = `${percentage}%`;
}

/**
 * Hiện thông báo thành công
 */
export function showSuccess(message: string): void {
  const container = getContainer();
  container.innerHTML = `
    <div class="email-helper-toast-content email-helper-toast-success">
      <p class="email-helper-toast-message">${message}</p>
      <button class="email-helper-toast-btn" onclick="this.closest('.email-helper-toast').classList.remove('email-helper-toast-visible')">
        OK, đã hiểu
      </button>
    </div>
  `;
  container.classList.add('email-helper-toast-visible');

  // Tự ẩn sau 8 giây
  setTimeout(() => hideNotification(), 8000);
}

/**
 * Hiện thông báo lỗi
 */
export function showError(message: string): void {
  const container = getContainer();
  container.innerHTML = `
    <div class="email-helper-toast-content email-helper-toast-error">
      <p class="email-helper-toast-message">${message}</p>
      <button class="email-helper-toast-btn" onclick="this.closest('.email-helper-toast').classList.remove('email-helper-toast-visible')">
        Đóng
      </button>
    </div>
  `;
  container.classList.add('email-helper-toast-visible');
}

/**
 * Ẩn notification
 */
export function hideNotification(): void {
  const container = document.getElementById(CONTAINER_ID);
  if (container) {
    container.classList.remove('email-helper-toast-visible');
  }
}
