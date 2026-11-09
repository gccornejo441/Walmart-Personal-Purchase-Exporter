(function (root) {
  const origin = 'https://www.walmart.com';
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

  function normalizePurchaseDate(value) {
    const raw = String(value ?? '').trim();
    let match = raw.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})(?:T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?\b/);
    if (match) return validDate(Number(match[1]), Number(match[2]), Number(match[3]));
    match = raw.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (match) return validDate(Number(match[3]), Number(match[1]), Number(match[2]));
    match = raw.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,|\s)+\s*(\d{4})\b/i);
    if (match) return validDate(Number(match[3]), monthNames.indexOf(match[1].slice(0, 3).toLowerCase()) + 1, Number(match[2]));
    match = raw.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{4})\b/i);
    if (match) return validDate(Number(match[3]), monthNames.indexOf(match[2].slice(0, 3).toLowerCase()) + 1, Number(match[1]));
    return '';
  }

  function validDate(year, month, day) {
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return '';
    const actual = new Date(Date.UTC(year, month - 1, day));
    if (actual.getUTCFullYear() !== year || actual.getUTCMonth() !== month - 1 || actual.getUTCDate() !== day) return '';
    return [year, String(month).padStart(2, '0'), String(day).padStart(2, '0')].join('-');
  }

  function canonicalOrderUrl(value, id) {
    const orderId = String(id || '').trim();
    if (!/^[A-Za-z0-9-]{8,}$/.test(orderId)) return value || '';
    let source = '';
    try {
      const input = new URL(value || '/orders/' + encodeURIComponent(orderId), origin);
      if (input.origin === origin) source = input.searchParams.get('orderSource') || '';
    } catch {}
    const url = new URL('/orders/' + encodeURIComponent(orderId), origin);
    if (/^[A-Za-z0-9_-]{1,40}$/.test(source)) url.searchParams.set('orderSource', source);
    return url.href;
  }

  function spreadsheetSafe(value) {
    const str = String(value ?? '');
    return /^[\s\u0000-\u001f]*[=+@-]/.test(str) ? "'" + str : str;
  }

  function csvCell(value) { return '"' + spreadsheetSafe(value).replace(/"/g, '""') + '"'; }
  function csv(rows) { return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n'; }

  function normalizeSavedOrders(orders) {
    const result = {};
    for (const [key, original] of Object.entries(orders || {})) {
      if (!original || typeof original !== 'object') continue;
      const id = String(original.id || key);
      const date = normalizePurchaseDate(original.date) || normalizePurchaseDate(original.dateText);
      const dateText = String(original.dateText || original.date || '').trim();
      result[id] = {
        ...original, id, date, dateText, dateStatus: date ? 'complete' : dateText ? 'partial' : 'missing',
        url: canonicalOrderUrl(original.url, id)
      };
    }
    return result;
  }

  function uniqueItems(orders) {
    const rows = new Map();
    for (const order of orders) for (const item of order.items || []) {
      const row = [order.id, normalizePurchaseDate(order.date), item.name, item.qty, item.unitPrice || '', item.lineTotal || '', item.displayedPrice || '', item.productId || '', canonicalOrderUrl(order.url, order.id)];
      rows.set(JSON.stringify([order.id, item.productId, item.name, item.qty, item.displayedPrice || item.price]), row);
    }
    return [...rows.values()];
  }

  function mergeSummary(existing, incoming, now = new Date().toISOString()) {
    const old = existing || {};
    const updated = incoming || {};
    const id = String(updated.id || old.id || '');
    const incomingDate = normalizePurchaseDate(updated.date) || normalizePurchaseDate(updated.dateText);
    const oldDate = normalizePurchaseDate(old.date) || normalizePurchaseDate(old.dateText);
    const date = incomingDate || oldDate;
    const dateText = date ? (incomingDate ? updated.dateText || updated.date : old.dateText || old.date) : updated.dateText || updated.date || old.dateText || old.date || '';
    return {
      ...old, id, url: canonicalOrderUrl(updated.url || old.url, id), date, dateText,
      dateStatus: date ? 'complete' : dateText ? 'partial' : 'missing',
      total: updated.total || old.total || '', summary: updated.summary || old.summary || '',
      source: updated.source || old.source || '', savedAt: old.savedAt || now,
      items: old.items || [], detailsComplete: Boolean(old.detailsComplete),
      extractionStatus: old.extractionStatus || 'summary-only'
    };
  }

  function mergeDetail(existing, details, now = new Date().toISOString()) {
    const record = mergeSummary(existing, details, now);
    for (const field of ['subtotal', 'tax', 'tip', 'status']) record[field] = details[field] || existing?.[field] || '';
    if (details.diagnostics) record.diagnostics = details.diagnostics;
    record.lastAttemptedAt = now;
    record.extractionAttemptedAt = now;
    record.extractionStatus = details.items?.length || existing?.detailsComplete ? 'complete' : 'incomplete';
    if (details.items?.length) {
      record.items = details.items;
      record.detailsComplete = true;
      record.detailsCapturedAt = now;
    }
    return record;
  }

  function pendingOrders(orders, limit = Infinity) {
    return Object.values(normalizeSavedOrders(orders)).filter(order =>
      (!order.detailsComplete || !order.date) && /^https:\/\/www\.walmart\.com\/orders\/[A-Za-z0-9-]{8,}/.test(order.url || '')
    ).sort((a, b) => (a.lastAttemptedAt || '').localeCompare(b.lastAttemptedAt || '')).slice(0, limit);
  }

  function ordersCsv(orders) {
    const columns = ['Order ID', 'Purchase Date', 'Order Total', 'Subtotal', 'Tax', 'Tip', 'Order Status', 'Item Count', 'Order URL', 'Date Status', 'Original Date Text', 'Extraction Status'];
    const rows = Object.values(normalizeSavedOrders(orders)).map(order => [
      order.id, order.date, order.total, order.subtotal, order.tax, order.tip, order.status,
      order.items?.length || 0, order.url, order.dateStatus, order.dateText, order.extractionStatus
    ]);
    return csv([columns, ...rows]);
  }

  function itemsCsv(orders) {
    const columns = ['Order ID', 'Purchase Date', 'Product Name', 'Quantity', 'Unit Price', 'Line Total', 'Displayed Price', 'Product ID', 'Order URL'];
    return csv([columns, ...uniqueItems(Object.values(normalizeSavedOrders(orders)))]);
  }

  function jsonBackup(orders, exportedAt = new Date().toISOString()) {
    return JSON.stringify({schemaVersion: 2, exportedAt, orders: Object.values(normalizeSavedOrders(orders))}, null, 2);
  }

  const api = {normalizePurchaseDate, canonicalOrderUrl, normalizeSavedOrders, spreadsheetSafe, csvCell, csv, uniqueItems, mergeSummary, mergeDetail, pendingOrders, ordersCsv, itemsCsv, jsonBackup};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WalmartExportUtils = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
