const USER_ID_KEY = 'user_id';
const USERNAME_KEY = 'username';

export interface UserInfo {
  userId: string;
  username: string;
}

export const authUtils = {
  setUserInfo(userId: string, username: string): void {
    localStorage.setItem(USER_ID_KEY, userId);
    localStorage.setItem(USERNAME_KEY, username);
  },

  getUserInfo(): UserInfo | null {
    const userId = localStorage.getItem(USER_ID_KEY);
    const username = localStorage.getItem(USERNAME_KEY);

    if (!userId || !username) {
      return null;
    }

    return { userId, username };
  },

  clearUserInfo(): void {
    localStorage.removeItem(USER_ID_KEY);
    localStorage.removeItem(USERNAME_KEY);
  },

  isLoggedIn(): boolean {
    return !!this.getUserInfo();
  },
};
