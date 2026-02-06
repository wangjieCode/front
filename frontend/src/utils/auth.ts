const USER_ID_KEY = 'user_id';
const USERNAME_KEY = 'username';
const USER_HAS_PASSWORD_KEY = 'user_has_password';

export interface UserInfo {
  userId: string;
  username: string;
  hasPassword: boolean;
}

export const authUtils = {
  setUserInfo(userId: string, username: string, hasPassword = false): void {
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(USERNAME_KEY, username);
    localStorage.setItem(USER_HAS_PASSWORD_KEY, hasPassword ? '1' : '0');
  },

  getUserInfo(): UserInfo | null {
    const userId = localStorage.getItem(USER_ID_KEY);
    const username = localStorage.getItem(USERNAME_KEY);
    const hasPassword = localStorage.getItem(USER_HAS_PASSWORD_KEY) === '1';

    if (!userId || !username) {
      return null;
    }

    return { userId, username, hasPassword };
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
  },

  isLoggedIn(): boolean {
    return !!this.getUserInfo();
  },
};
