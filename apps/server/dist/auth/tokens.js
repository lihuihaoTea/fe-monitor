import { createHmac, timingSafeEqual } from 'crypto';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function getSecret() {
    return (process.env.AUTH_SECRET ||
        process.env.ADMIN_PASSWORD ||
        'fe-monitor-dev-secret');
}
function b64url(input) {
    return Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
}
function fromB64url(input) {
    const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
    const b64 = input.replace(/-/g, '+').replace(/_/g, '/') + pad;
    return Buffer.from(b64, 'base64');
}
function sign(body) {
    return b64url(createHmac('sha256', getSecret()).update(body).digest());
}
export function createToken(user, ttlMs = Number(process.env.AUTH_TOKEN_TTL_MS) || DEFAULT_TTL_MS) {
    const payload = {
        username: user.username,
        role: user.role,
        exp: Date.now() + ttlMs,
    };
    const body = b64url(JSON.stringify(payload));
    return `${body}.${sign(body)}`;
}
export function verifyToken(token) {
    const parts = token.split('.');
    if (parts.length !== 2)
        return null;
    const [body, sig] = parts;
    if (!body || !sig)
        return null;
    const expected = sign(body);
    try {
        const a = Buffer.from(sig);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b))
            return null;
    }
    catch {
        return null;
    }
    try {
        const payload = JSON.parse(fromB64url(body).toString('utf8'));
        if (!payload?.username || !payload?.exp)
            return null;
        if (payload.exp < Date.now())
            return null;
        if (payload.role !== 'admin')
            return null;
        return { username: payload.username, role: 'admin' };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=tokens.js.map