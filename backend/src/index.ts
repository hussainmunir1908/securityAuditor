/**
 * src/index.ts
 * ------------
 * Express application entry point for the Agentic RAG Security Auditor backend.
 *
 * Sets up:
 *   - CORS (allowing requests from the Next.js frontend)
 *   - JSON body parsing
 *   - Cookie parsing (for reading the JWT HttpOnly cookie)
 *   - Morgan HTTP request logging
 *   - API route mounting (/api/auth, /api/ingest, /api/scan)
 *   - Global error handler
 *   - Health-check endpoint
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env';

// Route handlers
import authRouter from './routes/auth';
import ingestRouter from './routes/ingest';
import scanRouter from './routes/scan';

const app: Application = express();

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * CORS configuration.
 * Allows the Next.js frontend to send credentialed requests (cookies).
 * The `credentials: true` flag is required for HttpOnly cookie-based auth.
 */
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true, // Required for cookies to be sent cross-origin
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Parse incoming JSON request bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies (for form submissions)
app.use(express.urlencoded({ extended: true }));

// Parse cookies — required to read the 'access_token' HttpOnly cookie
app.use(cookieParser());

// HTTP request logging
// Use 'dev' format in development (colourised), 'combined' (Apache format) in production
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * Health check — allows load balancers and monitoring tools to verify
 * the service is up without authenticating.
 */
app.get('/health', (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    service: 'agentic-rag-security-auditor-api',
    timestamp: new Date().toISOString(),
  });
});

// Mount routers under the /api prefix
app.use('/api/auth', authRouter);
app.use('/api/ingest', ingestRouter);
app.use('/api/scan', scanRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────

app.use((_req: Request, res: Response): void => {
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested endpoint does not exist.',
  });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────

/**
 * Catches any unhandled errors thrown by route handlers.
 * The four-parameter signature is required by Express to identify this
 * as an error-handling middleware.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('[server] Unhandled error:', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message:
      env.NODE_ENV === 'development'
        ? err.message
        : 'An unexpected error occurred.',
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(env.PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║   Agentic RAG Security Auditor — Backend API         ║
║   Environment : ${env.NODE_ENV.padEnd(35)}║
║   Listening   : http://localhost:${env.PORT.toString().padEnd(20)}║
║   Frontend    : ${env.FRONTEND_URL.padEnd(35)}║
╚══════════════════════════════════════════════════════╝
  `);
});

export default app;
