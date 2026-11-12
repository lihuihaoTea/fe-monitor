const DEFAULT_USERNAME = 'admin';
const DEFAULT_PASSWORD = '123456';
export function getAdminCredentials() {
    return {
        username: process.env.ADMIN_USERNAME || DEFAULT_USERNAME,
        password: process.env.ADMIN_PASSWORD || DEFAULT_PASSWORD,
    };
}
export function verifyCredentials(username, password) {
    const creds = getAdminCredentials();
    if (username !== creds.username || password !== creds.password) {
        return null;
    }
    return { username: creds.username, role: 'admin' };
}
//# sourceMappingURL=users.js.map