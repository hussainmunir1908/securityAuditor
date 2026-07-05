/**
 * src/middleware/auth.ts
 * ----------------------
 * JWT verification middleware.
 *
 * Reads the `access_token` HttpOnly cookie, verifies its signature against
 * JWT_SECRET, and attaches the decoded payload to `req.user`.
 *
 * Downstream protected routes can safely read `req.user` without null checks
 * because this middleware sends a 401 before they execute.
 *
 * Usage:
 *   router.get('/protected', requireAuth, (req, res) => {
 *     res.json({ user: req.user });
 *   });
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import type { JWTPayload, AuthenticatedUser } from '../types';

/**
 * Express middleware that enforces authentication via JWT stored in a cookie.
 * Responds with 401 Unauthorized if the token is missing, expired, or invalid.
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Support both cookie-based auth (browser) and Bearer token auth (API clients)
  const tokenFromCookie: string | undefined = req.cookies?.['access_token'];
  const authHeader = req.headers['authorization'];
  const tokenFromHeader =
    authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;

  const token = tokenFromCookie ?? tokenFromHeader;

  if (!token) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'No authentication token provided.',
    });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload;

    // Attach a clean AuthenticatedUser to the request object
    req.user = {
      id: payload.sub,
      githubId: payload.githubId,
      login: payload.login,
      avatarUrl: payload.avatarUrl,
    } satisfies AuthenticatedUser;

    next();
  } catch (err) {
    const isExpired = err instanceof jwt.TokenExpiredError;
    res.status(401).json({
      error: 'Unauthorized',
      message: isExpired
        ? 'Authentication token has expired. Please log in again.'
        : 'Invalid authentication token.',
    });
  }
}
