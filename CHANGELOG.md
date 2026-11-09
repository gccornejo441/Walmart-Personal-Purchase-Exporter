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
