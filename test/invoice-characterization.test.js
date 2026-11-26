const test = require('node:test');
const assert = require('node:assert/strict');

const invoice = require('../lib/invoice');
const pricing = require('../lib/pricing');
const reports = require('../lib/reports');
const tax = require('../lib/tax');

test('invoice uses the billed HSN slab rate', function () {
  const items = [{ id: 1, name: 'Rice', sku: 'RICE', hsn: '1006', price: 100, qty: 1 }];
  const billed = pricing.computeTotals(items, '');
  const printed = invoice.computeInvoiceFigures({ items: items, total: billed.total, tax: billed.tax });

  assert.equal(billed.tax, 5);
  assert.equal(billed.total, 105);
  assert.equal(printed.rows[0].gstPercent, 5);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.total, billed.total);
});

test('invoice applies the billed coupon discount before calculating GST', function () {
  const items = [{ id: 1, name: 'Tea', sku: 'TEA', hsn: '0902', price: 600, qty: 1 }];
  const billed = pricing.computeTotals(items, 'SAVE10');
  const printed = invoice.computeInvoiceFigures({ items: items, coupon: 'SAVE10', total: billed.total, tax: billed.tax });

  assert.equal(billed.subtotal, 600);
  assert.equal(billed.discount, 60);
  assert.equal(billed.tax, 97.2);
  assert.equal(billed.total, 637.2);
  assert.equal(printed.discount, billed.discount);
  assert.equal(printed.tax, billed.tax);
  assert.equal(printed.total, billed.total);
  assert.equal(printed.rows[0].lineTax, billed.lines[0].tax);
});

test('invoice computes half-cent GST with the shared CGST and SGST split', function () {
  const order = {
    items: [{ name: 'Item', price: 1, qty: 1, gstRate: 5 }],
    subtotal: 999,
    discount: 123,
    tax: 456,
    total: 789
  };
  const printed = invoice.computeInvoiceFigures(order);

  assert.deepEqual({ cgst: printed.cgst, sgst: printed.sgst }, { cgst: 0.03, sgst: 0.02 });
  assert.deepEqual(tax.splitCgstSgst(0.05), { cgst: 0.03, sgst: 0.02 });
});

test('GST reconciliation matches invoice figures to stored ledger figures', function () {
  const db = {
    orders: [
      { id: 12, date: '2026-01-02', customer: 'A Customer', items: [{ name: 'Rice', price: 100, qty: 1, hsn: '1006' }], subtotal: 100, discount: 0, tax: 5, total: 105 },
      { id: 13, date: '2026-01-03', status: 'cancelled', items: [{ name: 'Rice', price: 100, qty: 1, hsn: '1006' }], subtotal: 100, discount: 0, tax: 5, total: 105 }
    ]
  };
  const recon = reports.getGstReconciliation(db);

  assert.equal(recon.totalChecked, 1);
  assert.equal(recon.mismatchCount, 0);
  assert.equal(recon.totalDelta, 0);
  assert.deepEqual(recon.rows[0], {
    orderId: 12,
    date: '2026-01-02',
    customer: 'A Customer',
    coupon: '',
    ledgerSubtotal: 100,
    ledgerDiscount: 0,
    ledgerTax: 5,
    ledgerTotal: 105,
    invoiceDiscount: 0,
    invoiceTax: 5,
    invoiceTotal: 105,
    delta: 0,
    matched: true
  });
});
