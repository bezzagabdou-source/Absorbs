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
        cls.member_status = {}
        cls.old_call = index.rabot.Telegram.call
        def fake_call(tg, method, timeout=30, **params):
            cls.calls.append((method, params))
            if method == 'getChatMember':
                value = cls.member_status.get((params['user_id'], params['chat_id']), {'status':'member'})
                if isinstance(value, Exception): raise value
                return value
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


    def test_06_membership_referral_and_multiline_persist(self):
        user = 444444444
        self.member_status[(user, '@rahim_vrf')] = {'status':'left'}
        self.calls.clear(); self.message(901, '/start ref_222', user=user)
        self.assertIn('joincheck', [b.get('callback_data') for b in self.buttons()])
        self.callback(902, 'a:new:p', user=user)
        with index._request_context():
            self.assertEqual(index.rabot.state_get(user)['kind'], 'join_referral')
            self.assertFalse(index.rabot.store.get_user(user)['referrer_id'])
        self.member_status[(user, '@rahim_vrf')] = index.rabot.TgError('error', 403)
        self.callback(903, 'joincheck', user=user)
        self.member_status[(user, '@rahim_vrf')] = {'status':'restricted','is_member':True}
        self.callback(904, 'joincheck', user=user)
        with index._request_context():
            self.assertEqual(index.rabot.store.get_user(user)['referrer_id'], index.rabot.store.get_user(222)['id'])
            self.assertIsNone(index.rabot.state_get(user))
        self.callback(905, 'a:new:p'); self.message(906, 'Webhook <product>')
        with index._request_context():
            pid=next(p['id'] for p in index.rabot.store.products(include_hidden=True) if p['name']=='Webhook <product>')
        self.callback(907, 'a:stock:add:%d' % pid); self.message(908, ' first\nsecret\n')
        self.callback(909, 'a:stock:batch:%d' % pid); self.message(910, 'batch1\nbatch2')
        self.callback(911, 'a:toggle:p:%d:visible' % pid)
        with index._request_context(): self.assertEqual(index.rabot.store.product_stock(pid), 3)
        self.calls.clear(); self.callback(912, 'confirm:%d' % pid, user=user)
        with index._request_context():
            order=index.rabot.store.user_orders(index.rabot.store.get_user(user)['id'])[0]
            self.assertEqual(order['delivery'], ' first\nsecret\n')
            self.assertEqual(index.rabot.store.product_stock(pid), 2)
        events=[p for p in self.sent('sendMessage') if p.get('chat_id')==-1004365740808]
        self.assertEqual(len(events), 1)
        self.assertIn('Webhook &lt;product&gt;',events[0]['text'])
        self.assertNotIn('secret',events[0]['text'])
        self.callback(912, 'confirm:%d' % pid, user=user)
        self.assertEqual(len([p for p in self.sent('sendMessage') if p.get('chat_id')==-1004365740808]), 1)



    def test_07_vip_bulk_favorites_and_payment_flow(self):
        buyer=555555555
        self.message(1001,'/start',user=buyer)
        self.callback(1002,'a:new:p'); self.message(1003,'Bulk PG')
        with index._request_context():
            pid=next(p['id'] for p in index.rabot.store.products(include_hidden=True) if p['name']=='Bulk PG')
        self.callback(1004,'a:edit:p:%d:price' % pid); self.message(1005,'10')
        self.callback(1006,'a:bulk:%d' % pid); self.message(1007,'2 7')
        self.callback(1008,'a:stock:batch:%d' % pid); self.message(1009,'one\ntwo\nthree')
        self.callback(1010,'a:toggle:p:%d:visible' % pid)
        with index._request_context() as st:
            st.adjust_balance(buyer,50)
            st.set_settings({'vip_enabled':'1','vip_price':'5','vip_days':'30','vip_percent':'20'})
        self.callback(1011,'vip',user=buyer)
        buyvip=next(b['callback_data'] for b in self.buttons() if b.get('callback_data','').startswith('vipbuy:'))
        self.calls.clear(); self.callback(1012,buyvip,user=buyer); self.callback(1013,buyvip,user=buyer)
        with index._request_context() as st:
            self.assertEqual(st.get_user(buyer)['balance'],45)
            self.assertEqual(st.scalar('SELECT COUNT(*) FROM vip_purchases'),1)
            self.assertGreater(index.rabot.vip_until(buyer),0)
        self.callback(1014,'favorite:%d' % pid,user=buyer); self.callback(1015,'favorites',user=buyer)
        self.assertIn('view:%d' % pid,[x.get('callback_data') for x in self.buttons()])
        self.callback(1016,'qty:%d' % pid,user=buyer); self.message(1017,'2',user=buyer)
        buy=next(b['callback_data'] for b in self.buttons() if b.get('callback_data','').startswith('qtybuy:'))
        self.callback(1018,buy,user=buyer); self.callback(1019,buy,user=buyer)
        with index._request_context() as st:
            self.assertEqual(st.get_user(buyer)['balance'],31)
            self.assertEqual(st.product_stock(pid),1)
            order=st.user_orders(st.get_user(buyer)['id'])[0]
            self.assertEqual((order['qty'],order['total'],order['delivery']),(2,14,'one\ntwo'))
            backup=json.loads(st.export_backup())
            self.assertIn('vip_purchases',backup['tables']); self.assertIn('favorites',backup['tables'])
        self.callback(1020,'topup',user=buyer); self.callback(1021,'paymethod:trc20',user=buyer)
        self.message(1022,'4',user=buyer); self.message(1023,'tx-proof-123',user=buyer)
        with index._request_context() as st:
            deposit=st.deposits_list(limit=1)[0]
            self.assertEqual((deposit['method'],deposit['status']),('trc20','pending'))
        self.calls.clear(); self.callback(1024,'dep:ok:%d' % deposit['id']); self.callback(1025,'dep:ok:%d' % deposit['id'])
        events=[p for p in self.sent('sendMessage') if p.get('chat_id')==-1004365740808]
        self.assertEqual(len(events),1); self.assertIn('TRC20',events[0]['text'])



    def test_08_binance_merchant_manual_review(self):
        bot=index.rabot
        saved=(bot.BINANCE_PAY_API_KEY,bot.BINANCE_PAY_API_SECRET,bot.binance_call)
        bot.BINANCE_PAY_API_KEY='fake-key'; bot.BINANCE_PAY_API_SECRET='fake-secret'
        status={'paid':False}
        def fake(path,payload):
            if path.endswith('/certificates'): return {'status':'SUCCESS','code':'000000','data':[]}
            if path.endswith('/v3/order'): return {'status':'SUCCESS','code':'000000','data':{'currency':'USDT','totalFee':'5.00','prepayId':'12345','checkoutUrl':'https://pay.binance.com/checkout/fake'}}
            return {'status':'SUCCESS','code':'000000','data':{'status':'PAID' if status['paid'] else 'PENDING','currency':'USDT','merchantTradeNo':payload['merchantTradeNo'],'transactionId':'123','orderAmount':'5'}}
        bot.binance_call=fake
        buyer=666666666
        try:
            self.message(1101,'/start',user=buyer)
            self.callback(1102,'a:binance_test'); self.callback(1103,'a:binance_toggle')
            self.callback(1104,'paymethod:binance_merchant',user=buyer); self.message(1105,'5',user=buyer)
            with index._request_context() as st:
                dep=st.deposits_list(limit=1)[0]
                self.assertEqual(dep['method'],'binance_merchant')
                self.assertEqual(st.get_user(buyer)['balance'],0)
            self.callback(1106,'dep:ok:%d' % dep['id'])
            with index._request_context() as st: self.assertEqual(st.get_user(buyer)['balance'],0)
            status['paid']=True
            self.callback(1107,'bpaycheck:%d' % dep['id'],user=buyer)
            with index._request_context() as st: self.assertEqual(st.get_user(buyer)['balance'],0)
            self.calls.clear(); self.callback(1108,'dep:ok:%d' % dep['id']); self.callback(1109,'dep:ok:%d' % dep['id'])
            with index._request_context() as st: self.assertEqual(st.get_user(buyer)['balance'],5)
            events=[p for p in self.sent('sendMessage') if p.get('chat_id')==-1004365740808]
            self.assertEqual(len(events),1)
        finally:
            bot.BINANCE_PAY_API_KEY,bot.BINANCE_PAY_API_SECRET,bot.binance_call=saved



    def test_09_quantity_selection_and_copy_quote(self):
        buyer=777777777
        self.message(1201,'/start',user=buyer)
        with index._request_context() as st:
            pid=st.add_product({'name':'One & bulk', 'price':10, 'visible':1})
            st.add_stock_lines(pid,['one','two','three'])
            st.set_settings({'bulk_min_%d' % pid:'2','bulk_price_%d' % pid:'7'})
            st.adjust_balance(buyer,50)
        self.callback(1202,'view:%d' % pid,user=buyer)
        self.assertIn('qty:%d' % pid,[b.get('callback_data') for b in self.buttons()])
        self.callback(1203,'qty:%d' % pid,user=buyer)
        self.assertIn('qtypick:%d:1' % pid,[b.get('callback_data') for b in self.buttons()])
        self.callback(1204,'qtypick:%d:1' % pid,user=buyer)
        confirm=next(b['callback_data'] for b in self.buttons() if b.get('callback_data','').startswith('qtybuy:'))
        self.calls.clear(); self.callback(1205,confirm,user=buyer); self.callback(1206,confirm,user=buyer)
        with index._request_context() as st:
            order=st.user_orders(st.get_user(buyer)['id'])[0]
            self.assertEqual((order['qty'],order['total']),(1,10))
        event=next(p for p in self.sent('sendMessage') if p.get('chat_id')==-1004365740808)
        self.assertIn('<blockquote>',event['text'])
        self.assertIn('One &amp; bulk',event['text'])
        self.assertIn('One & bulk',event['reply_markup']['inline_keyboard'][0][0]['copy_text']['text'])
        self.callback(1207,'qty:%d' % pid,user=buyer)
        self.callback(1208,'qtypick:%d:2' % pid,user=buyer)
        confirm=next(b['callback_data'] for b in self.buttons() if b.get('callback_data','').startswith('qtybuy:'))
        self.callback(1209,confirm,user=buyer)
        with index._request_context() as st:
            orders=st.user_orders(st.get_user(buyer)['id'])
            self.assertEqual(len(orders),2)
            self.assertEqual((orders[0]['qty'],orders[0]['total']),(2,14))
            self.assertEqual(st.get_user(buyer)['balance'],26)



    def test_10_reorder_order_pages_and_sort(self):
        buyer=888888888
        self.message(1500,'/start',user=buyer)
        with index._request_context() as st:
            cheap=st.add_product({'name':'PG inexpensive','price':3,'visible':1})
            high=st.add_product({'name':'PG costly','price':19,'visible':1})
            st.add_stock_lines(cheap,['pg-secret-%d' % i for i in range(13)])
            st.add_stock_lines(high,['one'])
            st.adjust_balance(buyer,100)
        self.callback(1501,'browse:low:0',user=buyer)
        names=[b.get('text','') for b in self.buttons() if b.get('callback_data','').startswith('view:')]
        self.assertTrue(any('PG inexpensive' in n for n in names))
        for i in range(11):
            self.callback(1510+i*3,'qty:%d' % cheap,user=buyer)
            self.callback(1511+i*3,'qtypick:%d:1' % cheap,user=buyer)
            confirm=next(b['callback_data'] for b in self.buttons() if b.get('callback_data','').startswith('qtybuy:'))
            self.callback(1512+i*3,confirm,user=buyer)
        self.callback(1550,'orders',user=buyer)
        self.assertIn('orders:1',[b.get('callback_data') for b in self.buttons()])
        self.callback(1551,'orders:1',user=buyer)
        oid=int(next(b['callback_data'].split(':')[1] for b in self.buttons() if b.get('callback_data','').startswith('order:')))
        self.calls.clear(); self.callback(1552,'order:%d' % oid,user=777777777)
        self.assertNotIn('pg-secret-',str(self.calls))
        self.callback(1553,'order:%d:1' % oid,user=buyer)
        self.assertIn('reorder:%d' % oid,[b.get('callback_data') for b in self.buttons()])
        self.callback(1554,'reorder:%d' % oid,user=buyer)
        self.callback(1555,'qtypick:%d:1' % cheap,user=buyer)
        confirm=next(b['callback_data'] for b in self.buttons() if b.get('callback_data','').startswith('qtybuy:'))
        self.callback(1556,confirm,user=buyer); self.callback(1557,confirm,user=buyer)
        with index._request_context() as st:
            user=st.get_user(buyer)
            self.assertEqual(len(st.user_orders(user['id'],20)),12)
            self.assertEqual(user['balance'],64)



if __name__ == '__main__': unittest.main()
