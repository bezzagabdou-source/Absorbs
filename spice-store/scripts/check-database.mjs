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
  console.warn('Store database check:', /^[A-Z0-9_]{2,48}$/.test(error.code) ? error.code : 'CONNECTION_FAILED');
} finally { await client.end().catch(() => {}); }
