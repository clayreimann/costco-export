# Costco Export Extension Architecture and Build Plan

## Goal

Build a local-first Chrome/Arc extension that runs on `costco.com` order pages, collects Costco order and receipt details, normalizes them into stable structured data, and exports item-level spending data for categorization and analysis.

The design is inspired by Amazon order-history extensions such as AZAD/Amazon Order History Reporter: the user authenticates directly with the retailer, the extension operates from the orders page, shows scrape progress in the extension UI, visits order/receipt detail pages as needed, and exports CSV/JSON locally. Costco differs in two important ways:

1. In-warehouse Costco receipts often contain many line items, discounts, tax markers, tender details, warehouse/register metadata, and receipt identifiers.
2. The primary analysis unit should be the receipt line item, not just the order, so users can split one receipt across categories such as groceries, household goods, pharmacy, auto, seasonal, and other buckets.

## Current example pages

The `examples/` directory contains two saved Costco pages that should become parser fixtures:

- `Orders & Purchases _ Costco.html` shows the order-history list with repeated in-warehouse order cards, date/time, warehouse location, total, and `View Receipt` buttons.
- `View Recipt _ Orders & Purchases _ Costco.html` shows a receipt modal/table with member number, receipt barcode/id, item rows, markdown/instant-savings rows, subtotal, tax, tender, receipt date/time, warehouse/register metadata, item count, and final total.

## Product principles

- **Local-first privacy:** no hosted backend is required for MVP. HTML parsing, categorization, storage, and export happen in the browser.
- **Least privilege:** request host access only for Costco domains and avoid privileged APIs such as `debugger` unless a later feature absolutely requires them.
- **User-driven scraping:** the user opens Costco Orders & Purchases, selects a date range, and starts export from the extension popup/side panel.
- **Incremental and resumable:** save scrape state after each receipt so long Costco histories can continue after interruption.
- **Transparent data quality:** every parsed receipt and item should carry status, warnings, source URL, and raw text snippets sufficient to debug parser drift.
- **Item-level categorization:** category assignment should be visible, editable, and exportable, with confidence/source metadata.

## Proposed extension architecture

Use a Manifest V3 extension with five logical layers.

```text
extension/
  manifest.json
  src/
    background/        # service worker orchestration and tab lifecycle
    content/           # Costco DOM adapters injected into costco.com
    parsers/           # pure HTML/DOM-to-domain parsing functions
    domain/            # schemas, normalization, category rules, exporters
    ui/                # popup or side panel for controls, progress, review
    storage/           # chrome.storage/IndexedDB repositories and migrations
    tests/             # parser fixture tests using examples/*.html
```

### 1. UI layer

A popup is enough for the first prototype, but a side panel is likely better once category review is added.

Responsibilities:

- Detect whether the active tab is a supported Costco orders page.
- Let the user choose mode: current page, visible date range, selected months, or all loaded receipts.
- Display progress: discovered orders, receipts fetched, parser failures, skipped duplicates, and export readiness.
- Provide exports: `items.csv`, `receipts.csv`, `orders.json`, and optionally a Tiller/YNAB-friendly transaction split CSV.
- Provide category review: group uncategorized line items by normalized item name / item number, allow bulk assignment, and persist rules.

### 2. Background service worker

Responsibilities:

- Coordinate the scrape job state machine.
- Open/reuse a Costco tab and ask content scripts to inspect the current page.
- Navigate/click into receipts when the receipt is only available behind a modal or detail route.
- Rate-limit actions to avoid hammering Costco and to keep the browser responsive.
- Persist checkpoints after every receipt.
- Own download/export creation via `chrome.downloads`.

Suggested job states:

```text
idle -> discoveringOrders -> queueingReceipts -> fetchingReceipt -> parsingReceipt
     -> categorizing -> readyToExport -> exporting -> complete
                       \-> paused/error/loginRequired
```

### 3. Content scripts / Costco adapters

Content scripts should avoid business logic. They should be thin adapters that observe Costco pages and return serialized HTML/text/links to the background worker.

Adapters:

- `ordersPageAdapter`
  - Detects the orders list page.
  - Extracts visible order cards.
  - Reads order type, date, time, warehouse/location, order total, and the stable receipt/modal target id from `View Receipt` buttons.
  - Supports clicking `View Receipt` and waiting for the receipt modal.
- `receiptModalAdapter`
  - Detects the receipt modal/table.
  - Returns a minimal DOM snapshot for the receipt container.
  - Closes the modal after successful parsing.
- `paginationOrFilterAdapter`
  - Detects date filters, tabs, `Back to Top`, lazy-loaded content, and any pagination/infinite scroll behavior.
  - Provides operations like `selectDateRange`, `scrollUntilStable`, and `nextPage` if needed.

Selectors should prefer semantic attributes found in examples, such as `automation-id`, `data-testid`, button text, table roles, and visible labels. CSS class names generated by Material UI should be treated as unstable fallbacks.

### 4. Parser/domain layer

Parsers should be pure functions with no Chrome APIs so they are easy to unit test against saved HTML fixtures.

Key parsers:

- `parseOrdersPage(document): OrderSummary[]`
- `parseReceipt(documentOrElement, context): Receipt`
- `normalizeReceipt(receipt): NormalizedReceipt`
- `linkDiscountRows(items): ReceiptItem[]`
- `categorizeItems(items, rules): CategorizedItem[]`

Important receipt parsing rules:

- Treat normal item rows as rows with item number, description, and amount/tax flag.
- Treat rows with descriptions like `/ 5331` or `/1984539` and negative amounts as discount/instant-savings rows; attach them to the nearest matching prior item number when possible.
- Treat rows like `2 @ 5.49` as quantity/unit-price metadata for the following or preceding item, depending on observed receipt layout; preserve an ambiguity warning until fixture tests confirm the pattern.
- Stop item parsing at summary labels such as `SUBTOTAL`, `TAX`, `Total`, payment/tender rows, `TOTAL TAX`, and `TOTAL NUMBER OF ITEMS SOLD`.
- Preserve raw row text and parser warnings so receipt-format changes are diagnosable.

### 5. Storage/export layer

Use IndexedDB for receipt/item data because Costco histories can have many receipt rows. Use `chrome.storage.local` only for preferences, scrape checkpoints, and category rules.

Data stores:

- `scrapeJobs`: job id, selected range, status, counts, timestamps, current queue.
- `receipts`: one row per Costco receipt, keyed by `receiptId` or a synthetic key.
- `items`: one row per parsed receipt line item, keyed by `receiptId + lineIndex`.
- `categoryRules`: user-maintained mapping rules by item number, normalized name, regex, or exact name.
- `exports`: metadata for generated downloads.

## Data model

### Receipt

```ts
export interface CostcoReceipt {
  schemaVersion: 1;
  receiptId: string;
  source: 'in_warehouse' | 'online' | 'same_day' | 'unknown';
  sourceUrl?: string;
  orderListId?: string;
  warehouse?: {
    name?: string;
    number?: string;
    terminal?: string;
    transaction?: string;
    operator?: string;
  };
  purchasedAt?: string; // ISO timestamp when date + time are available
  memberNumberMasked?: string;
  subtotal?: number;
  tax?: number;
  total?: number;
  tender?: Array<{
    type: string;
    last4?: string;
    amount?: number;
  }>;
  itemCountReported?: number;
  instantSavingsTotal?: number;
  items: CostcoReceiptItem[];
  warnings: string[];
  raw: {
    receiptTextHash: string;
    parserVersion: string;
  };
}
```

### Receipt item

```ts
export interface CostcoReceiptItem {
  lineIndex: number;
  itemNumber?: string;
  description: string;
  normalizedDescription: string;
  quantity?: number;
  unitPrice?: number;
  grossAmount: number;
  discounts: Array<{
    itemNumber?: string;
    description: string;
    amount: number;
  }>;
  netAmount: number;
  taxable?: boolean;
  foodStampEligible?: boolean; // if receipt marker semantics are confirmed
  category?: string;
  categoryConfidence?: number;
  categorySource?: 'user_rule' | 'built_in_rule' | 'manual' | 'uncategorized';
  rawText: string;
  warnings: string[];
}
```

## Categorization strategy

Start simple and make the system learn from corrections.

1. Built-in seed rules for obvious keywords and known Costco item-number examples:
   - groceries: berries, milk, beans, rice, bananas, broccoli, meat, pasta sauce.
   - household: paper towels, toilet paper, cleaning supplies.
   - auto: wiper fluid, tires, car wash, battery.
   - pharmacy/health: vitamins, prescriptions, OTC medicine.
   - seasonal/home: patio, sunshade, appliance, furniture.
2. User rules override built-in rules:
   - exact item number is highest confidence.
   - normalized description exact match is next.
   - regex/keyword rules are lower confidence.
3. Category review screen shows uncategorized and low-confidence items grouped by item number/name.
4. Export includes both raw Costco text and category metadata so analysis can be revised later.

## Export formats

### `receipts.csv`

One row per receipt:

- receipt_id
- purchased_at
- source
- warehouse_name
- warehouse_number
- subtotal
- tax
- total
- instant_savings_total
- item_count_reported
- parser_warnings

### `items.csv`

One row per item:

- receipt_id
- purchased_at
- warehouse_name
- line_index
- item_number
- description
- normalized_description
- quantity
- unit_price
- gross_amount
- discount_amount
- net_amount
- taxable
- category
- category_source
- category_confidence
- raw_text
- warnings

### `orders.json`

Complete nested receipt objects with parser metadata and raw/debug fields for reprocessing.

## Build plan

### Milestone 0: Repository foundation

- Add a package manager and TypeScript build setup.
- Add Manifest V3 extension skeleton.
- Add fixture-test infrastructure that can parse saved Costco HTML under `examples/`.
- Define JSON schemas/types for receipts, items, category rules, and exports.

### Milestone 1: Parser-first prototype

- Implement `parseOrdersPage` against `examples/Orders & Purchases _ Costco.html`.
- Implement `parseReceipt` against `examples/View Recipt _ Orders & Purchases _ Costco.html`.
- Add golden JSON fixtures for parsed order summaries and receipt line items.
- Add tests for discounts, summary rows, tender rows, tax markers, and item count validation.

### Milestone 2: Manual current-receipt export

- Build the extension popup.
- Inject a content script into the active Costco receipt page/modal.
- Parse the current visible receipt.
- Download `items.csv` and `orders.json` for the current receipt.

### Milestone 3: Orders page discovery and modal scraping

- Parse visible order cards from the orders list.
- Click each `View Receipt` button, wait for modal content, parse the receipt, close modal, and proceed.
- Add progress UI, pause/resume, dedupe by receipt id, and error capture.

### Milestone 4: Date range and history scraping

- Support Costco date filters/tabs and lazy-loaded history.
- Add durable IndexedDB checkpoints.
- Add retry handling for login/session expiration and modal load failures.
- Add rate limiting and user-visible diagnostics.

### Milestone 5: Categorization and review

- Add seed category rules and rule precedence.
- Add category review UI grouped by normalized item or item number.
- Persist user category overrides.
- Include category metadata in all exports.

### Milestone 6: Hardening and release packaging

- Add parser drift warnings and “unknown receipt format” diagnostics.
- Add privacy documentation.
- Add manual QA checklist for Chrome and Arc.
- Package an unpacked extension build and optionally a Chrome Web Store-ready zip.

## Testing plan

- **Unit tests:** pure parser tests using saved HTML fixtures.
- **Golden tests:** compare parsed JSON to approved fixture output to detect Costco DOM drift.
- **Property tests where practical:** amount parsing, negative discount parsing, currency normalization.
- **Extension integration tests:** run an unpacked extension in Playwright or Puppeteer against local fixture pages.
- **Manual Costco QA:** validate live login, date filtering, receipt modal load/close, and CSV download.

## Open questions

- Does Costco expose a stable JSON endpoint behind the orders page that would be more reliable than DOM parsing? Network inspection should be part of Milestone 0/1, but MVP should not depend on undocumented endpoints until confirmed.
- How do online delivery orders, same-day Instacart orders, returns, pharmacy, optical, tire, and membership purchases differ from the in-warehouse receipt fixture?
- Are `E`, `N`, and `Y` receipt markers consistent enough to map to food-stamp eligibility and taxable status, or should they remain raw flags until validated?
- Does a receipt item quantity row always follow or precede the item it describes? Fixture expansion is needed before automatic quantity attachment is trusted.
- Should category rules live only locally, or should the repo include a shareable optional rule pack?
