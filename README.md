# Walmart Personal Purchase Exporter

A free, local only Chrome and Microsoft Edge extension for exporting purchase history visible in your signed-in Walmart.com account. It has no backend, analytics, paid tier, registration, or password collection.

## Install in Chrome

1. Download the [extension ZIP](https://github.com/gccornejo441/Walmart-Personal-Purchase-Exporter/raw/refs/heads/main/releases/walmart-personal-purchase-exporter-v1.1.1.zip) or download this repository ZIP and extract it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted folder that contains `manifest.json`. For a release ZIP, extract it first.
5. Pin the extension, then visit [Walmart Purchase History](https://www.walmart.com/orders) in a tab where you are already signed in.

## Install in Microsoft Edge

1. Download and extract the [extension ZIP](https://github.com/gccornejo441/Walmart-Personal-Purchase-Exporter/raw/refs/heads/main/releases/walmart-personal-purchase-exporter-v1.1.1.zip).
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

If a date is blank in Orders CSV, Walmart did not show a date in the order card the extension could read. Try **Fetch itemized receipts**, which may find the date on the individual order page, then download **Orders CSV** again. If it is still blank, that order page did not expose a readable date; the extension leaves it blank rather than guessing. After scanning, the extension also tells you how many saved orders have no date yet.

For an order that still has no item rows, open that order on Walmart and, if available, its printable receipt. Then click **Save current receipt** in the extension. Results are saved after each order, so completed work remains on your computer if you stop and continue later. Use **Clear data** only if you want to delete the saved purchases from this browser.

The orders CSV contains one row per order. The items CSV distinguishes a confirmed unit price and line total; where Walmart's page does not make the amount clear, those columns remain blank and the displayed amount is preserved separately. The extension does not invent missing data.

## Local development and tests

Requires Node.js 20 or newer for the fixture tests.

```sh
npm install
npm test
npm run package
```

`npm run package` creates a versioned ZIP in `releases/`, containing only the unpacked extension files. Load the project folder directly during development.

## Privacy

- Purchase records are stored with `chrome.storage.local` on this browser profile.
- Data is read from Walmart pages in your current authenticated browser session. The extension never asks for or reads your password.
- No purchase data is transmitted to an external service; there are no analytics or third party calls.
- Do not commit exported CSV/JSON files, screenshots, receipts, HAR files, or account specific data. The ignore rules cover common export and receipt locations.
- Clear extension data before changing Walmart accounts on the same browser profile.

## Troubleshooting

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
