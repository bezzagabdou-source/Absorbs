"""Integration tests against a disposable local PostgreSQL via pgserver.

Run: python -m pip install 'psycopg[binary]' pgserver
     python vercel-r1himo/test_pg_store.py
"""
import json
import logging
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
os.environ.setdefault('OWNER_ID', '6818164226')
from pgserver import PostgresServer
from pg_store import PostgresStore

logging.disable(logging.CRITICAL)


class PostgreSQLTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = PostgresServer(Path(tempfile.mkdtemp()) / 'pg')
        cls.url = cls.server.get_uri()
        cls.store = PostgresStore(cls.url)

    @classmethod
    def tearDownClass(cls):
        cls.store.close()
        cls.server.cleanup()

    def test_01_defaults_and_big_telegram_id(self):
        self.assertEqual(len(self.store.buttons()), 8)
        self.assertTrue(any(b['action'] == 'offers' for b in self.store.buttons()))
        self.assertEqual(len(self.store.products()), 0)
        user = self.store.get_or_create_user({'id': 6818164226, 'first_name': 'Owner'})
        self.assertEqual(user['tg_id'], 6818164226)
        self.assertEqual(user['is_admin'], 1)

    def test_02_wallet_amounts(self):
        self.store.adjust_balance(6818164226, 10.25)
        self.assertTrue(self.store.debit_balance(6818164226, 0.05))
        self.assertAlmostEqual(self.store.get_user(6818164226)['balance'], 10.20)
        self.assertFalse(self.store.debit_balance(6818164226, 20))

    def test_03_competing_stock_claims(self):
        pid = self.store.add_product({'name': 'Concurrency test', 'price': 1})
        self.store.add_stock_lines(pid, ['one-secret'])
        barrier = threading.Barrier(2)
        result = []
        def claim(order):
            store = PostgresStore(self.url)
            try:
                barrier.wait(timeout=10)
                result.append(store.take_stock(pid, order))
            finally:
                store.close()
        threads = [threading.Thread(target=claim, args=(order,)) for order in (1, 2)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join(timeout=20)
        self.assertEqual(sorted(result, key=lambda item: item is None), ['one-secret', None])
        self.assertEqual(self.store.product_stock(pid), 0)

    def test_035_concurrent_rate_limit_is_atomic(self):
        import rabot
        barrier=threading.Barrier(2); results=[]; errors=[]
        def send():
            db=PostgresStore(self.url)
            try:
                barrier.wait(timeout=10)
                for i in range(15): results.append(db.allow_inbound(929292929,now=1203))
            except Exception as exc: errors.append(exc)
            finally: db.close()
        threads=[threading.Thread(target=send) for _ in range(2)]
        for t in threads: t.start()
        for t in threads: t.join(20)
        self.assertFalse(errors,errors)
        self.assertEqual(len(results),30)
        self.assertEqual(sum(results),rabot.RATE_LIMIT_10S)
        other=PostgresStore(self.url)
        try:
            self.assertFalse(other.allow_inbound(929292929,now=1203))
            self.assertTrue(other.allow_inbound(929292929,now=1211))
            self.assertTrue(other.allow_inbound(939393939,now=1203))
        finally: other.close()

    def test_036_purchase_token_and_deposit_proof_compete(self):
        user=self.store.get_or_create_user({'id':975310,'first_name':'Buyer'})
        other=self.store.get_or_create_user({'id':975311,'first_name':'Other'})
        self.store.adjust_balance(975310,30)
        pid=self.store.add_product({'name':'Protected','price':3})
        self.store.add_stock_lines(pid,['secret1','secret2'])
        barrier=threading.Barrier(2); results=[]; errors=[]
        def buy():
            db=PostgresStore(self.url)
            try:
                barrier.wait(timeout=10); results.append(db.purchase_atomic(975310,pid,1,0,3,'c'*32))
            except Exception as exc: errors.append(exc)
            finally: db.close()
        threads=[threading.Thread(target=buy) for _ in range(2)]
        for t in threads: t.start()
        for t in threads: t.join(20)
        self.assertFalse(errors,errors)
        self.assertEqual(sum('order_id' in r for r in results),1)
        self.assertEqual(sum(r.get('error')=='duplicate' for r in results),1)
        self.assertEqual(self.store.get_user(975310)['balance'],27)
        ids=[self.store.create_deposit(user['id'],4,'bep20','0xABCD'),self.store.create_deposit(other['id'],4,'bep20','0xabcd')]
        barrier=threading.Barrier(2); results=[]; errors=[]
        def approve(i):
            db=PostgresStore(self.url)
            try:
                barrier.wait(timeout=10); results.append(db.review_deposit(ids[i],'approved'))
            except Exception as exc: errors.append(exc)
            finally: db.close()
        threads=[threading.Thread(target=approve,args=(i,)) for i in range(2)]
        for t in threads: t.start()
        for t in threads: t.join(20)
        self.assertFalse(errors,errors)
        self.assertEqual(sum(r is not None for r in results),1)
        self.assertEqual(self.store.get_user(975310)['balance']+self.store.get_user(975311)['balance'],31)
        self.assertEqual(self.store.scalar('SELECT COUNT(*) FROM approved_deposit_proofs'),1)
        exported=json.loads(self.store.export_backup())
        self.assertIn('purchase_tokens',exported['tables'])
        self.assertIn('approved_deposit_proofs',exported['tables'])

    def test_04_persistence(self):
        self.store.set_setting('test_persistence', 'saved')
        other = PostgresStore(self.url)
        try:
            self.assertEqual(other.get_setting('test_persistence'), 'saved')
            self.assertAlmostEqual(other.get_user(6818164226)['balance'], 10.20)
        finally:
            other.close()

    def test_05_atomic_purchase_and_refund(self):
        buyers = [self.store.get_or_create_user({'id': n, 'first_name': 'Buyer'}) for n in (22001, 22002)]
        for user in buyers:
            self.store.adjust_balance(user['tg_id'], 10)
        pid = self.store.add_product({'name': 'One unit', 'price': 2})
        self.store.add_stock_lines(pid, ['delivery secret'])
        barrier, results, errors = threading.Barrier(2), [], []
        def buy(user):
            db = PostgresStore(self.url)
            try:
                barrier.wait(timeout=10)
                results.append(db.purchase_atomic(user['tg_id'], pid, 1, 0))
            except Exception as exc:
                errors.append(exc)
            finally:
                db.close()
        threads = [threading.Thread(target=buy, args=(u,)) for u in buyers]
        for t in threads: t.start()
        for t in threads: t.join(20)
        self.assertFalse(errors, errors)
        self.assertEqual(len(results), 2)
        self.assertEqual(sum('order_id' in r for r in results), 1)
        self.assertEqual(sum(r.get('error') == 'stock' for r in results), 1)
        winner = next(r for r in results if 'order_id' in r)
        self.assertEqual(winner['delivery'], 'delivery secret')
        self.assertEqual(self.store.product_stock(pid), 0)
        self.assertAlmostEqual(sum(self.store.get_user(u['tg_id'])['balance'] for u in buyers), 18)
        oid = winner['order_id']
        barrier, results, errors = threading.Barrier(2), [], []
        def refund():
            db = PostgresStore(self.url)
            try:
                barrier.wait(timeout=10)
                results.append(db.refund_order_atomic(oid, 'refunded'))
            except Exception as exc:
                errors.append(exc)
            finally:
                db.close()
        threads = [threading.Thread(target=refund) for _ in range(2)]
        for t in threads: t.start()
        for t in threads: t.join(20)
        self.assertFalse(errors, errors)
        self.assertEqual(sum(r is not None for r in results), 1)
        self.assertAlmostEqual(sum(self.store.get_user(u['tg_id'])['balance'] for u in buyers), 20)

    def test_06_atomic_deposit(self):
        user = self.store.get_or_create_user({'id': 33001, 'first_name': 'Depositor'})
        did = self.store.create_deposit(user['id'], 7, 'binance', 'transaction-123')
        barrier, results, errors = threading.Barrier(2), [], []
        def approve():
            db = PostgresStore(self.url)
            try:
                barrier.wait(timeout=10)
                results.append(db.review_deposit(did, 'approved'))
            except Exception as exc:
                errors.append(exc)
            finally:
                db.close()
        threads = [threading.Thread(target=approve) for _ in range(2)]
        for t in threads: t.start()
        for t in threads: t.join(20)
        self.assertFalse(errors, errors)
        self.assertEqual(sum(r is not None for r in results), 1)
        self.assertAlmostEqual(self.store.get_user(user['tg_id'])['balance'], 7)

    def test_065_pending_delivery_does_not_revive_refund(self):
        user = self.store.get_or_create_user({'id': 33501, 'first_name': 'Legacy'})
        self.store.adjust_balance(user['tg_id'], 6)
        pid = self.store.add_product({'name': 'Legacy order', 'price': 2})
        self.store.add_stock_lines(pid, ['legacy stock'])
        self.store.debit_balance(user['tg_id'], 2)
        oid = self.store.create_order(user['id'], self.store.product_by_id(pid), 1)
        self.assertIsNotNone(self.store.refund_order_atomic(oid, 'refunded'))
        self.assertIsNone(self.store.deliver_pending_atomic(oid))
        self.assertEqual(self.store.product_stock(pid), 1)
        self.assertEqual(self.store.get_order(oid)['status'], 'refunded')
        oid2 = self.store.create_order(user['id'], self.store.product_by_id(pid), 1)
        self.assertEqual(self.store.deliver_pending_atomic(oid2), 'legacy stock')
        self.assertEqual(self.store.get_order(oid2)['status'], 'delivered')

    def test_067_export_backup(self):
        backup = json.loads(self.store.export_backup())
        self.assertEqual(backup['format'], 'r1himo-data-v1')
        self.assertTrue(any(u['tg_id'] == 6818164226 for u in backup['tables']['users']))
        self.assertIn('orders', backup['tables'])
        self.assertIn('stock_items', backup['tables'])

    def test_068_vip_same_nonce_race(self):
        self.store.set_settings({'vip_enabled':'1','vip_price':'3','vip_days':'30','vip_percent':'20'})
        user=self.store.get_or_create_user({'id':33888,'first_name':'VIP'})
        self.store.adjust_balance(user['tg_id'],10)
        barrier, results, errors=threading.Barrier(2),[],[]
        def run():
            db=PostgresStore(self.url)
            try:
                barrier.wait(timeout=10)
                results.append(db.purchase_vip_atomic(user['tg_id'],'unique-race',3,30,20))
            except Exception as e: errors.append(e)
            finally: db.close()
        threads=[threading.Thread(target=run) for _ in range(2)]
        for t in threads: t.start()
        for t in threads: t.join(20)
        self.assertFalse(errors,errors)
        self.assertEqual(sum('expires_at' in r for r in results),1)
        self.assertEqual(self.store.get_user(user['tg_id'])['balance'],7)
        self.assertEqual(self.store.scalar('SELECT COUNT(*) FROM vip_purchases WHERE user_id=?',(user['id'],)),1)

    def test_07_purchase_rolls_back_on_database_failure(self):
        user = self.store.get_or_create_user({'id': 44001, 'first_name': 'Rollback'})
        self.store.adjust_balance(user['tg_id'], 9)
        pid = self.store.add_product({'name': 'Rollback test', 'price': 3})
        self.store.add_stock_lines(pid, ['kept'])
        raw = self.store.conn.connection
        raw.execute("CREATE FUNCTION r1_test_fail_order() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected'; END $$")
        raw.execute('CREATE TRIGGER r1_test_fail BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION r1_test_fail_order()')
        raw.commit()
        try:
            with self.assertRaises(Exception):
                self.store.purchase_atomic(user['tg_id'], pid, 1, 0)
            self.assertAlmostEqual(self.store.get_user(user['tg_id'])['balance'], 9)
            self.assertEqual(self.store.product_stock(pid), 1)
            self.assertEqual(self.store.scalar('SELECT COUNT(*) FROM orders WHERE user_id=?', (user['id'],)), 0)
        finally:
            raw.execute('DROP TRIGGER r1_test_fail ON orders')
            raw.execute('DROP FUNCTION r1_test_fail_order()')
            raw.commit()


if __name__ == '__main__':
    unittest.main()
