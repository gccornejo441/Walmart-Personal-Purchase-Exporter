# Changelog

## 1.1.3 - 2026-11-09

- Added DOM extraction of product-linked item rows for order pages without the previous data-test selectors.
- Improved parsing of printable receipt item names, quantities, and displayed prices.
- Scrolls order detail pages and expands read-only item sections before extracting items.
- Tries same-order receipt links when Walmart exposes a navigable printable page.
- Added privacy-safe structural diagnostics export to diagnose missing item lists without exposing purchase details.
- Clarified batch results to distinguish itemization from verified dates.
- Added fixture-based regression coverage for printable receipts, linked product cards, and diagnostics.

## 1.1.2 - 2026-11-09

- Fixed returns links being saved as receipt links; links now point to canonical order details, retaining store context when present.
- Exports only complete, validated purchase dates in YYYY-MM-DD format.
- Added Date Status and Original Date Text CSV columns for auditing unresolved dates.
- Normalizes existing saved order data without deleting purchases.
- Receipt fetching now attempts to repair missing dates even when an order already has items.
- Added regression tests for returns links, partial dates, timestamps, migration, and date recovery.
- Added CI tests and a downloadable extension package artifact.

# Changelog

## 1.1.1 - 2026-11-09

- Made first-use steps clearer and explained the difference between Orders CSV and Items CSV.
- Replaced the empty-items error with direct instructions for collecting item receipts.
- Improved date discovery from Walmart `time` elements, date labels, ISO dates, and dates shown without a year.
- Reports how many saved orders still have no extracted date and explains how receipt fetching may fill it.

## 1.1.0 - 2026-11-09

- Added automated DOM fixture tests and a repeatable release ZIP script.
- Improved text normalization and quantity, product ID, unit price, and line total extraction.
- Added explicit extraction status and attempt timestamps for incomplete/failed item retrieval.
- Added item CSV columns that keep ambiguous displayed prices separate from confirmed unit and line totals.
- De-duplicated order and item exports, and retained formula-safe Excel CSV output.
- Expanded ignore rules for exported purchase data, receipts, local dependencies, and environment files.
- Documented Chrome/Edge installation, usage, privacy, limitations, and troubleshooting.
