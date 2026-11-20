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
        status, _, body = self.request('/api?__path=healthz')
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)['ok'])

    def update(self, uid, data):
        headers = {'X-Telegram-Bot-Api-Secret-Token': index.webhook_secret(), 'Content-Type': 'application/json'}
        status, _, body = self.request('/api/telegram', json.dumps({'update_id': uid, **data}).encode(), headers)
        self.assertEqual(status, 200, body)
        return json.loads(body)

    def message(self, uid, text, user=6818164226):
        return self.update(uid, {'message': {'message_id': uid, 'chat': {'id': user, 'type': 'private'},
                           'from': {'id': user, 'first_name': 'Test'}, 'text': text}})

    def callback(self, uid, data, user=6818164226):
        return self.update(uid, {'callback_query': {'id': str(uid), 'from': {'id': user, 'first_name': 'Test'},
            'message': {'message_id': 7, 'chat': {'id': user, 'type': 'private'}}, 'data': data}})

    def sent(self, method):
        return [params for name, params in self.calls if name == method]

    def test_05_pagination_and_return(self):
        self.calls.clear()
        self.message(100, '/products')
        rows = self.sent('sendMessage')[-1]['reply_markup']['inline_keyboard']
        buttons = [b for row in rows for b in row]
        self.assertTrue(any(b.get('callback_data') == 'pg:1' for b in buttons))
        self.assertTrue(any(b.get('callback_data') == 'close' for b in buttons))
        self.assertTrue(any(b.get('callback_data') == 'search' for b in buttons))
        self.calls.clear()
        self.callback(101, 'pg:1')
        rows = self.sent('editMessageText')[-1]['reply_markup']['inline_keyboard']
        item = next(b for row in rows for b in row if b.get('callback_data', '').startswith('view:'))
        self.calls.clear()
        self.callback(102, item['callback_data'])
        buttons = [b for row in self.sent('editMessageText')[-1]['reply_markup']['inline_keyboard'] for b in row]
        self.assertTrue(any(b.get('callback_data') == 'pg:1' for b in buttons))
        self.calls.clear()
        self.callback(103, 'listen:0')
        self.assertTrue(self.sent('deleteMessage'))
        self.assertIn('keyboard', self.sent('sendMessage')[-1]['reply_markup'])

    def test_06_cancel_and_admin_broadcast(self):
        self.calls.clear()
        self.message(110, '/admin')
        self.assertIn('لوحة تحكم المالك', self.sent('sendMessage')[-1]['text'])
        self.calls.clear()
        self.message(111, '/admin', user=222)
        self.assertNotIn('لوحة تحكم المالك', self.sent('sendMessage')[-1]['text'])
        self.callback(112, 'adm:broadcast')
        self.calls.clear()
        self.message(113, '❌ إلغاء')
        self.assertIn('keyboard', self.sent('sendMessage')[-1]['reply_markup'])
        self.assertFalse(any('❌ إلغاء' == x.get('text') for x in self.sent('sendMessage')))
        with index._request_context():
            self.assertNotIn(6818164226, index.rabot.PENDING_BROADCAST)
        self.callback(114, 'adm:broadcast')
        self.calls.clear()
        self.message(115, 'إعلان تجريبي')
        sends = self.sent('sendMessage')
        self.assertEqual(len(sends), 1)
        self.assertIn('معاينة', sends[0]['text'])
        self.assertEqual(sends[0]['chat_id'], 6818164226)
        self.calls.clear()
        self.callback(116, 'cancel')
        self.assertIn('keyboard', self.sent('sendMessage')[-1]['reply_markup'])
        self.assertEqual(len(self.sent('sendMessage')), 1)
        with index._request_context():
            self.assertNotIn(6818164226, index.rabot.PENDING_BROADCAST)

    def test_065_broadcast_confirmation_and_replay(self):
        self.callback(117, 'adm:broadcast')
        self.calls.clear()
        self.message(118, 'إعلان بعد التأكيد')
        preview = self.sent('sendMessage')[-1]
        confirm = preview['reply_markup']['inline_keyboard'][0][0]['callback_data']
        self.calls.clear()
        self.callback(119, 'adm:send_broadcast:wrong')
        self.assertFalse(any(p.get('text') == 'إعلان بعد التأكيد' for p in self.sent('sendMessage')))
        self.calls.clear()
        self.callback(125, confirm, user=222)
        self.assertFalse(any(p.get('text') == 'إعلان بعد التأكيد' for p in self.sent('sendMessage')))
        self.calls.clear()
        self.callback(126, confirm)
        self.assertTrue(any(p.get('text') == 'إعلان بعد التأكيد' for p in self.sent('sendMessage')))
        self.calls.clear()
        self.callback(127, confirm)
        self.assertFalse(any(p.get('text') == 'إعلان بعد التأكيد' for p in self.sent('sendMessage')))

    def test_07_search_and_custom_button(self):
        self.calls.clear()
        self.message(120, '/search')
        self.message(121, 'Netflix')
        self.assertTrue(any('نتائج البحث' in p.get('text', '') for p in self.sent('sendMessage')))
        with index._request_context():
            result = index.rabot.page_buttons_save({'label_ar': ['عروض'], 'action': ['text'],
                'custom_text_ar': ['نص العرض'], 'color': ['danger']})
            self.assertIn('تمت إضافة', result[1])
            button = next(b for b in index.rabot.store.buttons() if b['label_ar'] == 'عروض')
            self.assertEqual(button['color'], 'danger')
            self.assertEqual(index.rabot.store.get_setting(button['payload'] + '_ar'), 'نص العرض')
            self.assertIn('نص العرض', index.rabot.page_buttons({'edit': [str(button['id'])]}))
        self.calls.clear()
        self.message(122, 'عروض', user=222)
        self.assertIn('نص العرض', self.sent('sendMessage')[-1]['text'])

    def test_075_panel_pages_and_search_cancel(self):
        form = urllib.parse.urlencode({'password': 'TestPass123'}).encode()
        status, headers, _ = self.request('/login', form)
        self.assertEqual(status, 302)
        cookie = headers['Set-Cookie'].split(';')[0]
        for path in ('/panel', '/panel/buttons', '/panel/products', '/panel/categories', '/panel/orders',
                     '/panel/deposits', '/panel/users', '/panel/texts', '/panel/payments',
                     '/panel/settings', '/panel/broadcast', '/bot-preview'):
            status, _, body = self.request(path, headers={'Cookie': cookie})
            self.assertEqual(status, 200, path)
            self.assertNotIn('حدث خطأ أثناء عرض الصفحة', body.decode(), path)
        self.message(123, '/search')
        self.calls.clear()
        self.message(124, '❌ إلغاء')
        self.assertIn('keyboard', self.sent('sendMessage')[-1]['reply_markup'])
        with index._request_context():
            self.assertIsNone(index.rabot.state_get(6818164226))

    def test_078_atomic_purchase_via_webhook(self):
        with index._request_context():
            buyer = index.rabot.store.get_user(222)
            index.rabot.store.adjust_balance(222, 10)
            pid = index.rabot.store.add_product({'name': 'Test purchase', 'price': 3})
            index.rabot.store.add_stock_lines(pid, ['fake delivery'])
        self.calls.clear()
        self.callback(200, 'confirm:%d' % pid, user=222)
        self.assertTrue(any('تم تسليم طلبك' in c.get('text', '') for c in self.sent('editMessageText')))
        with index._request_context():
            self.assertAlmostEqual(index.rabot.store.get_user(222)['balance'], 7)
            order = index.rabot.store.user_orders(buyer['id'], 1)[0]
            self.assertEqual(order['delivery'], 'fake delivery')
            self.assertEqual(order['status'], 'delivered')
            self.assertEqual(index.rabot.store.product_stock(pid), 0)

    def test_08_one_time_password_reset(self):
        old_password = index.rabot.PANEL_PASSWORD_ENV
        try:
            index.rabot.PANEL_PASSWORD_ENV = 'new-test-password'
            os.environ['PANEL_PASSWORD_RESET_VERSION'] = 'test-reset-1'
            with index._request_context():
                self.assertTrue(index.rabot.check_panel_password('new-test-password'))
                self.assertFalse(index.rabot.check_panel_password(old_password))
                index.rabot.store.set_setting('panel_password_hash', index.rabot.hash_password('changed-in-panel'))
            with index._request_context():
                self.assertTrue(index.rabot.check_panel_password('changed-in-panel'))
                self.assertFalse(index.rabot.check_panel_password('new-test-password'))
        finally:
            os.environ.pop('PANEL_PASSWORD_RESET_VERSION', None)
            index.rabot.PANEL_PASSWORD_ENV = old_password


if __name__ == '__main__':
    unittest.main()
