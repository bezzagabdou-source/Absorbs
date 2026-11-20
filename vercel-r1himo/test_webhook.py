"""Local serverless integration test using disposable PostgreSQL and fake Telegram."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.parse
import urllib.request
from http.server import ThreadingHTTPServer

from pgserver import PostgresServer

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
os.environ.update(BOT_TOKEN='test-token-not-real', OWNER_ID='6818164226',
                  PANEL_PASSWORD='TestPass123',
                  VERCEL_PROJECT_PRODUCTION_URL='test-r1himo.vercel.app')
from api import index


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


class WebhookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = PostgresServer(Path(tempfile.mkdtemp()) / 'pg')
        os.environ['DATABASE_URL_UNPOOLED'] = cls.pg.get_uri()
        cls.calls = []
        cls.old_call = index.rabot.Telegram.call
        def fake_call(tg, method, timeout=30, **params):
            cls.calls.append((method, params))
            if method == 'getMe':
                return {'username': 'TestBot'}
            if method == 'setWebhook':
                return True
            return {'message_id': 123}
        index.rabot.Telegram.call = fake_call
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), index.handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:%d' % cls.http.server_port
        cls.client = urllib.request.build_opener(NoRedirect())

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.thread.join()
        index.rabot.Telegram.call = cls.old_call
        cls.pg.cleanup()

    def request(self, path, data=None, headers=None):
        req = urllib.request.Request(self.base + path, data=data, headers=headers or {})
        try:
            response = self.client.open(req, timeout=20)
        except urllib.error.HTTPError as e:
            response = e
        with response:
            return response.code, dict(response.headers), response.read()

    def test_01_health_and_authorization(self):
        status, _, body = self.request('/healthz')
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)['users'], 0)
        status, _, _ = self.request('/api/telegram', b'{}')
        self.assertEqual(status, 403)
        status, headers, _ = self.request('/panel/activate-bot', b'')
        self.assertEqual(status, 302)
        self.assertEqual(headers['Location'], '/')

    def test_02_login_and_activate(self):
        form = urllib.parse.urlencode({'password': 'TestPass123'}).encode()
        status, headers, _ = self.request('/login', form)
        self.assertEqual(status, 302)
        self.cookie = headers['Set-Cookie'].split(';')[0]
        status, _, body = self.request('/panel', headers={'Cookie': self.cookie})
        self.assertEqual(status, 200)
        self.assertIn('/panel/activate-bot', body.decode())
        status, headers, _ = self.request('/panel/activate-bot', b'', {'Cookie': self.cookie})
        self.assertEqual(status, 302)
        webhook = next(args for method, args in self.calls if method == 'setWebhook')
        self.assertEqual(webhook['url'], 'https://test-r1himo.vercel.app/api/telegram')
        self.assertEqual(webhook['secret_token'], index.webhook_secret())
        self.assertEqual(webhook['max_connections'], 1)

    def test_03_telegram_start_and_duplicate(self):
        msg = {'update_id': 42, 'message': {'message_id': 1,
            'chat': {'id': 6818164226, 'type': 'private'},
            'from': {'id': 6818164226, 'first_name': 'Owner'}, 'text': '/start'}}
        headers = {'X-Telegram-Bot-Api-Secret-Token': index.webhook_secret(),
                   'Content-Type': 'application/json'}
        self.calls.clear()
        for _ in range(2):
            status, _, body = self.request('/api/telegram', json.dumps(msg).encode(), headers)
            self.assertEqual(status, 200)
            self.assertTrue(json.loads(body)['ok'])
        sends = [p for method, p in self.calls if method == 'sendMessage']
        self.assertEqual(len(sends), 1)
        self.assertIn('لوحة التحكم', json.dumps(sends[0], ensure_ascii=False))
        status, _, body = self.request('/healthz')
        self.assertEqual(json.loads(body)['users'], 1)

    def test_04_persist_runtime_and_rewrite(self):
        with index._request_context():
            index.rabot.state_set(123, 'deposit_amount')
        index.rabot.STATE = {}  # emulate a cold instance
        with index._request_context():
            self.assertEqual(index.rabot.state_get(123)['kind'], 'deposit_amount')
        status, _, body = self.request('/api/index?__path=healthz')
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['ok'])


if __name__ == '__main__':
    unittest.main()
