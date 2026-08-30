import morgan from 'morgan';

import { isProduction } from '../config/env.js';

/**
 * Backlog 0.2.3. `combined` (Apache-style, includes remote addr and user agent) in
 * production for log aggregation; `dev` (concise, colored, method+status+time) locally
 * for readability. Health checks are noisy and carry no useful signal — skipped.
 */
export const requestLogger = morgan(isProduction ? 'combined' : 'dev', {
  // `req` here is the bare `http.IncomingMessage` morgan types against, not Express's
  // `Request` — no `.path`, only `.url`.
  skip: (req) => req.url === '/health',
});
