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
  dom.window.eval(fs.readFileSync(path.join(root, 'export-utils.js'), 'utf8'));
  dom.window.eval(fs.readFileSync(path.join(root, 'content.js'), 'utf8'));
  return {dom, api: dom.window.WalmartExporterParser};
}

test('discovers orders and parses date and total from history cards', () => {
  const {dom, api} = parser(fixture('history-page-1.html'), 'https://www.walmart.com/orders');
  const orders = api.getOrderCards();
  assert.equal(orders.length, 2);
  assert.equal(orders[0].id, '12345678901234567890');
  assert.equal(orders[0].date, '2025-01-04');
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
  const firstId = '11111111111111111111';
  const secondId = '22222222222222222222';
  const scanned = [
    {id: firstId, url: 'https://www.walmart.com/orders/' + firstId, date: '2025-01-01'},
    {id: secondId, url: 'https://www.walmart.com/orders/' + secondId, date: '2025-01-02'}
  ];
  for (const order of scanned) store[order.id] = utils.mergeSummary(store[order.id], order, '2025-01-01T00:00:00.000Z');
  store[firstId] = utils.mergeDetail(store[firstId], {id: firstId, date: '2025-01-01', items: [{name: 'saved'}]}, '2025-01-01T00:01:00.000Z');
  store = JSON.parse(JSON.stringify(store));
  assert.deepEqual(utils.pendingOrders(store).map(order => order.id), [secondId]);
  assert.equal(store[firstId].items[0].name, 'saved');
  assert.equal(store[secondId].extractionStatus, 'summary-only');
});


test('converts returns links into canonical detail links and preserves STORE context', () => {
  const html = '<article data-testid="order-card"><h3>Oct 15, 2026</h3><a href="/orders/12345678901234567890/returns?orderSource=STORE">Start a return</a><div>Order total $7.07</div></article>';
  const {dom, api} = parser(html, 'https://www.walmart.com/orders');
  const [order] = api.getOrderCards();
  assert.equal(order.url, 'https://www.walmart.com/orders/12345678901234567890?orderSource=STORE');
  assert.equal(order.date, '2026-10-15');
  assert.equal(order.total, '7.07');
  dom.window.close();
});

test('a partial month-day date never masquerades as a complete purchase date', () => {
  const html = '<article data-testid="order-card"><a href="/orders/12345678901234567890/returns">Return</a><div>Jan 31</div><div>Total $38.93</div></article>';
  const {dom, api} = parser(html, 'https://www.walmart.com/orders');
  const [order] = api.getOrderCards();
  assert.equal(order.date, '');
  assert.equal(order.dateStatus, 'partial');
  assert.equal(order.dateText, 'Jan 31');
  assert.equal(order.url, 'https://www.walmart.com/orders/12345678901234567890');
  dom.window.close();
});

test('machine-readable purchase dates override display dates missing a year', () => {
  const html = '<article data-testid="order-card"><a href="/orders/12345678901234567890/returns">Return</a><span>Feb 5</span><time datetime="2025-02-05"></time><div>Total $128.85</div></article>';
  const {dom, api} = parser(html, 'https://www.walmart.com/orders');
  const [order] = api.getOrderCards();
  assert.equal(order.date, '2025-02-05');
  dom.window.close();
});

test('validates full dates, including leap days, without inventing years', () => {
  assert.equal(utils.normalizePurchaseDate('Oct 15, 2026'), '2026-10-15');
  assert.equal(utils.normalizePurchaseDate('January 31'), '');
  assert.equal(utils.normalizePurchaseDate('Feb 5'), '');
  assert.equal(utils.normalizePurchaseDate('02/05/2025'), '2025-02-05');
  assert.equal(utils.normalizePurchaseDate('2024-02-29'), '2024-02-29');
  assert.equal(utils.normalizePurchaseDate('2025-02-29'), '');
  assert.equal(utils.normalizePurchaseDate('02/05/25'), '');
});

test('migrates previously saved returns URLs and yearless dates in place', () => {
  const orders = utils.normalizeSavedOrders({
    '12345678901234567890': {
      id: '12345678901234567890', url: 'https://www.walmart.com/orders/12345678901234567890/returns',
      date: 'Jan 31', total: '38.93', items: []
    }
  });
  const record = orders['12345678901234567890'];
  assert.equal(record.url, 'https://www.walmart.com/orders/12345678901234567890');
  assert.equal(record.date, '');
  assert.equal(record.dateText, 'Jan 31');
  assert.equal(record.dateStatus, 'partial');
  assert.match(utils.ordersCsv(orders), /"partial","Jan 31"/);
  assert.equal(utils.pendingOrders(orders).length, 1);
});

test('receipt details with a complete purchase date repair old partial dates', () => {
  const old = {id: '12345678901234567890', url: 'https://www.walmart.com/orders/12345678901234567890/returns', date: 'Jan 31', items: [], detailsComplete: false};
  const merged = utils.mergeDetail(old, {id: old.id, date: '2025-01-31', items: [{name: 'Food', qty: '1'}]});
  assert.equal(merged.date, '2025-01-31');
  assert.equal(merged.url, 'https://www.walmart.com/orders/12345678901234567890');
  assert.equal(merged.dateStatus, 'complete');
  assert.equal(utils.pendingOrders({[old.id]: merged}).length, 0);
});

test('receipt detail dates are recovered from order pages after incomplete history cards', () => {
  const html = '<main><h2>Order details</h2><p>Order placed January 31, 2025</p><div>Order total $38.93</div></main>';
  const {dom, api} = parser(html, 'https://www.walmart.com/orders/12345678901234567890');
  const details = api.extractDetails();
  assert.equal(details.date, '2025-01-31');
  assert.equal(details.url, 'https://www.walmart.com/orders/12345678901234567890');
  dom.window.close();
});

test('already itemized orders with no verified date remain eligible for date repair', () => {
  const record = {id: '12345678901234567890', url: 'https://www.walmart.com/orders/12345678901234567890/returns', date: 'Feb 5', items: [{name: 'Bread'}], detailsComplete: true};
  assert.equal(utils.pendingOrders({[record.id]: record}).length, 1);
});


test('extracts item names and quantities from printable Walmart receipt rows', () => {
  const html = '<main><div class="print-bill-date">Oct 30, 2026 purchase</div><div class="print-items-list"><div><div>Great Value Milk</div><div><div>Delivered</div><div>Qty 2</div><div>$6.48</div></div></div></div></main>';
  const {dom, api} = parser(html, 'https://www.walmart.com/orders/200015179365152');
  const receipt = api.extractDetails();
  assert.equal(receipt.items.length, 1);
  assert.equal(receipt.items[0].name, 'Great Value Milk');
  assert.equal(receipt.items[0].qty, '2');
  assert.equal(receipt.items[0].displayedPrice, '6.48');
  assert.equal(receipt.date, '2026-10-30');
  assert.equal(receipt.diagnostics.printedRows, 1);
  dom.window.close();
});

test('extracts purchased items from linked product cards without old item selectors', () => {
  const html = '<main><h1>Order details</h1><div>Order placed Oct 30, 2026</div><section aria-label="Purchased items"><div class="cart-product"><a href="/ip/paste/987654321">Toothpaste</a><span>Qty 2</span><span>$3.70</span></div></section><aside class="recommendations"><a href="/ip/advertisement/888888">Recommended lotion</a><div>$6.00</div></aside></main>';
  const {dom, api} = parser(html, 'https://www.walmart.com/orders/200015179365152');
  const receipt = api.extractDetails();
  assert.equal(receipt.items.length, 1);
  assert.equal(receipt.items[0].name, 'Toothpaste');
  assert.equal(receipt.items[0].qty, '2');
  assert.equal(receipt.items[0].productId, '987654321');
  assert.equal(receipt.items[0].unitPrice, '');
  assert.equal(receipt.items[0].source, 'product-link-in-order');
  dom.window.close();
});

test('diagnostics contain structural counts and omit purchase identifiers and prices', () => {
  const html = '<main><div>Order placed Oct 30, 2026</div><div class="item-details">Not rendered</div></main>';
  const {dom, api} = parser(html, 'https://www.walmart.com/orders/200015179365152');
  const receipt = api.extractDetails();
  const saved = utils.mergeDetail(null, receipt);
  assert.equal(saved.diagnostics.itemCards, 1);
  assert.equal(saved.diagnostics.itemCount, 0);
  assert.doesNotMatch(JSON.stringify(saved.diagnostics), /200015179365152|Oct 30|49\.06/);
  dom.window.close();
});
