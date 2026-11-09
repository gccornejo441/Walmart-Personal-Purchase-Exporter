# Walmart Personal Purchase Exporter

A small, free Chrome / Microsoft Edge extension for exporting purchase history from your own signed-in Walmart.com account to CSV or JSON. No subscription, external service, analytics, network calls to third parties, or account password collection.

## Installation

1. Unzip `walmart-personal-exporter.zip` into a folder you intend to keep.
2. Go to `chrome://extensions` in Google Chrome, or `edge://extensions` in Microsoft Edge.
3. Turn on **Developer mode**.
4. Select **Load unpacked** and choose the extracted folder containing `manifest.json`.
5. Pin the extension to the toolbar.

Do not use Chrome's **Load unpacked** feature on the `.zip` file itself. Select the extracted directory.

## Using the extension

1. Sign in to Walmart using the normal website at https://www.walmart.com/orders.
2. Open the extension and click **Scan purchase history**. It will scroll the current history page, attempt to load additional cards, and save order links.
3. If Walmart has multiple history pages or date filters, visit each range/page and click **Scan purchase history** again. Saved orders are merged by order ID.
4. Click **Fetch itemized receipts** to retrieve details for 10 to 100 saved orders per batch. Keep the popup open during a batch. It processes one background tab at a time.
5. Export **Orders CSV**, **Items CSV**, or **JSON backup**. CSV opens in Excel.
6. For an order with undetected items, open its Walmart order detail page, display its printable receipt if available, and click **Save current receipt**.

The **Orders CSV** has one row per purchase, so you can sum order totals without accidentally double-counting them. The **Items CSV** has one row per detected item. Item prices are as displayed by Walmart and could be unit or extended prices depending on the receipt. Do not assume summing item prices equals the charged order total.

## Privacy

- Runs only on `https://www.walmart.com/orders*` and reads your signed-in order pages.
- Stores order information in local Chrome extension storage.
- No extension server, developer account, telemetry, or paid upgrade.
- Does not read passwords or cookies directly, bypass CAPTCHAs, or use external endpoints.
- Use **Clear data** in the popup to delete locally saved purchase data.
- Saved data is not isolated by Walmart account. Clear it before switching between different Walmart accounts.

## Known limitations

This is a first version, **not yet tested against a logged-in Walmart account**. Walmart's site structure can change. In particular:

- Order lists without direct links or unusual receipt pages may not be detected.
- Some itemized order pages may require opening **Print receipt** manually.
- Pagination controlled by Walmart's date filters or numbered pages may require you to visit each page and scan again.
- In-store transactions only appear when Walmart has linked them to your purchase history.
- Orders with no detected line items remain flagged as incomplete and can be retried.
- Large batches may be interrupted by Walmart sign-in prompts, page throttling, browser suspension, or the popup closing.
- There is no automatic Excel `.xlsx` generator; export CSV and open it in Excel.

If order collection or receipt extraction fails, capture the Walmart screen showing the order history or print receipt layout, with personal identifiers removed, and use it to update the selectors.

This tool is unofficial and is not affiliated with Walmart.
