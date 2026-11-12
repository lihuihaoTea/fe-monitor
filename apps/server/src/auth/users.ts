/**
 * 内置账号（暂不区分权限，不落库）。
 * 可用环境变量覆盖：ADMIN_USERNAME / ADMIN_PASSWORD
 */
export type AuthUser = {
  username: string;
  role: 'admin';
};

const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = '123456';

export function getAdminCredentials(): { username: string; password: string } {
  return {
    username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
    password: process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD,
  };
}

export function verifyCredentials(
  username: string,
  password: string
): AuthUser | null {
  const creds = getAdminCredentials();
  if (username !== creds.username || password !== creds.password) {
    return null;
  }
  return { username: creds.username, role: 'admin' };
}
