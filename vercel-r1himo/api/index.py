"""Vercel adapter for the existing R1HIMO bot. Uses PostgreSQL and webhooks."""
import contextlib
import hashlib
import hmac
import io
import json
import os
import threading
import urllib.parse

os.environ['RABOT_SERVERLESS'] = '1'
# Telegram's quick-login links need a stable public base, never a request host.
production_host = os.environ.get('VERCEL_PROJECT_PRODUCTION_URL', '').strip()
if not os.environ.get('PUBLIC_URL') and production_host.endswith('.vercel.app') and '/' not in production_host and ':' not in production_host:
    os.environ['PUBLIC_URL'] = 'https://' + production_host
import rabot
from pg_store import PostgresStore

# Existing handlers use module-level globals. Protect them within one process;
# the PostgreSQL advisory lock serializes other instances as well.
_PROCESS_LOCK = threading.RLock()
_DB_LOCK = 1380534595


def webhook_secret():
    token = os.environ.get('BOT_TOKEN', '')
    if not token:
        return ''
    return hmac.new(token.encode(), b'r1himo-telegram-webhook-v1', hashlib.sha256).hexdigest()


def _restore(data):
    rabot.STATE = {int(k): v for k, v in data.get('state', {}).items()}
    rabot.PENDING_BROADCAST = {int(k): v for k, v in data.get('broadcast', {}).items()}
    rabot.SESSIONS = data.get('sessions', {})
    rabot.FLASHES = data.get('flashes', {})
    rabot.LOGIN_ATTEMPTS = data.get('login_attempts', {})


def _snapshot():
    return {'state': rabot.STATE, 'broadcast': rabot.PENDING_BROADCAST,
            'sessions': rabot.SESSIONS, 'flashes': rabot.FLASHES,
            'login_attempts': rabot.LOGIN_ATTEMPTS}


@contextlib.contextmanager
def _request_context():
    url = os.environ.get('DATABASE_URL_UNPOOLED')
    if not url:
        raise RuntimeError('DATABASE_URL_UNPOOLED is required')
    with _PROCESS_LOCK:
        store = PostgresStore(url)
        raw = store.conn.connection
        try:
            # Session-scoped: direct (unpooled) connection required.
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
            if not store.get_setting('public_url') and rabot.PUBLIC_URL:
                store.set_setting('public_url', rabot.PUBLIC_URL)
            if not store.get_setting('panel_password_hash') and rabot.PANEL_PASSWORD_ENV:
                store.set_setting('panel_password_hash', rabot.hash_password(rabot.PANEL_PASSWORD_ENV))
            rabot.init_telegram(rabot.BOT_TOKEN)
            try:
                yield store
            finally:
                # Keep multi-step conversations, login sessions and throttles across
                # cold starts. Save even after an application error.
                raw.rollback()
                raw.execute('INSERT INTO r1_runtime(id,state) VALUES(1,%s::jsonb) '
                            'ON CONFLICT(id) DO UPDATE SET state=EXCLUDED.state',
                            (json.dumps(_snapshot(), ensure_ascii=False),))
                raw.commit()
        finally:
            store.close()  # also releases the advisory lock on every exit


def _original_path(path):
    parsed = urllib.parse.urlsplit(path)
    query = urllib.parse.parse_qsl(parsed.query, keep_blank_values=True)
    routes = [v for k, v in query if k == '__path']
    if routes and parsed.path in ('/api', '/api/index'):
        path = '/' + routes[-1].lstrip('/')
        remaining = [(k, v) for k, v in query if k != '__path']
        return path + ('?' + urllib.parse.urlencode(remaining) if remaining else '')
    return path


def _public_url():
    # Never use the incoming Host header when configuring Telegram.
    host = os.environ.get('VERCEL_PROJECT_PRODUCTION_URL', '').strip()
    if not host or '/' in host or ':' in host or not host.endswith('.vercel.app'):
        raise RuntimeError('Production URL is not configured')
    return 'https://' + host


class handler(rabot.Handler):
    def _simple(self, status, obj):
        self._send(status, json.dumps(obj, ensure_ascii=False), 'application/json; charset=utf-8')

    def _run(self, method):
        self.path = _original_path(self.path)
        route = urllib.parse.urlsplit(self.path).path.rstrip('/') or '/'
        update = None
        bootstrap = False
        if route.startswith('/bootstrap-activate/'):
            key = os.environ.get('BOOTSTRAP_ACTIVATION_KEY', '')
            supplied = route.removeprefix('/bootstrap-activate/')
            if method != 'GET' or not key or not hmac.compare_digest(key, supplied):
                return self._simple(403, {'ok': False})
            bootstrap = True
        if route == '/api/telegram':
            if method != 'POST':
                return self._simple(405, {'ok': False})
            supplied = self.headers.get('X-Telegram-Bot-Api-Secret-Token', '')
            secret = webhook_secret()
            if not secret or not hmac.compare_digest(secret, supplied):
                return self._simple(403, {'ok': False})
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if size <= 0 or size > 1024 * 1024:
                    raise ValueError('invalid body size')
                update = json.loads(self.rfile.read(size))
                if not isinstance(update, dict) or not isinstance(update.get('update_id'), int):
                    raise ValueError('invalid update')
            except (ValueError, TypeError, UnicodeError):
                return self._simple(400, {'ok': False})

        # Stage the HTTP response until persistent state has been committed.
        output, self.wfile = self.wfile, io.BytesIO()
        try:
            with _request_context() as store:
                if bootstrap:
                    raw = store.conn.connection
                    raw.execute('CREATE TABLE IF NOT EXISTS r1_bootstrap (id INT PRIMARY KEY)')
                    claimed = raw.execute('INSERT INTO r1_bootstrap(id) VALUES(2) ON CONFLICT DO NOTHING RETURNING id').fetchone()
                    raw.commit()
                    if not claimed:
                        try:
                            me = rabot.tg.get_me()
                            info = rabot.tg.call('getWebhookInfo') or {}
                            self._simple(200, {'ok': True, 'stage': 'already_attempted',
                                'username': me.get('username', ''),
                                'webhook_matches': info.get('url') == _public_url() + '/api/telegram',
                                'pending_updates': info.get('pending_update_count'),
                                'last_error': info.get('last_error_message')})
                        except rabot.TgError as exc:
                            description = exc.description.lower()
                            reason = next((name for marker, name in [
                                ('certificate_verify_failed', 'certificate'), ('timed out', 'timeout'),
                                ('connection reset', 'connection_reset'), ('network:', 'network'),
                                ('invalid json', 'invalid_response')] if marker in description), 'other')
                            self._simple(200, {'ok': False, 'stage': 'telegram_error', 'code': exc.code, 'reason': reason})
                    else:
                        me = rabot.tg.get_me()
                        result = rabot.tg.call('setWebhook',
                            url=_public_url() + '/api/telegram',
                            secret_token=webhook_secret(),
                            allowed_updates=['message', 'callback_query'], max_connections=1)
                        if not result:
                            raise RuntimeError('Telegram did not accept webhook')
                        store.set_setting('bot_username', me.get('username', ''))
                        info = rabot.tg.call('getWebhookInfo') or {}
                        self._simple(200, {'ok': True, 'username': me.get('username', ''),
                                          'webhook_matches': info.get('url') == _public_url() + '/api/telegram',
                                          'pending_updates': info.get('pending_update_count'),
                                          'last_error': info.get('last_error_message')})
                elif update is not None:
                    raw = store.conn.connection
                    claimed = raw.execute(
                        'INSERT INTO r1_updates(id) VALUES(%s) ON CONFLICT DO NOTHING RETURNING id',
                        (update['update_id'],)).fetchone()
                    raw.commit()  # prevents duplicate financial operations on Telegram retry
                    if claimed:
                        if 'message' in update:
                            rabot.handle_message(update['message'])
                        elif 'callback_query' in update:
                            rabot.handle_callback(update['callback_query'])
                    self._simple(200, {'ok': True})
                elif route == '/panel/activate-bot' and method == 'POST':
                    if not self._authed():
                        self._redirect('/')
                    else:
                        me = rabot.tg.get_me()
                        result = rabot.tg.call('setWebhook',
                            url=_public_url() + '/api/telegram',
                            secret_token=webhook_secret(),
                            allowed_updates=['message', 'callback_query'],
                            max_connections=1)
                        if not result:
                            raise RuntimeError('Telegram did not accept webhook')
                        store.set_setting('bot_username', me.get('username', ''))
                        self._redirect('/panel', flash=('✅ تم تفعيل البوت في تيليغرام', 'ok'))
                elif method == 'GET':
                    self._do_get()
                else:
                    self._do_post()
            data = self.wfile.getvalue()
        except Exception:
            # Do not print tokens, PostgreSQL URLs or message payloads.
            rabot.log.error('Serverless request failed; check service configuration')
            self.wfile = io.BytesIO()
            self._simple(503, {'ok': False, 'error': 'service unavailable'})
            data = self.wfile.getvalue()
        finally:
            self.wfile = output
        self.wfile.write(data)

    def do_GET(self):
        return self._run('GET')

    def do_POST(self):
        return self._run('POST')
