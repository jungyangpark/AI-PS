import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * Guards researcher-only endpoints (student management, log download,
 * assignment registration, ...).
 *
 * - If ADMIN_KEY is set: the request must send it as the `X-Admin-Key` header
 *   or `?key=` query parameter.
 * - If ADMIN_KEY is not set: only direct requests from this machine are allowed
 *   (localhost, and not forwarded by a proxy such as ngrok or Render).
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const adminKey = process.env.ADMIN_KEY || '';
  const given = req.get('x-admin-key') || (typeof req.query.key === 'string' ? req.query.key : '');

  if (adminKey) {
    const a = Buffer.from(given);
    const b = Buffer.from(adminKey);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
      next();
      return;
    }
    res.status(403).json({ error: 'Admin key required (X-Admin-Key header or ?key=).' });
    return;
  }

  const ip = req.socket.remoteAddress || '';
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  const viaProxy = Boolean(req.get('x-forwarded-for'));
  if (isLocal && !viaProxy) {
    next();
    return;
  }
  res.status(403).json({
    error: 'Admin endpoint. Set ADMIN_KEY on the server and send it as X-Admin-Key header or ?key=.',
  });
}
