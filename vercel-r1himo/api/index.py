"""Vercel webhook adapter: Telegram administration only, PostgreSQL persistence."""
import contextlib
import hashlib
import hmac
import json
import os
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler

import rabot
from pg_store import PostgresStore

_PROCESS_LOCK = threading.RLock()
_DB_LOCK = 1380534595


def webhook_secret():
    token = os.environ.get('BOT_TOKEN', '')
    return hmac.new(token.encode(), b'r1himo-telegram-webhook-v1', hashlib.sha256).hexdigest() if token else ''


def _restore(data):
    rabot.STATE = {int(k): v for k, v in data.get('state', {}).items()}
    rabot.PENDING_BROADCAST = {int(k): v for k, v in data.get('broadcast', {}).items()}


def _snapshot():
    return {'state': rabot.STATE, 'broadcast': rabot.PENDING_BROADCAST}


@contextlib.contextmanager
def _request_context():
    url = os.environ.get('DATABASE_URL_UNPOOLED')
    if not url:
        raise RuntimeError('DATABASE_URL_UNPOOLED is required')
    with _PROCESS_LOCK:
        store = PostgresStore(url)
        raw = store.conn.connection
        try:
            # Session lock remains held across commits and serializes instances.
            raw.execute('SELECT pg_advisory_lock(%s)', (_DB_LOCK,))
            raw.commit()
            store._load_settings()
            raw.execute('CREATE TABLE IF NOT EXISTS r1_runtime (id INT PRIMARY KEY, state JSONB NOT NULL)')
            raw.execute('CREATE TABLE IF NOT EXISTS r1_updates (id BIGINT PRIMARY KEY, received_at TIMESTAMPTZ DEFAULT now())')
            raw.commit()
            row = raw.execute('SELECT state FROM r1_runtime WHERE id=1').fetchone()
            _restore(row['state'] if row else {})
            rabot.store = store
            if not store.get_setting('owner_ids') and rabot.OWNER_ID_ENV:
                store.set_setting('owner_ids', rabot.OWNER_ID_ENV)
            rabot.init_telegram(rabot.BOT_TOKEN)
            try:
                yield store
            finally:
                raw.rollback()
                raw.execute('INSERT INTO r1_runtime(id,state) VALUES(1,%s::jsonb) '
                            'ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state',
                            (json.dumps(_snapshot(), ensure_ascii=False),))
                raw.commit()
        finally:
            store.close()


def _original_path(path):
    parsed = urllib.parse.urlsplit(path)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    routes = [v for k, v in query if k == '__path']
    if routes and parsed.path in ('/api', '/api/index'):
        return '/' + routes[-1].lstrip('/')
    return parsed.path


class handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def _simple(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _run(self, method):
        route = _original_path(self.path).rstrip('/') or '/'
        if route not in ('/healthz', '/api/telegram'):
            return self._simple(404, {'ok': False, 'error': 'not found'})
        if (route == '/healthz' and method != 'GET') or (route == '/api/telegram' and method != 'POST'):
            return self._simple(405, {'ok': False})
        # Public liveness must not expose store data or acquire the DB/advisory lock.
        if route == '/healthz':
            return self._simple(200, {'ok': True})
        update = None
        if route == '/api/telegram':
            tokens = self.headers.get_all('X-Telegram-Bot-Api-Secret-Token', [])
            supplied = tokens[0] if len(tokens) == 1 else ''
            secret = webhook_secret()
            if not secret or not supplied.isascii() or not hmac.compare_digest(secret, supplied):
                return self._simple(403, {'ok': False})
            try:
                lengths = self.headers.get_all('Content-Length', [])
                if len(lengths) != 1 or not lengths[0].isdigit():
                    raise ValueError('invalid content length')
                size = int(lengths[0])
                if size <= 0 or size > 256 * 1024:
                    raise ValueError('invalid body size')
                update = json.loads(self.rfile.read(size))
                if not isinstance(update, dict) or type(update.get('update_id')) is not int or not 0 <= update['update_id'] < 2**63:
                    raise ValueError('invalid update')
            except (ValueError, TypeError, UnicodeError, RecursionError):
                return self._simple(400, {'ok': False})
            if rabot.incoming_actor(update) is None:
                return self._simple(200, {'ok': True})
        try:
            with _request_context() as store:
                if update is not None:
                    raw = store.conn.connection
                    claimed = raw.execute('INSERT INTO r1_updates(id) VALUES(%s) ON CONFLICT DO NOTHING RETURNING id',
                                          (update['update_id'],)).fetchone()
                    # Prevent repeated purchases on retries. A failure after this
                    # commit can still lose an update; see README limitations.
                    raw.commit()
                    if claimed:
                        rabot.on_update(update)
                    result = {'ok': True}
                else:
                    result = {'ok': True, 'app': rabot.APP_NAME, 'version': rabot.APP_VERSION,
                              'bot': store.get_setting('bot_username', ''), 'users': store.users_count(),
                              'time': rabot.now_iso()}
            return self._simple(200, result)
        except Exception:
            # Do not log credentials or customer content.
            rabot.log.error('Serverless request failed; check service configuration')
            return self._simple(503, {'ok': False, 'error': 'service unavailable'})

    def do_GET(self):
        return self._run('GET')

    def do_POST(self):
        return self._run('POST')
