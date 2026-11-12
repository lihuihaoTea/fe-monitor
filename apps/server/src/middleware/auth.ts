import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../auth/tokens.js';
import type { AuthUser } from '../auth/users.js';

export type AuthedRequest = Request & { user?: AuthUser };

function extractBearer(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim() || null;
}

/** 保护管理端 API；上报 `/api/report` 与 `/health` 不走此中间件 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = extractBearer(req);
  if (!token) {
    res.status(401).json({ error: 'unauthorized', message: '缺少登录凭证' });
    return;
  }
  const user = verifyToken(token);
  if (!user) {
    res.status(401).json({ error: 'unauthorized', message: '登录已失效，请重新登录' });
    return;
  }
  req.user = user;
  next();
}
