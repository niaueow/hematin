// The one Vercel Function. vercel.json rewrites every /api/* request here; req.url keeps the
// original path, so Express routes on /api/... as usual. Relative imports only (DECISIONS D-022).
import { createApp } from '../server/app.js';
import { getEnv } from '../server/env.js';

// Fail fast on boot: a missing or invalid env var stops the function with a message listing the keys.
const env = getEnv();

export default createApp({ version: env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'unknown' });
