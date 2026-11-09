# Walmart Personal Purchase Exporter

A free, local only Chrome and Microsoft Edge extension for exporting purchase history visible in your signed-in Walmart.com account. It has no backend, analytics, paid tier, registration, or password collection.

## Install in Chrome

1. Download the [latest release ZIP](https://github.com/gccornejo441/Walmart-Personal-Purchase-Exporter/releases) or download this repository ZIP and extract it.
2. Open `chrome://extensions`.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted folder that contains `manifest.json`. For a release ZIP, extract it first.
5. Pin the extension, then visit [Walmart Purchase History](https://www.walmart.com/orders) in a tab where you are already signed in.

## Install in Microsoft Edge

1. Download and extract the release ZIP.
2. Open `edge://extensions`.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted folder containing `manifest.json`.
5. Pin the extension and open Walmart Purchase History in a signed-in tab.

## Use

1. On Walmart Purchase History, click **Scan purchase history**. The extension scrolls the currently open history page and attempts to reveal dynamically loaded orders.
2. Visit any additional history pages or date ranges Walmart makes available, and scan each one. Previously saved orders are retained and merged using their order IDs.
3. Choose **Fetch itemized receipts** to process saved order links in batches. Results save locally after each order, so closing or interrupting the popup leaves completed work available. Retry later to resume incomplete/failed orders.
4. For an order the automated extractor cannot itemize, open its receipt or printable receipt in Walmart and use **Save current receipt**.
5. Export **Orders CSV**, **Items CSV**, or **JSON backup**. CSVs are UTF-8 with a BOM for Excel. Use **Clear data** to delete locally stored records.

The orders CSV contains one row per order. The items CSV distinguishes a confirmed unit price and line total; where Walmart's page does not make the amount clear, those columns remain blank and the displayed amount is preserved separately. The extension does not invent missing data.

## Local development and tests

Requires Node.js 20 or newer for the fixture tests.

```sh
npm install
npm test
npm run package
```

`npm run package` creates `releases/walmart-personal-purchase-exporter-v1.1.0.zip`, containing only the unpacked extension files. Load the project folder directly during development.

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
