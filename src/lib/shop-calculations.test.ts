import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applySaleToStock,
  calculateDailySummary,
  calculateSaleTotals,
  isDateClosed,
  lagosDateKey,
  previousReportStock,
} from './shop-calculations.ts';

const noodles = {
  productId: 'noodles',
  productName: 'Indomie noodles',
  quantity: 1,
  buyingPrice: 430,
  sellingPrice: 550,
};

test('sale totals, day summary, product breakdown and expenses agree', () => {
  const items = [
    { ...noodles, quantity: 2 },
    { ...noodles, quantity: 1 },
    { productId: 'rice', productName: 'Rice (derica)', quantity: 1, buyingPrice: 1450, sellingPrice: 1800 },
  ];
  const saleTotals = calculateSaleTotals(items);
  assert.deepEqual(saleTotals, { totalRevenue: 3450, costOfGoodsSold: 2740, grossProfit: 710 });

  const summary = calculateDailySummary([
    {
      createdAt: '2026-10-28T23:30:00.000Z',
      items,
      ...saleTotals,
    },
    {
      createdAt: '2026-10-29T23:30:00.000Z',
      items: [{ ...noodles, quantity: 99 }],
      totalRevenue: 0,
      costOfGoodsSold: 0,
      grossProfit: 0,
    },
  ], [{ date: '2026-10-29', amount: 200 }], '2026-10-29');

  assert.equal(summary.totalRevenue, 3450);
  assert.equal(summary.totalCostOfGoodsSold, 2740);
  assert.equal(summary.grossProfit, 710);
  assert.equal(summary.totalQuantity, 4);
  assert.equal(summary.totalExpenses, 200);
  assert.equal(summary.netProfit, 510);
  assert.deepEqual(summary.productBreakdown.map(({ productName, quantity, revenue, costOfGoodsSold, grossProfit }) => ({
    productName, quantity, revenue, costOfGoodsSold, grossProfit,
  })), [
    { productName: 'Rice (derica)', quantity: 1, revenue: 1800, costOfGoodsSold: 1450, grossProfit: 350 },
    { productName: 'Indomie noodles', quantity: 3, revenue: 1650, costOfGoodsSold: 1290, grossProfit: 360 },
  ]);
});

test('duplicate product lines deduct their combined quantity from stock', () => {
  const updated = applySaleToStock([
    { id: 'noodles', name: 'Indomie noodles', quantity: 7 },
    { id: 'rice', name: 'Rice', quantity: 18 },
  ], [{ ...noodles, quantity: 2 }, { ...noodles, quantity: 1 }]);
  assert.equal(updated.find((product) => product.id === 'noodles')?.quantity, 4);
  assert.equal(updated.find((product) => product.id === 'rice')?.quantity, 18);
  assert.throws(() => applySaleToStock(
    [{ id: 'noodles', name: 'Indomie noodles', quantity: 2 }],
    [{ ...noodles, quantity: 3 }],
  ), /exceeds available stock/);
});

test('Lagos date boundary, duplicate close guard and previous close stock carry-forward', () => {
  assert.equal(lagosDateKey(new Date('2026-10-28T23:30:00.000Z')), '2026-10-29');
  assert.equal(isDateClosed([{ date: '2026-10-29' }], '2026-10-29'), true);
  assert.equal(isDateClosed([{ date: '2026-10-29' }], '2026-10-30'), false);
  const closingStock = [{ productId: 'noodles', productName: 'Indomie noodles', quantity: 4 }];
  assert.deepEqual(previousReportStock([
    { date: '2026-10-28', closingStock: [{ productId: 'noodles', productName: 'Indomie noodles', quantity: 6 }] },
    { date: '2026-10-29', closingStock },
  ], '2026-10-30'), closingStock);
});
