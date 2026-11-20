// Read-only deployment diagnostic. Never log connection strings or server messages.
import pg from 'pg';
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 6000 });
try {
  if (!connectionString) throw Object.assign(new Error(), { code: 'NOT_CONFIGURED' });
  await client.connect();
  await client.query('select 1');
  console.log('Store database: reachable');
} catch (error) {
  const host = client.host || '';
  const provider = /(?:^|\.)neon\.tech$/i.test(host) ? 'Neon' : /(?:^|\.)supabase\.(com|co)$/i.test(host) ? 'Supabase' : 'PostgreSQL';
  const reasons = [
    [/tenant or user not found|tenant not found/i, 'unknown tenant or user'],
    [/password authentication failed|invalid password/i, 'rejected database credentials'],
    [/suspend|paused|disabled|inactive|compute time|quota/i, 'database suspended or quota reached'],
    [/endpoint.*not found|endpoint.*does not exist|project.*not found|database.*does not exist/i, 'unknown endpoint or database'],
    [/endpoint ID is not specified|missing endpoint/i, 'endpoint routing information required'],
    [/ssl.*required|insecure connection/i, 'TLS required'],
    [/circuit breaker|too many|pool exhausted/i, 'connection limit'],
    [/timeout|timed out/i, 'connection timeout'],
  ];
  const reason = reasons.find(([pattern]) => pattern.test(error.message))?.[1] || 'unclassified';
  console.warn('Store connection diagnostic:', provider, reason);
  console.warn('Store database check:', /^[A-Z0-9_]{2,48}$/.test(error.code) ? error.code : 'CONNECTION_FAILED');
} finally { await client.end().catch(() => {}); }
