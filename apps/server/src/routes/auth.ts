import { Router } from 'express';
import { createToken, verifyToken } from '../auth/tokens.js';
import { verifyCredentials } from '../auth/users.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const username =
    typeof req.body?.username === 'string' ? req.body.username.trim() : '';
  const password =
    typeof req.body?.password === 'string' ? req.body.password : '';

  if (!username || !password) {
    res.status(400).json({ error: 'bad_request', message: '请输入用户名和密码' });
    return;
  }

  const user = verifyCredentials(username, password);
  if (!user) {
    res.status(401).json({ error: 'invalid_credentials', message: '用户名或密码错误' });
    return;
  }

  const token = createToken(user);
  res.json({
    token,
    user: { username: user.username, role: user.role },
  });
});

authRouter.get('/me', requireAuth, (req: AuthedRequest, res) => {
  res.json({ user: req.user });
});

/** 可选：前端携带 token 校验是否仍有效 */
authRouter.post('/verify', (req, res) => {
  const token =
    typeof req.body?.token === 'string'
      ? req.body.token
      : String(req.headers.authorization || '')
          .replace(/^Bearer\s+/i, '')
          .trim();
  const user = token ? verifyToken(token) : null;
  if (!user) {
    res.status(401).json({ valid: false });
    return;
  }
  res.json({ valid: true, user });
});
