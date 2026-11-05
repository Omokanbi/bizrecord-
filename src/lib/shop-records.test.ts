import assert from 'node:assert/strict';
import test from 'node:test';
import {
  emptyShopData,
  fromShopRecords,
  toShopRecords,
  type ShopData,
  type ShopRecordRow,
} from './shop-records.ts';

test('shop records are serialized by type and restore without browser persistence', () => {
  const source: ShopData = {
    products: [{ id: 'p-1', name: 'Rice', buyingPrice: 1400, sellingPrice: 1800, quantity: 9 }],
    sales: [{ id: 's-1', createdAt: '2026-10-29T10:00:00.000Z', items: [{ productId: 'p-1', productName: 'Rice', quantity: 1, buyingPrice: 1400, sellingPrice: 1800 }], totalRevenue: 1800, costOfGoodsSold: 1400, grossProfit: 400, soldBy: 'owner@example.com' }],
    employees: [{ id: 'e-1', name: 'Staff record', role: 'Cashier', activity: 'Recorded a sale', at: '2026-10-29T10:00:00.000Z' }],
    reports: [{ date: '2026-10-29', savedAt: '2026-10-29T18:00:00.000Z', totalRevenue: 1800, totalCostOfGoodsSold: 1400, grossProfit: 400, totalQuantity: 1, productBreakdown: [{ productId: 'p-1', productName: 'Rice', quantity: 1, revenue: 1800, costOfGoodsSold: 1400, grossProfit: 400 }], expenses: [], totalExpenses: 0, netProfit: 400, openingStock: [], closingStock: [{ productId: 'p-1', productName: 'Rice', quantity: 9 }] }],
    expenses: [{ id: 'x-1', date: '2026-10-29', description: 'Transport', amount: 250, createdAt: '2026-10-29T12:00:00.000Z' }],
    creditBook: [{ id: 'c-1', saleId: 's-2', customerName: 'Customer', createdAt: '2026-10-29T11:00:00.000Z', totalAmount: 500, amountPaid: 100, soldBy: 'owner@example.com', items: [], repayments: [{ id: 'r-1', amount: 100, createdAt: '2026-10-29T14:00:00.000Z' }] }],
  };

  const records = toShopRecords(source);
  assert.deepEqual(records.map((record) => record.record_type), [
    'product', 'sale', 'employee', 'daily_report', 'expense', 'credit_entry',
  ]);
  assert.ok(records.every((record) => !('user_id' in record)), 'the browser cannot supply an owner ID');

  // The database function attaches auth.uid() to each persisted row.
  const databaseRows = records.map((record) => ({ ...record, user_id: 'authenticated-user-id' })) as ShopRecordRow[];
  assert.deepEqual(fromShopRecords(databaseRows), source);
});

test('a new account starts empty and the app does not invent demo rows', () => {
  const empty = emptyShopData();
  assert.deepEqual(empty, { products: [], sales: [], employees: [], reports: [], expenses: [], creditBook: [] });
  assert.deepEqual(toShopRecords(empty), []);
});
