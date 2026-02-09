const USER_ID_KEY = 'fi_auth_user_id_v2';
const USERNAME_KEY = 'fi_auth_username_v2';
const USER_HAS_PASSWORD_KEY = 'fi_auth_has_password_v2';
const AUTH_TOKEN_KEY = 'fi_auth_token_v2';

export interface UserInfo {
  userId: string;
  username: string;
  hasPassword: boolean;
  token: string;
}

export const authUtils = {
  setUserInfo(userId: string, username: string, hasPassword: boolean, token: string): void {
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(USERNAME_KEY, username);
    localStorage.setItem(USER_HAS_PASSWORD_KEY, hasPassword ? '1' : '0');
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  },

  getUserInfo(): UserInfo | null {
    const userId = localStorage.getItem(USER_ID_KEY);
    const username = localStorage.getItem(USERNAME_KEY);
    const hasPassword = localStorage.getItem(USER_HAS_PASSWORD_KEY) === '1';
    const token = localStorage.getItem(AUTH_TOKEN_KEY);

    if (!userId || !username || !token) {
      return null;
    }

    return { userId, username, hasPassword, token };
  },

  getUserId(): string | null {
    return localStorage.getItem(USER_ID_KEY);
  },

  getUsername(): string | null {
    return localStorage.getItem(USERNAME_KEY);
  },

  hasPassword(): boolean {
    return localStorage.getItem(USER_HAS_PASSWORD_KEY) === '1';
  },

  getToken(): string | null {
    return localStorage.getItem(AUTH_TOKEN_KEY);
  },

  getAuthHeaders(): Record<string, string> {
    const token = this.getToken();
    if (!token) {
      return {};
    }
    return {
      Authorization: `Bearer ${token}`,
    };
  },

  setUsername(username: string): void {
    localStorage.setItem(USERNAME_KEY, username);
  },

  setHasPassword(hasPassword: boolean): void {
    localStorage.setItem(USER_HAS_PASSWORD_KEY, hasPassword ? '1' : '0');
  },

  clearUserInfo(): void {
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USERNAME_KEY);
    localStorage.removeItem(USER_HAS_PASSWORD_KEY);
    localStorage.removeItem(AUTH_TOKEN_KEY);
  },

  isLoggedIn(): boolean {
    return !!this.getUserInfo();
  },
};
