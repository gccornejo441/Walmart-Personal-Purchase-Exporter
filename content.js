(() => {
  const orderPath = /^\/orders\/([A-Za-z0-9-]{8,})(?:\/|$)/i;
  const datePattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+\\d{1,2}(?:,?\\s+\\d{4})?|\\d{1,2}\\/\\d{1,2}(?:\\/\\d{2,4})?|\\d{4}-\\d{2}-\\d{2}';
  const dollarPattern = /-?\$\s*([\d,]+(?:\.\d{2})?)/;
  const {normalizePurchaseDate, canonicalOrderUrl} = window.WalmartExportUtils;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function text(element) {
    if (!element) return '';
    if (element.innerText) return clean(element.innerText);
    return clean([...element.childNodes].map(node => node.nodeType === 3 ? node.nodeValue : text(node)).join(' '));
  }

  function readFirst(root, selectors) {
    for (const selector of selectors) {
      const node = root.querySelector(selector);
      if (node && text(node)) return text(node);
    }
    return '';
  }

  function money(value) {
    const match = clean(value).match(dollarPattern);
    return match ? match[1].replace(/,/g, '') : '';
  }

  function orderIdFromPath(url) {
    try {
      return new URL(url, location.origin).pathname.match(orderPath)?.[1] || '';
    } catch {
      return '';
    }
  }

  function findOrderId(value) {
    const normalized = clean(value);
    const match = normalized.match(/(?:order\s*(?:number|#|no\.?|id)?|TC\s*#)\s*[:#-]?\s*([\d-]{10,28})/i);
    return match?.[1] || '';
  }

  function findDate(value) {
    const normalized = clean(value);
    const labeled = normalized.match(new RegExp('(?:ordered|order placed|purchase date|purchased|purchase|placed on|date)\\s*[:\\-]?\\s*(' + datePattern + ')', 'i'));
    return clean(labeled?.[1] || normalized.match(new RegExp(datePattern, 'i'))?.[0] || '');
  }

  function findDateInNode(root, fallbackText = '') {
    const preferred = root?.querySelectorAll?.('[data-testid*="purchase-date" i], [data-testid*="order-date" i], [data-testid*="placed-date" i], [itemprop="orderDate"], .print-bill-date, time[datetime], [data-testid*="date" i]') || [];
    const sourceText = clean(fallbackText);
    const labeled = sourceText.match(new RegExp('(?:order\\s+placed|ordered\\s+on|placed\\s+on|purchase\\s+date|purchased\\s+on|store\\s+purchase|purchase)\\s*[:\\-]?\\s*(' + datePattern + ')', 'i'));
    if (labeled && normalizePurchaseDate(labeled[1])) return labeled[1];
    for (const node of preferred) {
      if (node.closest?.('[data-testid*="delivery" i], [data-testid*="arrival" i], [class*="delivery-date" i]')) continue;
      for (const candidate of [node.getAttribute('datetime'), node.getAttribute('content'), node.getAttribute('data-date'), node.getAttribute('title'), node.getAttribute('aria-label'), text(node)]) {
        if (normalizePurchaseDate(candidate)) return candidate;
      }
    }
    if (labeled) return labeled[1];
    const unlabelled = findDate(sourceText);
    if (unlabelled && /(?:arrives?|arriving|delivery|delivered|expected)\s*(?:on|by)?\s*$/i.test(sourceText.slice(Math.max(0, sourceText.indexOf(unlabelled) - 24), sourceText.indexOf(unlabelled)))) return '';
    return unlabelled;
  }

    function findLabeledMoney(value, labels) {
    const normalized = clean(value);
    for (const label of labels) {
      const expression = new RegExp('(?:^|\\s)' + label + '\\s*[:\\-]?\\s*(-?\\$\\s*[\\d,]+(?:\\.\\d{2})?)', 'i');
      const match = normalized.match(expression);
      if (match) return money(match[1]);
    }
    return '';
  }

  function findCard(anchor, id) {
    let current = anchor;
    let best = anchor.parentElement || anchor;
    let bestScore = -1;
    for (let depth = 0; depth < 9 && current.parentElement && current.parentElement !== document.body; depth++) {
      current = current.parentElement;
      const description = text(current);
      if (description.length > 4500) break;
      const linkedIds = new Set([...current.querySelectorAll('a[href]')].map(node => orderIdFromPath(node.href)).filter(Boolean));
      if (linkedIds.size > 1 || linkedIds.size === 1 && !linkedIds.has(id)) break;
      const foundDate = findDateInNode(current, description);
      const hasTotal = Boolean(findLabeledMoney(description, ['order total', 'total', 'charged']));
      const score = Number(Boolean(foundDate)) * 5 + Number(Boolean(normalizePurchaseDate(foundDate))) * 4 +
        Number(hasTotal) * 3 + Number(description.includes(id)) * 2 + Number(description.length > 60);
      if (score > bestScore || score === bestScore && description.length < text(best).length) {
        best = current;
        bestScore = score;
      }
    }
    return best;
  }

  function getOrderCards() {
    const found = new Map();
    function remember(id, node, url, source) {
      const description = text(node).slice(0, 4500);
      const dateText = findDateInNode(node, description);
      const date = normalizePurchaseDate(dateText);
      const previous = found.get(id);
      const next = {
        id, url: canonicalOrderUrl(url, id), date: date || previous?.date || '',
        dateText: dateText || previous?.dateText || '',
        dateStatus: date || previous?.date ? 'complete' : dateText || previous?.dateText ? 'partial' : 'missing',
        total: findLabeledMoney(description, ['order total', 'total', 'charged']) || previous?.total || '',
        summary: description.slice(0, 180) || previous?.summary || '', source
      };
      if (!previous || date && !previous.date || next.total && !previous.total || description.length > previous.summary.length) found.set(id, next);
    }
    for (const anchor of document.querySelectorAll('a[href]')) {
      const id = orderIdFromPath(anchor.href);
      if (!id) continue;
      remember(id, findCard(anchor, id), anchor.href, 'history');
    }
    for (const node of document.querySelectorAll('article, li, [data-testid*="order-card" i], [data-testid*="purchase-card" i], [class*="order-card" i]')) {
      const description = text(node);
      if (description.length < 25 || description.length > 4000) continue;
      const id = findOrderId(description);
      if (!id) continue;
      const linkedIds = new Set([...node.querySelectorAll('a[href]')].map(anchor => orderIdFromPath(anchor.href)).filter(Boolean));
      if (linkedIds.size > 1) continue;
      if (!found.has(id) || !found.get(id).date || !found.get(id).total) remember(id, node, '/orders/' + encodeURIComponent(id), 'history-card');
    }
    return [...found.values()];
  }

    function findQuantity(value) {
    const found = clean(value).match(/\b(?:qty|quantity)\s*[:x]?\s*(\d+(?:\.\d+)?)/i);
    return found?.[1] || '';
  }

  function printedItems() {
    const results = [];
    for (const node of document.querySelectorAll('.print-items-list')) {
      const row = node.children[0] || node;
      const info = row.children[1];
      const name = text(row.children[0]) || readFirst(row, ['[class*="name" i]', '[class*="description" i]']);
      const qty = findQuantity(text(info?.children?.[1]) || text(node));
      const price = money(text(info?.children?.[2]) || readFirst(row, ['[class*="price" i]']) || text(node));
      const status = text(info?.children?.[0]) || '';
      if (name && name.length > 2) results.push({name, qty, displayedPrice: price, unitPrice: qty === '1' ? price : '', lineTotal: '', productId: '', status, source: 'printed-receipt'});
    }
    return results;
  }

  function normalItems() {
    const results = [];
    const selectors = [
      '[data-testid*="order-item" i]',
      '[data-testid*="item-card" i]',
      '[data-testid*="line-item" i]',
      '[class*="order-item-card" i]',
      '[class*="item-details" i]'
    ];
    const nodes = document.querySelectorAll(selectors.join(', '));
    for (const node of nodes) {
      const description = text(node);
      if (description.length < 5 || description.length > 1400) continue;
      const name = readFirst(node, [
        '[data-testid*="product-name" i]',
        '[data-testid*="item-name" i]',
        'a[href*="/ip/"]',
        '[class*="product-name" i]',
        '[class*="item-name" i]'
      ]);
      if (!name) continue;
      const priceNode = node.querySelector('[data-testid*="price" i], [class*="item-price" i], [class*="price" i]');
      const price = money(text(priceNode) || description);
      const lineTotal = money(readFirst(node, ['[data-testid*="line-total" i]', '[class*="line-total" i]']));
      const qty = findQuantity(description);
      const status = readFirst(node, ['[data-testid*="status" i]']);
      const productLink = node.querySelector('a[href*="/ip/"]');
      const productId = productLink?.href.match(/\/ip\/(?:[^/]+\/)?(\d+)(?:[/?#]|$)/i)?.[1] || '';
      const priceLabel = clean(priceNode?.getAttribute('aria-label') || priceNode?.getAttribute('data-testid') || priceNode?.className || '');
      const isUnitPrice = /unit|each|per item/i.test(priceLabel);
      const isLineTotal = /line|subtotal|total price/i.test(priceLabel);
      if (!results.some(item => item.name === name && item.displayedPrice === price && item.qty === qty)) {
        results.push({name, qty, displayedPrice: price, unitPrice: isUnitPrice || (price && qty === '1') ? price : '', lineTotal: lineTotal || (isLineTotal ? price : ''), productId, status, source: 'order-details'});
      }
    }
    return results;
  }

  function anchorItems() {
    const results = [];
    const seen = new Set();
    const anchors = document.querySelectorAll('main a[href*="/ip/"], [role="main"] a[href*="/ip/"], #maincontent a[href*="/ip/"]');
    for (const anchor of anchors) {
      if (anchor.closest('nav,header,footer,aside,[class*="recommend" i],[data-testid*="recommend" i],[data-testid*="suggest" i],[data-testid*="sponsor" i],[data-testid*="related" i]')) continue;
      let link;
      try { link = new URL(anchor.href, location.origin); } catch { continue; }
      if (link.origin !== location.origin) continue;
      const productId = link.pathname.match(/\/ip\/(?:[^/]+\/)?(\d+)(?:\/|$)/i)?.[1] || '';
      let container = anchor;
      let valid = null;
      for (let depth = 0; depth < 6 && container.parentElement; depth++) {
        container = container.parentElement;
        if (container.matches('main, [role="main"], #maincontent')) break;
        const description = text(container);
        if (description.length > 1000) break;
        const identities = new Set([...container.querySelectorAll('a[href*="/ip/"]')].map(node => node.href.match(/\/ip\/(?:[^/]+\/)?(\d+)(?:[/?#]|$)/i)?.[1] || node.href));
        if (identities.size > 1) break;
        if (container.matches('[data-testid*="item" i],[class*="order-item" i],[class*="receipt-item" i]') || /\b(?:Qty|Quantity|Purchased)\b/i.test(description) || /\$\s*\d/.test(description)) {
          valid = container;
          break;
        }
      }
      if (!valid) continue;
      const name = readFirst(valid, ['[data-testid*="product-name" i]', '[data-testid*="item-name" i]', '[itemprop="name"]', '[class*="product-name" i]', '[class*="item-name" i]']) || text(anchor) || clean(anchor.querySelector('img[alt]')?.alt);
      if (!name || name.length < 3 || name.length > 250) continue;
      const description = text(valid);
      const qty = findQuantity(description);
      const displayedPrice = money(readFirst(valid, ['[data-testid*="unit-price" i]', '[data-testid*="price" i]', '[class*="item-price" i]', '[class*="price" i]']) || description);
      const lineTotal = money(readFirst(valid, ['[data-testid*="line-total" i]', '[class*="line-total" i]']));
      const key = [productId, name, qty, displayedPrice].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({name, qty, displayedPrice, lineTotal, unitPrice: '', productId, status: '', source: 'product-link-in-order'});
    }
    return results;
  }

  function findReceiptUrl(id) {
    if (!id) return '';
    for (const link of document.querySelectorAll('a[href]')) {
      if (!/(?:print|receipt)/i.test(text(link) + ' ' + (link.getAttribute('aria-label') || ''))) continue;
      try {
        const candidate = new URL(link.href, location.origin);
        if (candidate.origin === location.origin && orderIdFromPath(candidate.href) === id && /(?:print|receipt)/i.test(candidate.pathname)) return candidate.href;
      } catch {}
    }
    return '';
  }

  function itemDiagnostics(items) {
    return {
      printedRows: document.querySelectorAll('.print-items-list').length,
      itemCards: document.querySelectorAll('[data-testid*="order-item" i],[data-testid*="line-item" i],[data-testid*="item-card" i],[data-testid*="item-row" i],[class*="order-item-card" i],[class*="item-details" i]').length,
      productLinks: document.querySelectorAll('main a[href*="/ip/"],[role="main"] a[href*="/ip/"],#maincontent a[href*="/ip/"]').length,
      itemCount: items.length,
      hasMain: !!document.querySelector('main,[role="main"],#maincontent'),
      hasPrintButton: [...document.querySelectorAll('button,[role="button"]')].some(b => /\bprint\b/i.test(text(b) + ' ' + (b.getAttribute('aria-label') || ''))),
      hasItemHeading: [...document.querySelectorAll('h1,h2,h3,h4')].some(b => /^(?:items|items purchased|order items|products|receipt)$/i.test(text(b)))
    };
  }

  function extractDetails() {
    const pageText = text(document.body).slice(0, 120000);
    const id = orderIdFromPath(location.href) ||
      readFirst(document, ['.print-bill-bar-id', '[data-testid="order-number"]']).match(/[\d-]{10,28}/)?.[0] ||
      findOrderId(pageText);
    const printedDate = readFirst(document, ['.print-bill-date']);
    const totalContainer = document.querySelector('.bill-order-total-payment');
    const totalFromPrinted = totalContainer ? money(text(totalContainer.lastElementChild || totalContainer)) : '';
    const items = printedItems();
    if (!items.length) items.push(...normalItems());
    if (!items.length) items.push(...anchorItems());
    const pageDate = findDateInNode(document, pageText.slice(0, 5000));
    const dateText = normalizePurchaseDate(printedDate) ? printedDate : normalizePurchaseDate(pageDate) ? pageDate : printedDate || pageDate;
    const date = normalizePurchaseDate(dateText);
    const total = totalFromPrinted || findLabeledMoney(pageText, ['order total', 'total paid', 'charged', 'grand total']);
    const subtotal = findLabeledMoney(pageText, ['subtotal', 'items subtotal']);
    const tax = findLabeledMoney(pageText, ['estimated tax', 'tax']);
    const tip = findLabeledMoney(pageText, ['driver tip', 'tip']);
    const status = readFirst(document, ['[data-testid="order-status"]', '[data-testid="delivery-status"]']);
    const gated = /(?:sign in to (?:your|the) account|verify you are human|unusual traffic|access denied)/i.test(pageText.slice(0, 1800));
    return {
      id, url: canonicalOrderUrl(location.href, id), date, dateText,
      dateStatus: date ? 'complete' : dateText ? 'partial' : 'missing',
      total, subtotal, tax, tip, status, items, gated,
      receiptUrl: items.length ? '' : findReceiptUrl(id), diagnostics: itemDiagnostics(items), source: 'details',
      extractionStatus: items.length ? 'complete' : 'incomplete'
    };
  }

    function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function scanHistory() {
    if (!/^\/orders\/?$/.test(location.pathname)) {
      return {error: 'Open the main Walmart Purchase History page before scanning.', orders: []};
    }
    const found = new Map();
    const initialScroll = window.scrollY;
    let stale = 0;
    let previousCount = -1;
    for (let pass = 0; pass < 36; pass++) {
      for (const item of getOrderCards()) found.set(item.id, item);
      const controls = [...document.querySelectorAll('button, [role="button"]')];
      const loadMore = controls.find(element =>
        element.getClientRects().length > 0 &&
        !element.disabled &&
        /^(?:load|show|view|see) more(?: orders| purchases| history)?$/i.test(text(element))
      );
      if (loadMore) loadMore.click();
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(700);
      for (const item of getOrderCards()) found.set(item.id, item);
      if (found.size === previousCount && !loadMore) stale++;
      else stale = 0;
      previousCount = found.size;
      if (stale >= 3) break;
    }
    window.scrollTo(0, initialScroll);
    return {
      orders: [...found.values()],
      message: found.size ? `Found ${found.size} order references on this page.` : 'No order links found. Open Purchase History and make sure your orders have loaded.',
      page: location.href
    };
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'SCAN_HISTORY') {
      scanHistory().then(sendResponse).catch(error => sendResponse({error: error.message, orders: []}));
      return true;
    }
    if (request.type === 'READ_ORDER') {
      (async () => {
        const scrollY = window.scrollY;
        try {
          for (let i = 0; i < 3; i++) {
            const buttons = [...document.querySelectorAll('button,[role="button"]')].filter(button => !button.disabled && /^(?:show|view|see|load)\s+(?:(?:all|more)\s+)?(?:items|products)(?:\s*\(\d+\))?$/i.test(text(button)));
            for (const button of buttons.slice(0, 3)) button.click();
            window.scrollTo(0, Math.round(document.documentElement.scrollHeight * (i + 1) / 3));
            await sleep(450);
          }
          return extractDetails();
        } finally {
          window.scrollTo(0, scrollY);
        }
      })().then(order => sendResponse({order})).catch(error => sendResponse({error: error.message}));
      return true;
    }
  });
  window.WalmartExporterParser = {getOrderCards, extractDetails, printedItems, normalItems, anchorItems, itemDiagnostics, findQuantity, findDate, findDateInNode, findLabeledMoney};
})();
