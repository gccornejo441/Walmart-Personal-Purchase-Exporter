(function (root) {
  function spreadsheetSafe(value) {
    const str = String(value ?? '');
    return /^[\s\u0000-\u001f]*[=+@-]/.test(str) ? "'" + str : str;
  }
  function csvCell(value) { return '"' + spreadsheetSafe(value).replace(/"/g, '""') + '"'; }
  function csv(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }
  function uniqueItems(orders) {
    const rows = new Map();
    for (const order of orders) for (const item of order.items || []) {
      const row = [order.id, order.date, item.name, item.qty, item.unitPrice || '', item.lineTotal || '', item.displayedPrice || '', item.productId || '', order.url || ''];
      rows.set(JSON.stringify([order.id, item.productId, item.name, item.qty, item.displayedPrice || item.price]), row);
    }
    return [...rows.values()];
  }
  function mergeSummary(existing, incoming, now = new Date().toISOString()) {
    return {
      ...existing, id: incoming.id,
      url: incoming.url || existing?.url || '', date: incoming.date || existing?.date || '',
      total: incoming.total || existing?.total || '', summary: incoming.summary || existing?.summary || '',
      source: incoming.source || existing?.source || '', savedAt: existing?.savedAt || now,
      items: existing?.items || [], detailsComplete: Boolean(existing?.detailsComplete),
      extractionStatus: existing?.extractionStatus || 'summary-only'
    };
  }
  function mergeDetail(existing, details, now = new Date().toISOString()) {
    const record = mergeSummary(existing, details, now);
    for (const field of ['subtotal', 'tax', 'tip', 'status']) record[field] = details[field] || existing?.[field] || '';
    record.lastAttemptedAt = now;
    record.extractionAttemptedAt = now;
    record.extractionStatus = details.items?.length ? 'complete' : 'incomplete';
    if (details.items?.length) {
      record.items = details.items;
      record.detailsComplete = true;
      record.detailsCapturedAt = now;
    }
    return record;
  }
  function pendingOrders(orders, limit = Infinity) {
    return Object.values(orders).filter(order => !order.detailsComplete && /^https:\/\/www\.walmart\.com\/orders\//.test(order.url || ''))
      .sort((a, b) => (a.lastAttemptedAt || '').localeCompare(b.lastAttemptedAt || '')).slice(0, limit);
  }
  function ordersCsv(orders) {
    const columns = ['Order ID', 'Purchase Date', 'Order Total', 'Subtotal', 'Tax', 'Tip', 'Order Status', 'Item Count', 'Order URL'];
    const rows = Object.values(orders).map(order => [order.id, order.date, order.total, order.subtotal, order.tax, order.tip, order.status, order.items?.length || 0, order.url]);
    return csv([columns, ...rows]);
  }
  function itemsCsv(orders) {
    const columns = ['Order ID', 'Purchase Date', 'Product Name', 'Quantity', 'Unit Price', 'Line Total', 'Displayed Price', 'Product ID', 'Order URL'];
    return csv([columns, ...uniqueItems(Object.values(orders))]);
  }
  function jsonBackup(orders, exportedAt = new Date().toISOString()) {
    return JSON.stringify({schemaVersion: 1, exportedAt, orders: Object.values(orders)}, null, 2);
  }
  const api = {spreadsheetSafe, csvCell, csv, uniqueItems, mergeSummary, mergeDetail, pendingOrders, ordersCsv, itemsCsv, jsonBackup};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WalmartExportUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
