/**
 * Auth types & interfaces
 * Shared auth abstraction cho cả Google và Microsoft
 */

/** Auth provider type */
export type AuthProvider = 'google' | 'microsoft';

/** Auth token data */
export interface AuthToken {
  /** Access token */
  accessToken: string;
  /** Token expiry timestamp (ms) */
  expiresAt: number;
  /** Refresh token (nếu có) */
  refreshToken?: string;
  /** Provider */
  provider: AuthProvider;
}

/** Auth state */
export type AuthState = 'signed-out' | 'signed-in' | 'expired';

/**
 * Interface cho auth handler
 * Mỗi platform (extension, add-in) implement riêng
 */
export interface AuthHandler {
  /** Lấy access token (interactive nếu cần) */
  getAccessToken(interactive: boolean): Promise<string>;
  /** Kiểm tra trạng thái auth */
  getAuthState(): AuthState;
  /** Sign out */
  signOut(): Promise<void>;
}

/**
 * Kiểm tra token còn hạn không
 * Buffer 5 phút trước khi hết hạn
 */
export function isTokenValid(token: AuthToken): boolean {
  const bufferMs = 5 * 60 * 1000; // 5 phút
  return Date.now() < token.expiresAt - bufferMs;
}
