"""اختبارات webhook وPostgreSQL محلياً مع Telegram وهمي دون أي اتصال بالإنتاج."""
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer
from pgserver import PostgresServer

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
os.environ.update(BOT_TOKEN='test-token-not-real', OWNER_ID='6818164226')
from api import index


class WebhookTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pg = PostgresServer(Path(tempfile.mkdtemp()) / 'pg')
        os.environ['DATABASE_URL_UNPOOLED'] = cls.pg.get_uri()
        cls.calls = []
        cls.old_call = index.rabot.Telegram.call
        def fake_call(tg, method, timeout=30, **params):
            cls.calls.append((method, params))
            return {'message_id': 123}
        index.rabot.Telegram.call = fake_call
        cls.http = ThreadingHTTPServer(('127.0.0.1', 0), index.handler)
        cls.thread = threading.Thread(target=cls.http.serve_forever, daemon=True)
        cls.thread.start()
        cls.base = 'http://127.0.0.1:%d' % cls.http.server_port

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown(); cls.http.server_close(); cls.thread.join()
        index.rabot.Telegram.call = cls.old_call
        cls.pg.cleanup()

    def request(self, path, data=None, headers=None):
        req = urllib.request.Request(self.base + path, data=data, headers=headers or {})
        try: response = urllib.request.urlopen(req, timeout=20)
        except urllib.error.HTTPError as e: response = e
        with response: return response.code, response.read()

    def update(self, uid, data):
        headers = {'X-Telegram-Bot-Api-Secret-Token': index.webhook_secret(), 'Content-Type': 'application/json'}
        status, body = self.request('/api/telegram', json.dumps({'update_id':uid, **data}).encode(), headers)
        self.assertEqual(status, 200, body)
        return json.loads(body)

    def message(self, uid, text, user=6818164226):
        return self.update(uid, {'message': {'message_id':uid, 'chat':{'id':user, 'type':'private'},
                                             'from':{'id':user, 'first_name':'Test'}, 'text':text}})

    def callback(self, uid, data, user=6818164226):
        return self.update(uid, {'callback_query': {'id':str(uid), 'from':{'id':user,'first_name':'Test'},
            'message':{'message_id':7,'chat':{'id':user,'type':'private'}},'data':data}})

    def sent(self, method):
        return [p for n,p in self.calls if n==method]

    def buttons(self):
        for name, p in reversed(self.calls):
            markup = p.get('reply_markup') or {}
            if markup.get('inline_keyboard'):
                return [b for row in markup['inline_keyboard'] for b in row]
        return []

    def test_01_health_web_removed_auth_and_duplicate(self):
        status, body=self.request('/healthz'); self.assertEqual(status,200); self.assertTrue(json.loads(body)['ok'])
        self.assertEqual(self.request('/api?__path=healthz')[0],200)
        for path in ('/', '/panel', '/login', '/panel/activate-bot'):
            self.assertEqual(self.request(path)[0],404)
        self.assertEqual(self.request('/api/telegram',b'{}')[0],403)
        self.calls.clear(); self.message(100,'/admin'); self.message(100,'/admin')
        self.assertEqual(len(self.sent('sendMessage')),1)
        self.assertIn('لوحة التحكم داخل البوت',self.sent('sendMessage')[0]['text'])
        callbacks=[b.get('callback_data') for b in self.buttons()]
        for cb in ('a:ls:p:0','a:ls:c:0','a:ls:b:0','a:ls:u:0','a:ls:o:0','a:ls:d:0','a:ls:t:0','a:ls:s:0','adm:broadcast'):
            self.assertIn(cb,callbacks)
        self.calls.clear(); self.message(101,'/admin',user=222)
        self.assertNotIn('لوحة التحكم داخل البوت',self.sent('sendMessage')[-1]['text'])

    def test_02_create_product_and_buy_across_requests(self):
        self.callback(110,'a:new:p'); self.message(111,'منتج اختباري')
        with index._request_context():
            product=next(p for p in index.rabot.store.products(include_hidden=True) if p['name']=='منتج اختباري')
            pid=product['id']; self.assertEqual(product['visible'],0)
        self.callback(112,'a:edit:p:%d:price' % pid); self.message(113,'5')
        self.callback(114,'a:stock:add:%d' % pid); self.message(115,'fake-item')
        self.callback(116,'a:toggle:p:%d:visible' % pid)
        with index._request_context(): index.rabot.store.adjust_balance(222,10)
        self.calls.clear(); self.callback(117,'confirm:%d' % pid,user=222)
        self.assertIn('تم تسليم طلبك', self.sent('editMessageText')[-1]['text'])
        with index._request_context():
            self.assertEqual(index.rabot.store.product_stock(pid),0)
            self.assertAlmostEqual(index.rabot.store.get_user(222)['balance'],5)
            order=index.rabot.store.user_orders(index.rabot.store.get_user(222)['id'])[0]
            self.assertEqual(order['delivery'],'fake-item')
        self.callback(118,'a:confirm:refund:%d' % order['id'])
        confirm=next(b['callback_data'] for b in self.buttons() if b['text']=='✅ تأكيد')
        self.callback(119,confirm); self.callback(120,confirm)
        with index._request_context(): self.assertAlmostEqual(index.rabot.store.get_user(222)['balance'],10)

    def test_02z_bot_management_crud_and_deposits(self):
        self.callback(201,'a:new:c'); self.message(202,'تصنيف جديد')
        with index._request_context():
            category=next(c for c in index.rabot.store.categories() if c['name']=='تصنيف جديد')
        self.callback(203,'a:edit:c:%d:name' % category['id']); self.message(204,'تصنيف معدل')
        self.callback(205,'a:new:b'); self.message(206,'زر عروض')
        with index._request_context():
            button=next(b for b in index.rabot.store.buttons() if b['label_ar']=='زر عروض')
            u=index.rabot.store.get_user(222)
            did=index.rabot.store.create_deposit(u['id'], 4, 'binance','fake-deposit')
        self.callback(207,'a:custom:%d:ar' % button['id']); self.message(208,'رسالة الزر')
        self.callback(209,'dep:ok:%d' % did); self.callback(210,'dep:ok:%d' % did)
        self.callback(211,'a:wallet:sub:222'); self.message(212,'2')
        with index._request_context():
            self.assertEqual(index.rabot.store.get_category(category['id'])['name'],'تصنيف معدل')
            b=index.rabot.store.get_button(button['id'])
            self.assertEqual(index.rabot.store.get_setting(b['payload']+'_ar'),'رسالة الزر')
            self.assertAlmostEqual(index.rabot.store.get_user(222)['balance'],12)

    def test_03_settings_referrals_and_discounts(self):
        with index._request_context():
            index.rabot.store.set_setting('bot_username','TestBot')
            n=next(i for i,item in enumerate(index.rabot.ADMIN_SETTINGS) if item[0]=='discount_percent')
        self.callback(130,'a:set:s:%d' % n); self.message(131,'20')
        with index._request_context(): self.assertEqual(index.rabot.store.get_setting('discount_percent'),'20')
        self.calls.clear(); self.message(132,'/referrals',user=222)
        self.assertTrue(any('t.me/share/url' in b.get('url','') and 'ref_222' in b.get('url','') for b in self.buttons()))
        self.callback(133,'a:set:s:%d' % n); self.message(134,'0')

    def test_04_broadcast_and_backup(self):
        self.callback(140,'adm:broadcast'); self.message(141,'إعلان < &')
        confirm=next(b['callback_data'] for b in self.buttons() if b['text']=='✅ تأكيد الإرسال')
        self.calls.clear(); self.callback(142,confirm)
        sends=[p for p in self.sent('sendMessage') if p.get('text')=='إعلان < &']
        self.assertEqual(len(sends),2)
        self.assertTrue(all(not p.get('parse_mode') for p in sends))
        self.calls.clear(); self.callback(143,confirm)
        self.assertFalse(any(p.get('text')=='إعلان < &' for p in self.sent('sendMessage')))
        with index._request_context() as store:
            data=json.loads(store.export_backup())
            self.assertTrue(any(u['tg_id']==222 for u in data['tables']['users']))
            old=index.rabot.urllib.request.urlopen
            payload=[]
            class Response:
                def __enter__(self): return self
                def __exit__(self,*args): return False
                def read(self): return b'{"ok":true}'
            def fake(req,timeout): payload.append(req.data); return Response()
            index.rabot.urllib.request.urlopen=fake
            try:
                self.assertTrue(index.rabot.admin_send_backup(6818164226))
                self.assertIn(b'r1himo-backup.json',payload[0])
            finally: index.rabot.urllib.request.urlopen=old

    def test_04z_broadcast_batches_survive_requests(self):
        with index._request_context():
            for uid in range(30000,30023):
                index.rabot.store.get_or_create_user({'id':uid,'first_name':'Batch'})
        self.callback(144,'adm:broadcast'); self.message(145,'إعلان متعدد')
        confirm=next(b['callback_data'] for b in self.buttons() if b['text']=='✅ تأكيد الإرسال')
        self.calls.clear(); self.callback(146,confirm)
        self.assertEqual(len([p for p in self.sent('sendMessage') if p.get('text')=='إعلان متعدد']),20)
        continuation=next(b['callback_data'] for b in self.buttons() if 'متابعة' in b['text'])
        self.calls.clear(); self.callback(147,confirm)
        self.assertFalse(any(p.get('text')=='إعلان متعدد' for p in self.sent('sendMessage')))
        self.calls.clear(); self.callback(148,continuation)
        self.assertGreater(len([p for p in self.sent('sendMessage') if p.get('text')=='إعلان متعدد']),0)
        self.assertIn('انتهى الإرسال',self.sent('sendMessage')[-1]['text'])

    def test_05_runtime_persists_and_nonowner_rejected(self):
        self.callback(150,'a:new:p',user=222)
        self.update(149, {'callback_query': {'id':'group', 'from':{'id':6818164226,'first_name':'Owner'},
            'message':{'message_id':7,'chat':{'id':-123,'type':'supergroup'}}, 'data':'a:new:p'}})
        with index._request_context():
            self.assertIsNone(index.rabot.state_get(6818164226))
            self.assertIsNone(index.rabot.state_get(222))
        self.callback(151,'a:new:b')
        index.rabot.STATE = {}
        with index._request_context():
            self.assertEqual(index.rabot.state_get(6818164226)['kind'],'admin_input')
        self.message(152,'زر جديد')
        with index._request_context():
            self.assertTrue(any(b['label_ar']=='زر جديد' for b in index.rabot.store.buttons()))


if __name__ == '__main__': unittest.main()
