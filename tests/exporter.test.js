const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const utils = require('../export-utils.js');

const root = path.resolve(__dirname, '..');
const fixture = name => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
function parser(html, url) {
  const dom = new JSDOM(html, {url, runScripts: 'outside-only'});
  dom.window.chrome = {runtime: {onMessage: {addListener() {}}}};
  dom.window.eval(fs.readFileSync(path.join(root, 'content.js'), 'utf8'));
  return {dom, api: dom.window.WalmartExporterParser};
}

test('discovers orders and parses date and total from history cards', () => {
  const {dom, api} = parser(fixture('history-page-1.html'), 'https://www.walmart.com/orders');
  const orders = api.getOrderCards();
  assert.equal(orders.length, 2);
  assert.equal(orders[0].id, '12345678901234567890');
  assert.match(orders[0].date, /Jan 4, 2025/i);
  assert.equal(orders[0].total, '42.18');
  dom.window.close();
});

test('finds dates in machine-readable time elements and accepts a date without a year', () => {
  const html = '<article data-testid="order-card"><a href="/orders/22345678901234567890">Order</a><time datetime="2024-12-02"></time></article>';
  const {dom, api} = parser(html, 'https://www.walmart.com/orders');
  assert.equal(api.getOrderCards()[0].date, '2024-12-02');
  assert.equal(api.findDate('Order placed Nov 9'), 'Nov 9');
  dom.window.close();
});

test('combines multiple history pages incrementally without duplicate order IDs', () => {
  const one = parser(fixture('history-page-1.html'), 'https://www.walmart.com/orders');
  const two = parser(fixture('history-page-2.html'), 'https://www.walmart.com/orders');
  const merged = new Map([...one.api.getOrderCards(), ...one.api.getOrderCards(), ...two.api.getOrderCards()].map(order => [order.id, order]));
  assert.equal(merged.size, 3);
  one.dom.window.close(); two.dom.window.close();
});

test('extracts items, quantities, unit and line prices, product IDs and totals', () => {
  const {dom, api} = parser(fixture('receipt.html'), 'https://www.walmart.com/orders/12345678901234567890');
  const order = api.extractDetails();
  assert.equal(order.id, '12345678901234567890');
  assert.equal(order.items.length, 2);
  assert.equal(order.items[0].qty, '2');
  assert.equal(order.items[0].unitPrice, '4.50');
  assert.equal(order.items[0].lineTotal, '9.00');
  assert.equal(order.items[0].productId, '987654321');
  assert.equal(order.items[1].unitPrice, '30.99');
  assert.equal(api.findQuantity('Product without a displayed quantity'), '');
  assert.equal(order.tax, '2.19');
  assert.equal(order.extractionStatus, 'complete');
  dom.window.close();
});

test('marks failed or incomplete receipt extraction without inventing items', () => {
  const {dom, api} = parser(fixture('receipt-incomplete.html'), 'https://www.walmart.com/orders/12345678901234567890');
  const order = api.extractDetails();
  assert.equal(order.items.length, 0);
  assert.equal(order.extractionStatus, 'incomplete');
  assert.equal(order.total, '25.00');
  dom.window.close();
});

test('escapes CSV, blocks spreadsheet formulas, emits Excel-compatible UTF-8 BOM', () => {
  const result = utils.csv([['Name', 'Amount'], ['A, "quoted" item', '=1+1']]);
  assert.ok(result.startsWith('\uFEFF'));
  assert.match(result, /"A, ""quoted"" item"/);
  assert.match(result, /"'=1\+1"/);
  assert.ok(result.endsWith('\r\n'));
});

test('JSON backup preserves extraction status and timestamps', () => {
  const order = {id: '1', extractionStatus: 'incomplete', extractionAttemptedAt: '2025-01-01T00:00:00.000Z', items: []};
  const backup = JSON.parse(utils.jsonBackup({1: order}, '2025-01-02T00:00:00.000Z'));
  assert.equal(backup.orders[0].extractionStatus, 'incomplete');
  assert.equal(backup.orders[0].extractionAttemptedAt, order.extractionAttemptedAt);
});

test('orders and items export builders produce their expected CSV schemas', () => {
  const orders = {one: {id: 'one', date: 'Jan 1', total: '10.00', items: [{name: 'Apple', qty: '1', unitPrice: '2.00'}], url: 'https://www.walmart.com/orders/one'}};
  assert.match(utils.ordersCsv(orders), /"Order ID","Purchase Date","Order Total","Subtotal","Tax","Tip","Order Status","Item Count","Order URL"/);
  assert.match(utils.itemsCsv(orders), /"Order ID","Purchase Date","Product Name","Quantity","Unit Price","Line Total","Displayed Price","Product ID","Order URL"/);
  assert.match(utils.itemsCsv(orders), /Apple/);
});

test('item CSV rows de-duplicate repeated items and keep unknown prices blank', () => {
  const order = {id: '1', date: '2025-01-01', items: [
    {name: 'Tea', qty: '2', displayedPrice: '4.00'},
    {name: 'Tea', qty: '2', displayedPrice: '4.00'},
    {name: 'Mystery', qty: '1'}
  ]};
  const rows = utils.uniqueItems([order]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][4], '');
  assert.equal(rows[1][5], '');
});

test('interrupted batch resumes from persisted incomplete orders and retains completed data', () => {
  let store = {};
  const scanned = [
    {id: 'a', url: 'https://www.walmart.com/orders/a', date: 'Jan 1'},
    {id: 'b', url: 'https://www.walmart.com/orders/b', date: 'Jan 2'}
  ];
  for (const order of scanned) store[order.id] = utils.mergeSummary(store[order.id], order, '2025-01-01T00:00:00.000Z');
  store.a = utils.mergeDetail(store.a, {id: 'a', items: [{name: 'saved'}]}, '2025-01-01T00:01:00.000Z');
  store = JSON.parse(JSON.stringify(store)); // extension/browser restart
  assert.deepEqual(utils.pendingOrders(store).map(order => order.id), ['b']);
  assert.equal(store.a.items[0].name, 'saved');
  assert.equal(store.b.extractionStatus, 'summary-only');
});
