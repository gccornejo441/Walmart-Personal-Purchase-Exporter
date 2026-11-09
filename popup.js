const $ = id => document.getElementById(id);
const buttons = ['scan', 'capture', 'fetch', 'exportOrders', 'exportItems', 'exportJson', 'clear'];
let running = false;
let shouldStop = false;

async function loadOrders() {
  const saved = await chrome.storage.local.get('ordersById');
  return saved.ordersById || {};
}

async function saveOrders(orders) {
  await chrome.storage.local.set({ordersById: orders});
  showCounts(orders);
}

function showCounts(orders) {
  const values = Object.values(orders);
  $('orderCount').textContent = String(values.length);
  $('detailedCount').textContent = String(values.filter(order => order.detailsComplete).length);
  $('itemCount').textContent = String(values.reduce((sum, order) => sum + (order.items?.length || 0), 0));
}

function status(message) {
  $('status').textContent = message;
}

function busy(value) {
  running = value;
  for (const id of buttons) $(id).disabled = value;
  $('stop').disabled = !value;
}

async function currentTab() {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab || !/^https:\/\/www\.walmart\.com\/orders(?:\/|\?|$)/i.test(tab.url || '')) {
    throw new Error('First open https://www.walmart.com/orders in this Chrome window.');
  }
  return tab;
}

async function send(tabId, type) {
  try {
    return await chrome.tabs.sendMessage(tabId, {type});
  } catch {
    throw new Error('Cannot read the Walmart tab. Reload its page and retry.');
  }
}

function mergeSummary(existing, incoming) {
  return {
    ...existing,
    id: incoming.id,
    url: incoming.url || existing?.url || '',
    date: incoming.date || existing?.date || '',
    total: incoming.total || existing?.total || '',
    summary: incoming.summary || existing?.summary || '',
    source: incoming.source || existing?.source || '',
    savedAt: existing?.savedAt || new Date().toISOString(),
    items: existing?.items || [],
    detailsComplete: Boolean(existing?.detailsComplete)
  };
}

function mergeDetail(existing, details) {
  const record = mergeSummary(existing, details);
  for (const field of ['subtotal', 'tax', 'tip', 'status']) record[field] = details[field] || existing?.[field] || '';
  record.lastAttemptedAt = new Date().toISOString();
  if (details.items?.length) {
    record.items = details.items;
    record.detailsComplete = true;
    record.detailsCapturedAt = new Date().toISOString();
  }
  return record;
}

async function scan() {
  const tab = await currentTab();
  busy(true);
  status('Scanning currently loaded orders and scrolling for more…');
  try {
    const result = await send(tab.id, 'SCAN_HISTORY');
    if (result?.error) throw new Error(result.error);
    const orders = await loadOrders();
    for (const entry of result.orders || []) orders[entry.id] = mergeSummary(orders[entry.id], entry);
    await saveOrders(orders);
    status(`${result.message || 'Scan completed.'}\n${Object.keys(orders).length} orders saved in total. If Walmart has additional history pages, open each one and scan again.`);
  } finally {
    busy(false);
  }
}

async function capture() {
  const tab = await currentTab();
  busy(true);
  try {
    const result = await send(tab.id, 'READ_ORDER');
    if (result?.error) throw new Error(result.error);
    const data = result.order;
    if (!data?.id) throw new Error('No order ID found. Open a specific Walmart receipt or order detail page.');
    const orders = await loadOrders();
    orders[data.id] = mergeDetail(orders[data.id], data);
    await saveOrders(orders);
    status(`Saved order ${data.id} with ${data.items.length} item(s). ${data.items.length ? '' : 'Item rows were not detected; try opening the printable receipt.'}`);
  } finally {
    busy(false);
  }
}

function awaitLoad(tabId, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timeout = setTimeout(() => settle(new Error('Order page took too long to load.')), timeoutMs);
    function onUpdated(updatedId, changeInfo) {
      if (updatedId === tabId && changeInfo.status === 'complete') settle();
    }
    function settle(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      if (error) reject(error);
      else resolve();
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') settle();
    }).catch(settle);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchDetail(tabId, expectedId) {
  let last = null;
  for (let retry = 0; retry < 10; retry++) {
    if (shouldStop) break;
    await sleep(950);
    try {
      const result = await chrome.tabs.sendMessage(tabId, {type: 'READ_ORDER'});
      last = result?.order || null;
      if (last?.gated) throw new Error('Walmart needs you to sign in or verify the session.');
      if (last?.id && last.id !== expectedId) continue;
      if (last?.items?.length) return last;
    } catch (error) {
      if (/sign in|verify the session/i.test(error.message)) throw error;
    }
  }
  return last;
}

async function fetchBatch() {
  await currentTab();
  const orders = await loadOrders();
  const max = Number($('batchSize').value) || 25;
  const pending = Object.values(orders)
    .filter(order => !order.detailsComplete && /^https:\/\/www\.walmart\.com\/orders\//.test(order.url || ''))
    .sort((a, b) => (a.lastAttemptedAt || '').localeCompare(b.lastAttemptedAt || ''))
    .slice(0, max);
  if (!pending.length) {
    status('No pending saved order links. Scan the purchase history page first, or the visible orders are already itemized.');
    return;
  }
  shouldStop = false;
  busy(true);
  let tab;
  let success = 0;
  let failed = 0;
  try {
    for (let i = 0; i < pending.length && !shouldStop; i++) {
      const order = pending[i];
      status(`Retrieving order ${i + 1} of ${pending.length}\n${order.id}\n${success} itemized, ${failed} not itemized`);
      try {
        if (!tab) tab = await chrome.tabs.create({url: order.url, active: false});
        else tab = await chrome.tabs.update(tab.id, {url: order.url});
        await awaitLoad(tab.id);
        const detail = await fetchDetail(tab.id, order.id);
        if (!detail || (detail.id && detail.id !== order.id)) throw new Error('Order ID mismatch or page not ready.');
        const merged = mergeDetail(orders[order.id], detail);
        orders[order.id] = merged;
        if (merged.detailsComplete) success++;
        else failed++;
        await saveOrders(orders);
        await sleep(850);
      } catch (error) {
        failed++;
        orders[order.id] = {...orders[order.id], lastAttemptedAt: new Date().toISOString()};
        await saveOrders(orders);
        if (/sign in|verify the session/i.test(error.message)) {
          status(`Paused: ${error.message} Switch to Walmart and resolve the prompt, then retry.`);
          break;
        }
      }
    }
    if (!shouldStop) status(`Batch finished: ${success} orders itemized; ${failed} without detected items. Rerun to retry unmatched orders or open their printable receipts.`);
    else status(`Stopped: ${success} orders itemized, ${failed} not itemized. Saved results were kept.`);
  } finally {
    if (tab?.id) {
      try { await chrome.tabs.remove(tab.id); } catch {}
    }
    busy(false);
  }
}

function spreadsheetSafe(value) {
  const str = String(value ?? '');
  return /^[\s\u0000-\u001f]*[=+@-]/.test(str) ? "'" + str : str;
}

function csvCell(value) {
  const str = spreadsheetSafe(value);
  return '"' + str.replace(/"/g, '""') + '"';
}

function csv(rows) {
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function download(content, fileName, type) {
  const blob = new Blob([content], {type});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

function fileStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function exportOrders() {
  const data = Object.values(await loadOrders());
  if (!data.length) throw new Error('No orders saved yet. Scan Walmart Purchase History first.');
  const columns = ['Order ID', 'Purchase Date', 'Order Total', 'Subtotal', 'Tax', 'Tip', 'Status', 'Item Count', 'Item Details Captured', 'Order URL', 'Source'];
  const rows = data.map(order => [order.id, order.date, order.total, order.subtotal, order.tax, order.tip, order.status, order.items?.length || 0, order.detailsComplete ? 'Yes' : 'No', order.url, order.source]);
  download(csv([columns, ...rows]), `walmart-orders-${fileStamp()}.csv`, 'text/csv;charset=utf-8');
  status(`Exported ${rows.length} orders. Order totals appear once per order in this file.`);
}

async function exportItems() {
  const data = Object.values(await loadOrders());
  const columns = ['Order ID', 'Purchase Date', 'Item Name', 'Quantity', 'Item Price', 'Item Status', 'Order URL', 'Extraction Source'];
  const rows = data.flatMap(order => (order.items || []).map(item => [order.id, order.date, item.name, item.qty, item.price, item.status, order.url, item.source]));
  if (!rows.length) throw new Error('No itemized receipts saved yet. Use Fetch itemized receipts or Save current receipt.');
  download(csv([columns, ...rows]), `walmart-items-${fileStamp()}.csv`, 'text/csv;charset=utf-8');
  status(`Exported ${rows.length} item rows. Item Price is the amount displayed on Walmart; verify whether it is per-unit or line total before summing.`);
}

async function exportJson() {
  const orders = await loadOrders();
  if (!Object.keys(orders).length) throw new Error('No orders saved yet.');
  download(JSON.stringify({exportedAt: new Date().toISOString(), orders: Object.values(orders)}, null, 2), `walmart-purchases-${fileStamp()}.json`, 'application/json');
  status('JSON backup downloaded. Data also remains saved locally in Chrome.');
}

async function clearData() {
  if (!confirm('Delete every saved Walmart order and item from this extension on this computer?')) return;
  await chrome.storage.local.remove('ordersById');
  showCounts({});
  status('Locally saved Walmart purchase data cleared.');
}

function attach(id, action) {
  $(id).addEventListener('click', async () => {
    try { await action(); }
    catch (error) {
      status('Error: ' + (error?.message || String(error)));
      busy(false);
    }
  });
}

attach('scan', scan);
attach('capture', capture);
attach('fetch', fetchBatch);
attach('exportOrders', exportOrders);
attach('exportItems', exportItems);
attach('exportJson', exportJson);
attach('clear', clearData);
$('stop').addEventListener('click', () => {
  shouldStop = true;
  $('stop').disabled = true;
  status('Stopping after the current order…');
});
loadOrders().then(showCounts).catch(error => status('Storage error: ' + error.message));
