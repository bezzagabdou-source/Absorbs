"""اختبارات SQLite المحلية للمعاملات والتنافس."""
import os
import tempfile
import threading
import unittest

from rabot import Store


class SQLiteFinancialTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'test.db')
        self.db = Store(self.path)
        self.user = self.db.get_or_create_user({'id': 99123, 'first_name': 'Test'})
        self.db.adjust_balance(99123, 10)
        self.pid = self.db.add_product({'name': 'Test', 'price': 3})
        self.db.add_stock_lines(self.pid, ['secret'])

    def tearDown(self):
        self.db.conn.close()
        self.tmp.cleanup()

    def race(self, operation):
        stores = [Store(self.path), Store(self.path)]
        barrier = threading.Barrier(2)
        results, errors = [], []
        def worker(db):
            try:
                barrier.wait(timeout=10)
                results.append(operation(db))
            except Exception as e:
                errors.append(e)
            finally:
                db.conn.close()
        threads = [threading.Thread(target=worker, args=(db,)) for db in stores]
        for t in threads: t.start()
        for t in threads: t.join(20)
        self.assertTrue(all(not t.is_alive() for t in threads))
        self.assertFalse(errors, errors)
        return results

    def test_offers_button_migration_only_once(self):
        button = next(b for b in self.db.buttons() if b['action'] == 'offers')
        self.db.delete_button(button['id'])
        other = Store(self.path)
        try:
            self.assertFalse(any(b['action'] == 'offers' for b in other.buttons()))
        finally:
            other.conn.close()

    def test_competing_purchase_and_refund(self):
        results = self.race(lambda db: db.purchase_atomic(99123, self.pid, 1, 0))
        self.assertEqual(sum('order_id' in r for r in results), 1)
        self.assertAlmostEqual(self.db.get_user(99123)['balance'], 7)
        oid = next(r['order_id'] for r in results if 'order_id' in r)
        results = self.race(lambda db: db.refund_order_atomic(oid, 'refunded'))
        self.assertEqual(sum(r is not None for r in results), 1)
        self.assertAlmostEqual(self.db.get_user(99123)['balance'], 10)

    def test_discount_is_used_by_transaction(self):
        self.db.set_setting('discount_percent', '20')
        result = self.db.purchase_atomic(99123, self.pid, 1, 0)
        self.assertAlmostEqual(result['total'], 2.4)
        self.assertAlmostEqual(self.db.get_user(99123)['balance'], 7.6)
        self.assertAlmostEqual(self.db.get_order(result['order_id'])['unit_price'], 2.4)

    def test_deposit_once(self):
        did = self.db.create_deposit(self.user['id'], 5, 'binance', 'test')
        results = self.race(lambda db: db.review_deposit(did, 'approved'))
        self.assertEqual(sum(r is not None for r in results), 1)
        self.assertAlmostEqual(self.db.get_user(99123)['balance'], 15)

    def test_rollback(self):
        self.db.conn.execute("CREATE TRIGGER fail_order BEFORE INSERT ON orders BEGIN SELECT RAISE(ABORT, 'injected'); END")
        self.db.conn.commit()
        with self.assertRaises(Exception):
            self.db.purchase_atomic(99123, self.pid, 1, 0)
        self.assertAlmostEqual(self.db.get_user(99123)['balance'], 10)
        self.assertEqual(self.db.product_stock(self.pid), 1)
        self.assertEqual(self.db.scalar('SELECT COUNT(*) FROM orders'), 0)

    def test_deliver_vs_refund(self):
        order = self.db.create_order(self.user['id'], self.db.product_by_id(self.pid), 1)
        # Simulate a historical paid pending order.
        self.db.debit_balance(99123, 3)
        stores = [Store(self.path), Store(self.path)]
        barrier, results, errors = threading.Barrier(2), [], []
        def worker(i):
            try:
                barrier.wait(timeout=10)
                results.append((i, stores[i].deliver_pending_atomic(order) if i == 0 else stores[i].refund_order_atomic(order, 'refunded')))
            except Exception as e:
                errors.append(e)
            finally:
                stores[i].conn.close()
        threads = [threading.Thread(target=worker, args=(i,)) for i in range(2)]
        for t in threads: t.start()
        for t in threads: t.join(20)
        self.assertTrue(all(not t.is_alive() for t in threads))
        self.assertFalse(errors, errors)
        self.assertEqual(self.db.get_order(order)['status'], 'refunded')
        self.assertIsNone(self.db.deliver_pending_atomic(order))
        self.assertAlmostEqual(self.db.get_user(99123)['balance'], 10)


if __name__ == '__main__':
    unittest.main()
