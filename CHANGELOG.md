# Changelog

## 1.1.0 - 2026-11-09

- Added automated DOM fixture tests and a repeatable release ZIP script.
- Improved text normalization and quantity, product ID, unit price, and line total extraction.
- Added explicit extraction status and attempt timestamps for incomplete/failed item retrieval.
- Added item CSV columns that keep ambiguous displayed prices separate from confirmed unit and line totals.
- De-duplicated order and item exports, and retained formula-safe Excel CSV output.
- Expanded ignore rules for exported purchase data, receipts, local dependencies, and environment files.
- Documented Chrome/Edge installation, usage, privacy, limitations, and troubleshooting.
