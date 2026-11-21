"""اختبارات النسخة المستقلة بلوحة الإدارة داخل تيليغرام."""
import importlib.util
import os
import json
import subprocess
import sys
import tempfile
import threading
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

os.environ['OWNER_ID'] = '111'
os.environ.pop('BOT_TOKEN', None)
spec = importlib.util.spec_from_file_location('r1_bot_only', Path(__file__).with_name('r1himo-bot-only.py'))
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)


class FakeTelegram(bot.Telegram):
    def __init__(self):
        super().__init__('dummy')
        self.calls = []
    def call(self, method, timeout=30, **params):
        self.calls.append((method, params))
        if method == 'getChatMember':
            return {'status': 'member'}
        return {'message_id': 99}


class BotAdminTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        bot.init_store(os.path.join(self.tmp.name, 'test.db'))
        bot.tg = FakeTelegram()
        bot.STATE.clear(); bot.PENDING_BROADCAST.clear()
        self.owner = {'id': 111, 'first_name': 'Owner'}
        self.buyer = {'id': 222, 'first_name': 'Buyer'}
        self.message(self.owner, '/start')
        self.message(self.buyer, '/start')
    def tearDown(self):
        bot.store.conn.close(); self.tmp.cleanup()
    def message(self, user, text):
        bot.handle_message({'from': user, 'chat': {'id':user['id'], 'type':'private'}, 'message_id':1, 'text':text})
    def callback(self, user, data):
        bot.handle_callback({'id':'test', 'from':user, 'data':data,
            'message': {'message_id':2, 'chat':{'id':user['id'], 'type':'private'}}})
    def last_buttons(self):
        for method, p in reversed(bot.tg.calls):
            markup = p.get('reply_markup') or {}
            if markup.get('inline_keyboard'):
                return [b for row in markup['inline_keyboard'] for b in row]
        return []
    def test_admin_access_and_navigation(self):
        self.message(self.owner, '/admin')
        data = [b.get('callback_data') for b in self.last_buttons()]
        for target in ('a:ls:p:0','a:ls:c:0','a:ls:b:0','a:ls:u:0','a:ls:o:0','a:ls:d:0','a:ls:t:0','a:ls:s:0','adm:broadcast'):
            self.assertIn(target,data)
        before=bot.store.scalar('SELECT COUNT(*) FROM products')
        self.callback(self.buyer,'a:new:p')
        self.message(self.buyer,'evil')
        self.assertEqual(bot.store.scalar('SELECT COUNT(*) FROM products'),before)
        for kind in 'pcb uodstl'.replace(' ',''):
            self.callback(self.owner, 'a:ls:%s:0' % kind)
            self.assertTrue(self.last_buttons())

    def test_create_edit_stock_and_purchase(self):
        self.assertEqual(len(bot.store.products()),0)
        self.callback(self.owner,'a:new:p'); self.message(self.owner,'بطاقة جديدة')
        product=bot.store.products(include_hidden=True)[0]; pid=product['id']
        self.assertEqual(product['visible'],0)
        self.callback(self.owner,'a:edit:p:%d:price' % pid); self.message(self.owner,'5.25')
        self.callback(self.owner,'a:edit:p:%d:description' % pid); self.message(self.owner,'وصف جيد')
        self.callback(self.owner,'a:stock:add:%d' % pid); self.message(self.owner,'secret-one\nsecret-two')
        self.callback(self.owner,'a:toggle:p:%d:visible' % pid)
        self.assertEqual(bot.store.product_stock(pid),1)
        self.assertEqual(bot.store.product_by_id(pid)['price'],5.25)
        bot.store.adjust_balance(222,10)
        self.callback(self.buyer,'confirm:%d' % pid)
        self.assertEqual(bot.store.product_stock(pid),0)
        self.assertEqual(bot.store.get_user(222)['balance'],4.75)
        order=bot.store.user_orders(bot.store.get_user(222)['id'])[0]
        self.assertEqual(order['delivery'],'secret-one\nsecret-two')
        self.assertEqual(order['status'],'delivered')
        self.callback(self.owner,'a:confirm:refund:%d' % order['id'])
        confirm=next(b['callback_data'] for b in self.last_buttons() if b['text']=='✅ تأكيد')
        self.callback(self.owner,confirm); self.callback(self.owner,confirm)
        self.assertEqual(bot.store.get_user(222)['balance'],10)

    def test_categories_buttons_settings_and_user(self):
        self.callback(self.owner,'a:new:c'); self.message(self.owner,'تصنيف خاص')
        cat=next(c for c in bot.store.categories() if c['name']=='تصنيف خاص')
        self.callback(self.owner,'a:edit:c:%d:name' % cat['id']); self.message(self.owner,'تصنيف معدل')
        self.assertEqual(bot.store.get_category(cat['id'])['name'],'تصنيف معدل')
        self.callback(self.owner,'a:new:b'); self.message(self.owner,'زر تجريبي')
        button=next(b for b in bot.store.buttons() if b['label_ar']=='زر تجريبي')
        self.callback(self.owner,'a:custom:%d:ar' % button['id']); self.message(self.owner,'الرسالة المخصصة')
        button=bot.store.get_button(button['id'])
        self.assertEqual(button['action'],'text')
        self.assertEqual(bot.store.get_setting(button['payload']+'_ar'),'الرسالة المخصصة')
        setting_index=next(i for i,v in enumerate(bot.ADMIN_SETTINGS) if v[0]=='discount_percent')
        self.callback(self.owner,'a:set:s:%d' % setting_index); self.message(self.owner,'15')
        self.assertEqual(bot.store.get_setting('discount_percent'),'15')
        self.callback(self.owner,'a:wallet:add:222'); self.message(self.owner,'5')
        self.callback(self.owner,'a:wallet:sub:222'); self.message(self.owner,'2')
        self.assertEqual(bot.store.get_user(222)['balance'],3)
        self.callback(self.owner,'a:wallet:sub:222'); self.message(self.owner,'50')
        self.assertEqual(bot.store.get_user(222)['balance'],3)
        self.message(self.owner,'/cancel')
        self.callback(self.owner,'a:user:ban:222'); self.assertEqual(bot.store.get_user(222)['banned'],1)
        self.callback(self.owner,'a:user:ban:222'); self.assertEqual(bot.store.get_user(222)['banned'],0)

    def test_deposit_and_broadcast(self):
        u=bot.store.get_user(222)
        did=bot.store.create_deposit(u['id'],7,'binance','tx-test')
        self.callback(self.owner,'a:item:d:%d' % did)
        self.callback(self.owner,'dep:ok:%d' % did)
        self.callback(self.owner,'dep:ok:%d' % did)
        self.assertEqual(bot.store.get_user(222)['balance'],7)
        self.callback(self.owner,'adm:broadcast'); self.message(self.owner,'أهلاً < &')
        confirm=next(b['callback_data'] for b in self.last_buttons() if b['text']=='✅ تأكيد الإرسال')
        bot.tg.calls.clear(); self.callback(self.owner,confirm)
        sends=[p for name,p in bot.tg.calls if name=='sendMessage' and p.get('text')=='أهلاً < &']
        self.assertEqual(len(sends),2)
        self.assertTrue(all(not p.get('parse_mode') for p in sends))
        self.assertEqual(bot.store.scalar('SELECT COUNT(*) FROM broadcasts'),1)

    def test_membership_gate_and_referral(self):
        original = bot.tg.call
        status = {'@rahimo_store': {'status': 'member'}, '@rahim_vrf': {'status': 'left'}}
        def call(method, timeout=30, **params):
            if method == 'getChatMember':
                value = status[params['chat_id']]
                if isinstance(value, Exception): raise value
                bot.tg.calls.append((method, params))
                return value
            return original(method, timeout=timeout, **params)
        bot.tg.call = call
        newcomer = {'id': 333333333, 'first_name': 'New'}
        self.message(newcomer, '/start ref_222')
        self.assertFalse(bot.store.get_user(newcomer['id'])['referrer_id'])
        self.assertIn('joincheck', [b.get('callback_data') for b in self.last_buttons()])
        urls = [b.get('url') for b in self.last_buttons()]
        self.assertIn('https://t.me/rahimo_store', urls)
        self.assertIn('https://t.me/rahim_vrf', urls)
        self.callback(newcomer, 'a:new:p')
        self.assertEqual(bot.store.scalar('SELECT COUNT(*) FROM products'), 0)
        status['@rahim_vrf'] = bot.TgError('unavailable', 403)
        self.callback(newcomer, 'joincheck')
        self.assertFalse(bot.store.get_user(newcomer['id'])['referrer_id'])
        status['@rahim_vrf'] = {'status': 'restricted', 'is_member': False}
        self.assertEqual(bot.membership_check(newcomer['id']), (False, False))
        status['@rahim_vrf'] = {'status': 'restricted', 'is_member': True}
        self.callback(newcomer, 'joincheck')
        self.assertEqual(bot.store.get_user(newcomer['id'])['referrer_id'], bot.store.get_user(222)['id'])
        self.assertIsNone(bot.state_get(newcomer['id']))

    def test_stock_batch_single_and_public_events(self):
        self.callback(self.owner, 'a:new:p'); self.message(self.owner, 'Product <&')
        pid = bot.store.products(include_hidden=True)[0]['id']
        self.callback(self.owner, 'a:edit:p:%d:price' % pid); self.message(self.owner, '1')
        self.callback(self.owner, 'a:stock:add:%d' % pid); self.message(self.owner, ' /secret\nline 2\n')
        self.assertEqual(bot.store.product_stock(pid), 1)
        self.assertEqual(bot.store.stock_list(pid)[0]['content'], ' /secret\nline 2\n')
        self.callback(self.owner, 'a:stock:batch:%d' % pid); self.message(self.owner, 'x\ny')
        self.assertEqual(bot.store.product_stock(pid), 3)
        self.callback(self.owner, 'a:toggle:p:%d:visible' % pid)
        bot.store.adjust_balance(222, 1)
        bot.tg.calls.clear(); self.callback(self.buyer, 'confirm:%d' % pid)
        order = bot.store.user_orders(bot.store.get_user(222)['id'])[0]
        self.assertEqual(order['delivery'], ' /secret\nline 2\n')
        events = [p for m,p in bot.tg.calls if m == 'sendMessage' and p.get('chat_id') == -1004365740808]
        self.assertEqual(len(events), 1)
        self.assertIn('Product &lt;&amp;', events[0]['text'])
        self.assertNotIn('secret', events[0]['text'])
        self.callback(self.buyer, 'confirm:%d' % pid)  # insufficient balance
        self.assertEqual(len([p for m,p in bot.tg.calls if m == 'sendMessage' and p.get('chat_id') == -1004365740808]), 1)
        did = bot.store.create_deposit(bot.store.get_user(222)['id'], 7, 'custom <&', 'private-tx')
        self.callback(self.owner, 'dep:ok:%d' % did); self.callback(self.owner, 'dep:ok:%d' % did)
        events = [p for m,p in bot.tg.calls if m == 'sendMessage' and p.get('chat_id') == -1004365740808]
        self.assertEqual(len(events), 2)
        self.assertIn('custom &lt;&amp;', events[-1]['text'])
        self.assertNotIn('private-tx', events[-1]['text'])

    def test_backup_contains_sqlite_snapshot(self):
        original = bot.urllib.request.urlopen
        payloads=[]
        class Response:
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return b'{"ok":true}'
        def fake_open(request, timeout):
            payloads.append(request.data)
            return Response()
        bot.urllib.request.urlopen = fake_open
        try:
            self.assertTrue(bot.admin_send_backup(111))
            self.assertIn(b'SQLite format 3',payloads[0])
        finally: bot.urllib.request.urlopen=original

    def test_backup_owner_only_and_nonce(self):
        self.callback(self.owner,'a:confirm:backup:0')
        confirm=next(b['callback_data'] for b in self.last_buttons() if b['text']=='✅ تأكيد')
        original=bot.admin_send_backup; calls=[]
        bot.admin_send_backup=lambda uid: calls.append(uid) or True
        try:
            self.callback(self.buyer,confirm)
            self.callback(self.owner,confirm)
            self.callback(self.owner,confirm)
            self.assertEqual(calls,[111])
        finally: bot.admin_send_backup=original


class StandaloneBootTest(unittest.TestCase):
    def test_real_process_with_fake_telegram(self):
        done = threading.Event()
        received=[]
        class Handler(BaseHTTPRequestHandler):
            sent = False
            def log_message(self,*args): pass
            def do_POST(self):
                n=int(self.headers['Content-Length'])
                body=json.loads(self.rfile.read(n))
                method=self.path.rsplit('/',1)[-1]
                if method=='getMe': result={'id':123,'username':'TestBot'}
                elif method=='getChatMember': result={'status':'member'}
                elif method=='getUpdates':
                    if not Handler.sent:
                        Handler.sent=True
                        result=[{'update_id':10,'message':{'message_id':1,'from':{'id':111,'first_name':'Owner'},'chat':{'id':111,'type':'private'},'text':'/admin'}}]
                    else: result=[]
                else:
                    result={'message_id':1}
                    if method=='sendMessage':
                        received.append(body)
                        if 'لوحة التحكم داخل البوت' in body.get('text',''): done.set()
                data=json.dumps({'ok':True,'result':result}).encode()
                self.send_response(200); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
        server=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        thread=threading.Thread(target=server.serve_forever,daemon=True); thread.start()
        try:
            with tempfile.TemporaryDirectory() as temp:
                env=os.environ.copy()
                env.update(BOT_TOKEN='test-token',OWNER_ID='111',BOT_API_BASE='http://127.0.0.1:%d' % server.server_port,DB_PATH=os.path.join(temp,'bot.db'))
                process=subprocess.Popen([sys.executable,str(Path(__file__).with_name('r1himo-bot-only.py'))],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                try:
                    self.assertTrue(done.wait(8),'admin response not received')
                    self.assertTrue(os.path.exists(os.path.join(temp,'bot.db')))
                    buttons=[b for row in received[-1]['reply_markup']['inline_keyboard'] for b in row]
                    self.assertTrue(any(b.get('callback_data')=='a:ls:p:0' for b in buttons))
                finally:
                    process.terminate(); process.wait(timeout=5)
        finally:
            server.shutdown(); server.server_close(); thread.join()


if __name__=='__main__': unittest.main()
