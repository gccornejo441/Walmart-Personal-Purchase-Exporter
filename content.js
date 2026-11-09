(() => {
  const orderPath = /^\/orders\/([A-Za-z0-9-]{8,})(?:\/|$)/i;
  const datePattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\\s+\\d{1,2},?\\s+\\d{4}|\\d{1,2}\\/\\d{1,2}\\/\\d{2,4}';
  const dollarPattern = /-?\$\s*([\d,]+(?:\.\d{2})?)/;

  function clean(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function text(element) {
    return clean(element?.innerText || element?.textContent);
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

  function findLabeledMoney(value, labels) {
    const normalized = clean(value);
    for (const label of labels) {
      const expression = new RegExp('(?:^|\\s)' + label + '\\s*[:\\-]?\\s*(-?\\$\\s*[\\d,]+(?:\\.\\d{2})?)', 'i');
      const match = normalized.match(expression);
      if (match) return money(match[1]);
    }
    return '';
  }

  function getOrderCards() {
    const cards = [];
    const seen = new Set();
    const anchors = document.querySelectorAll('a[href]');
    for (const anchor of anchors) {
      const id = orderIdFromPath(anchor.href);
      if (!id) continue;
      let card = anchor.closest('[data-testid*="order" i], article, li, [class*="order-card" i], [class*="purchase-card" i]');
      if (!card) {
        card = anchor.parentElement;
        for (let i = 0; i < 4 && card?.parentElement; i++) {
          const candidate = card.parentElement;
          const content = text(candidate);
          if (content.length > 60 && content.length < 1600) {
            card = candidate;
            break;
          }
          card = candidate;
        }
      }
      const cardText = text(card).slice(0, 3000);
      const url = new URL(anchor.href, location.origin).href;
      if (!seen.has(id)) {
        seen.add(id);
        cards.push({
          id,
          url,
          date: findDate(cardText),
          total: findLabeledMoney(cardText, ['order total', 'total', 'charged']),
          summary: cardText.slice(0, 180),
          source: 'history'
        });
      }
    }
    const candidates = document.querySelectorAll('article, li, [data-testid*="order" i], [class*="order-card" i]');
    for (const node of candidates) {
      const content = text(node);
      if (content.length < 25 || content.length > 2200) continue;
      const id = findOrderId(content);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      cards.push({
        id,
        url: new URL('/orders/' + encodeURIComponent(id), location.origin).href,
        date: findDate(content),
        total: findLabeledMoney(content, ['order total', 'total', 'charged']),
        summary: content.slice(0, 180),
        source: 'history-guessed-url'
      });
    }
    return cards;
  }

  function findQuantity(value) {
    const found = clean(value).match(/\b(?:qty|quantity)\s*[:x]?\s*(\d+(?:\.\d+)?)/i);
    return found?.[1] || '1';
  }

  function printedItems() {
    const results = [];
    document.querySelectorAll('.print-items-list').forEach(node => {
      const head = node.children[0] || node;
      const name = readFirst(head, [':scope > :first-child', '[class*="name" i]', '[class*="description" i]']);
      const description = text(node);
      const qty = findQuantity(description);
      const price = money(readFirst(head, ['[class*="price" i]', ':scope > :nth-child(2) > :nth-child(3)', ':scope > :nth-child(2)']) || description);
      const status = readFirst(head, ['[class*="status" i]', ':scope > :nth-child(2) > :first-child']);
      if (name && name.length > 2) results.push({name, qty, price, status, source: 'printed-receipt'});
    });
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
      const price = money(readFirst(node, ['[data-testid*="price" i]', '[class*="item-price" i]', '[class*="price" i]']) || description);
      const qty = findQuantity(description);
      const status = readFirst(node, ['[data-testid*="status" i]']);
      if (!results.some(item => item.name === name && item.price === price && item.qty === qty)) {
        results.push({name, qty, price, status, source: 'order-details'});
      }
    }
    return results;
  }

  function extractDetails() {
    const pageText = clean(document.body?.innerText || '').slice(0, 120000);
    const id = orderIdFromPath(location.href) ||
      readFirst(document, ['.print-bill-bar-id', '[data-testid="order-number"]']).match(/[\d-]{10,28}/)?.[0] ||
      findOrderId(pageText);
    const printedDate = readFirst(document, ['.print-bill-date']);
    const totalContainer = document.querySelector('.bill-order-total-payment');
    const totalFromPrinted = totalContainer ? money(text(totalContainer.lastElementChild || totalContainer)) : '';
    const items = printedItems();
    if (items.length === 0) items.push(...normalItems());
    const date = findDate(printedDate) || findDate(pageText.slice(0, 5000));
    const total = totalFromPrinted || findLabeledMoney(pageText, ['order total', 'total paid', 'charged', 'grand total']);
    const subtotal = findLabeledMoney(pageText, ['subtotal', 'items subtotal']);
    const tax = findLabeledMoney(pageText, ['estimated tax', 'tax']);
    const tip = findLabeledMoney(pageText, ['driver tip', 'tip']);
    const status = readFirst(document, ['[data-testid="order-status"]', '[data-testid="delivery-status"]']);
    const gated = /(?:sign in to (?:your|the) account|verify you are human|unusual traffic|access denied)/i.test(pageText.slice(0, 1800));
    return {id, url: location.href, date, total, subtotal, tax, tip, status, items, gated, source: 'details'};
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
      try {
        sendResponse({order: extractDetails()});
      } catch (error) {
        sendResponse({error: error.message});
      }
    }
  });
})();
