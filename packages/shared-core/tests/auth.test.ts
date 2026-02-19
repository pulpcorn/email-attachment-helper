import { describe, it, expect } from 'vitest';
import { isTokenValid } from '../src/auth/types.js';
import type { AuthToken } from '../src/auth/types.js';

describe('isTokenValid', () => {
  it('trả về true khi token còn hạn', () => {
    const token: AuthToken = {
      accessToken: 'test',
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 giờ nữa
      provider: 'google',
    };
    expect(isTokenValid(token)).toBe(true);
  });

  it('trả về false khi token đã hết hạn', () => {
    const token: AuthToken = {
      accessToken: 'test',
      expiresAt: Date.now() - 1000, // đã hết hạn
      provider: 'google',
    };
    expect(isTokenValid(token)).toBe(false);
  });

  it('trả về false khi token gần hết hạn (< 5 phút)', () => {
    const token: AuthToken = {
      accessToken: 'test',
      expiresAt: Date.now() + 3 * 60 * 1000, // 3 phút nữa (< 5 phút buffer)
      provider: 'microsoft',
    };
    expect(isTokenValid(token)).toBe(false);
  });

  it('trả về true khi token còn > 5 phút', () => {
    const token: AuthToken = {
      accessToken: 'test',
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 phút nữa
      provider: 'google',
    };
    expect(isTokenValid(token)).toBe(true);
  });
});
