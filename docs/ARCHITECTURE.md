# Costco Export Extension Architecture and Build Plan

## Goal

Build a local-first Chrome/Arc extension that runs on `costco.com` order pages, collects Costco order and receipt details, normalizes them into stable structured data, and exports item-level spending data for analysis.

The design is inspired by Amazon order-history extensions such as AZAD/Amazon Order History Reporter: the user authenticates directly with the retailer, the extension operates from the orders page, shows scrape progress in the extension UI, visits order/receipt detail pages as needed, and exports CSV/JSON locally. Costco differs in two important ways:

1. In-warehouse Costco receipts often contain many line items, discounts, tax markers, tender details, warehouse/register metadata, and receipt identifiers.
2. The primary analysis unit should be the receipt line item, not just the order, so another process can categorize spending out of band.

## Current example pages

The `examples/` directory contains two saved Costco pages that should become parser fixtures:

- `Orders & Purchases _ Costco.html` shows the order-history list with repeated in-warehouse order cards, date/time, warehouse location, total, and `View Receipt` buttons.
- `View Recipt _ Orders & Purchases _ Costco.html` shows a receipt modal/table with member number, receipt barcode/id, item rows, markdown/instant-savings rows, subtotal, tax, tender, receipt date/time, warehouse/register metadata, item count, and final total.

## Product principles

- **Local-first privacy:** no hosted backend is required. HTML parsing, receipt review, and export happen in the browser for the current session.
- **Least privilege:** request host access only for Costco domains and avoid privileged APIs such as `debugger` unless a later feature absolutely requires them.
- **User-driven scraping:** the user opens Costco Orders & Purchases, selects a date range, and starts export from the extension popup/side panel.
- **Session-only workflow:** keep scrape results in memory long enough to render a review page and download exports; do not require IndexedDB, `localStorage`, or durable checkpoints.
- **Transparent data quality:** every parsed receipt and item should carry status, warnings, source URL, and raw text snippets sufficient to debug parser drift.
- **Item visibility, not categorization:** the extension should make receipt line items easy to inspect and export; categorization is explicitly out of scope and should happen out of band.

## Proposed extension architecture

Use a Manifest V3 extension with five logical layers.

```text
extension/
  manifest.json
  src/
    background/        # service worker orchestration and tab lifecycle
    content/           # Costco DOM adapters injected into costco.com
    parsers/           # pure HTML/DOM-to-domain parsing functions
    domain/            # schemas, normalization, exporters
    ui/                # popup or side panel for controls, progress, review
    tests/             # parser fixture tests using examples/*.html
```

### 1. UI layer

A popup is enough for the first prototype, but a side panel is likely better once larger receipt review is added.

Responsibilities:

- Detect whether the active tab is a supported Costco orders page.
- Let the user choose mode: current page, visible date range, selected months, or all loaded receipts.
- Display progress: discovered orders, receipts fetched, parser failures, skipped duplicates, and export readiness.
- Provide exports: `items.csv`, `receipts.csv`, `orders.json`, and TOON, and optionally a Tiller/YNAB-friendly transaction split CSV.
- Provide a receipt review view: group item rows under each receipt so the user can visually inspect purchases before download.

### 2. Background service worker

Responsibilities:

- Coordinate the scrape job state machine.
- Open/reuse a Costco tab and ask content scripts to inspect the current page.
- Navigate/click into receipts when the receipt is only available behind a modal or detail route.
- Rate-limit actions to avoid hammering Costco and to keep the browser responsive.
- Keep current-run scrape results in memory until the review/export page is closed.
- Own download/export creation via `chrome.downloads`.

Suggested job states:

```text
idle -> discoveringOrders -> queueingReceipts -> fetchingReceipt -> parsingReceipt
     -> renderingReview -> readyToExport -> exporting -> complete
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

Important receipt parsing rules:

- Treat normal item rows as rows with item number, description, and amount/tax flag.
- Treat rows with descriptions like `/ 5331` or `/1984539` and negative amounts as discount/instant-savings rows; attach them to the nearest matching prior item number when possible.
- Treat rows like `2 @ 5.49` as quantity/unit-price metadata for the following or preceding item, depending on observed receipt layout; preserve an ambiguity warning until fixture tests confirm the pattern.
- Stop item parsing at summary labels such as `SUBTOTAL`, `TAX`, `Total`, payment/tender rows, `TOTAL TAX`, and `TOTAL NUMBER OF ITEMS SOLD`.
- Preserve raw row text and parser warnings so receipt-format changes are diagnosable.

### 5. Review/export layer

No durable browser persistence is required for the MVP. The background worker can keep the active scrape results in memory, render them in a generated review page or extension page, and immediately offer downloads. If the browser or service worker restarts, the user can rerun the scrape rather than resuming from IndexedDB or local storage.

Responsibilities:

- Hold the active scrape result in memory for the current browser session.
- Render a receipt-centric review view where each receipt expands to show item rows, discounts, subtotal, tax, total, and parser warnings.
- Generate downloads for CSV, JSON, and TOON from the in-memory result.
- Avoid storing receipt history, category rules, or scrape checkpoints in IndexedDB, `localStorage`, or `chrome.storage` unless a future requirement changes this scope.

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
  rawText: string;
  warnings: string[];
}
```

## Out-of-scope categorization

The extension should not categorize spending. Its responsibility is to expose the raw receipt structure clearly enough for another process to categorize out of band. To support that downstream process, exports should preserve:

- receipt identity, date/time, warehouse, totals, tax, and tender metadata;
- item number, raw description, normalized description, quantity/unit-price hints, gross amount, discounts, net amount, taxable marker, and raw row text;
- parser warnings and source context for auditability.

Do not add category rules, category review UI, confidence scores, category persistence, IndexedDB, `localStorage`, or durable scrape storage unless the project scope changes.

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
- raw_text
- warnings

### `orders.json`

Complete nested receipt objects with parser metadata and raw/debug fields for reprocessing.

### TOON

TOON (Token-Oriented Object Notation) should be supported as an additional structured export for workflows that prefer compact, LLM-friendly object notation. The TOON export should contain the same semantic data as `orders.json`, including receipts, items, discounts, totals, and parser warnings, but encoded in TOON rather than JSON. Keep field names aligned with the JSON schema so downstream tools can transform between the two formats predictably.

## Build plan

### Milestone 0: Repository foundation

- Add a package manager and TypeScript build setup.
- Add Manifest V3 extension skeleton.
- Add fixture-test infrastructure that can parse saved Costco HTML under `examples/`.
- Define JSON schemas/types for receipts, items, and exports.

### Milestone 1: Parser-first prototype

- Implement `parseOrdersPage` against `examples/Orders & Purchases _ Costco.html`.
- Implement `parseReceipt` against `examples/View Recipt _ Orders & Purchases _ Costco.html`.
- Add golden JSON fixtures for parsed order summaries and receipt line items.
- Add tests for discounts, summary rows, tender rows, tax markers, and item count validation.

### Milestone 2: Manual current-receipt export

- Build the extension popup.
- Inject a content script into the active Costco receipt page/modal.
- Parse the current visible receipt.
- Render the current receipt with item rows and download `items.csv`, `orders.json`, and TOON for the current receipt.

### Milestone 3: Orders page discovery and modal scraping

- Parse visible order cards from the orders list.
- Click each `View Receipt` button, wait for modal content, parse the receipt, close modal, and proceed.
- Add progress UI, dedupe by receipt id within the current run, and error capture.

### Milestone 4: Date range and history scraping

- Support Costco date filters/tabs and lazy-loaded history.
- Add retry handling for login/session expiration and modal load failures.
- Add rate limiting and user-visible diagnostics.

### Milestone 5: Hardening and release packaging

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

## Agent implementation playbook

This section is intended for future coding agents. Treat each work package as a small PR-sized task with clear inputs, outputs, acceptance criteria, and handoff notes. Agents should work parser-first, keep Chrome-specific code thin, and avoid changing fixture HTML unless adding a new anonymized fixture.

### Global workflow for every agent

1. **Read this document and the README first.** Confirm the current milestone and avoid implementing later-milestone UI before parser contracts are stable.
2. **Inspect existing files before adding new ones.** Prefer extending established folders and scripts once they exist.
3. **Keep pure logic separate from extension glue.** Anything that can be tested without Chrome belongs in `src/parsers`, `src/domain`, or `src/export` abstractions.
4. **Write or update tests with each parser/domain change.** Parser changes must include fixture-based tests or golden-output updates.
5. **Record parser assumptions as warnings.** If Costco markup is ambiguous, preserve the raw text and emit a warning rather than silently guessing.
6. **Use stable selectors.** Prefer `automation-id`, `data-testid`, ARIA roles, labels, text content, and table structure. Avoid Material UI generated CSS classes except as last-resort fallback selectors.
7. **Do not add a backend.** The default design is local-first. Any external API or sync service should be proposed separately.
8. **Protect personal data.** Do not commit new fixtures containing full names, member numbers, card numbers, addresses, or unredacted receipt identifiers.
9. **End each task with a handoff note.** Include changed files, tests run, known limitations, and the next recommended task.

### Recommended task sequencing

The fastest reliable path is to let agents work in this order:

```text
A. Tooling and extension skeleton
B. Domain model and parser fixtures
C. Orders-list parser
D. Receipt parser
E. CSV/JSON/TOON exporters
F. Content-script adapters for live Costco pages
G. Background scrape state machine
H. Popup/side-panel review UI
I. Integration tests and packaging
```

Agents can work in parallel only when their file ownership is disjoint. For example, one agent can implement TOON/CSV exporters while another implements parser tests after the domain model stabilizes. Do not run two agents against the same parser file at the same time.

### Work package A: Tooling and extension skeleton

**Goal:** create a minimal, testable TypeScript Manifest V3 extension scaffold.

**Inputs:** this document, `README.md`, and existing `examples/` fixtures.

**Suggested file ownership:**

- `package.json`
- package-lock or equivalent lockfile
- `tsconfig.json`
- `vite.config.ts` or equivalent build config
- `extension/manifest.json`
- `extension/src/background/index.ts`
- `extension/src/content/index.ts`
- `extension/src/ui/popup.*`
- test configuration files

**Implementation steps:**

1. Choose a lightweight TypeScript build setup that can emit MV3-compatible files into `dist/`.
2. Add scripts for `build`, `test`, `lint` or `typecheck` as appropriate.
3. Add `manifest.json` with minimal permissions:
   - `activeTab`
   - `scripting`
   - `downloads`
   - host permissions for `https://www.costco.com/*`.
4. Add a minimal background service worker that responds to a health-check message.
5. Add a minimal content script that can report the page title and URL.
6. Add a minimal popup that shows whether the current tab looks like Costco.
7. Ensure `npm run build` produces an unpacked extension directory.

**Acceptance criteria:**

- `npm install` or the chosen package-manager install succeeds.
- `npm run build` creates a loadable unpacked MV3 extension.
- `npm test` or `npm run typecheck` passes.
- No parser or scraping behavior is implemented yet beyond health checks.

**Handoff:** next agent should implement domain schemas and fixture-test helpers before adding live scraping.

### Work package B: Domain model and fixture harness

**Goal:** define stable TypeScript contracts and create parser fixtures from saved Costco HTML.

**Suggested file ownership:**

- `extension/src/domain/types.ts`
- `extension/src/domain/money.ts`
- `extension/src/domain/normalize.ts`
- `extension/src/parsers/parserWarnings.ts`
- `extension/src/tests/fixtures.ts`
- `extension/src/tests/fixtures/*.golden.json`

**Implementation steps:**

1. Convert the receipt and item interfaces in this document into TypeScript types.
2. Add `OrderSummary`, `ScrapeJob`, and export-row types.
3. Implement shared helpers for currency parsing, receipt id normalization, text normalization, and stable hashing.
4. Build a fixture loader that reads `examples/*.html` in tests.
5. Add placeholder golden JSON files with the expected fixture names and schema versions.
6. Add tests that verify fixtures can be loaded and parsed into a DOM-like structure.

**Acceptance criteria:**

- Domain types compile with strict TypeScript settings.
- Fixture tests can load both saved Costco HTML examples.
- Helpers have unit tests for currency strings such as `$207.00`, `4.00-`, ` 5.20`, and empty values.

**Handoff:** parser agents should import only these domain types and helpers, not Chrome APIs.

### Work package C: Orders-list parser

**Goal:** parse visible order cards from `Orders & Purchases _ Costco.html`.

**Suggested file ownership:**

- `extension/src/parsers/ordersPage.ts`
- `extension/src/parsers/ordersPage.test.ts`
- related golden fixture JSON for order summaries

**Implementation steps:**

1. Identify candidate order-card containers by locating `View Receipt` buttons and walking to their nearest meaningful card container.
2. Extract:
   - order type (`In-Warehouse`, online, or unknown)
   - order date and time
   - warehouse/location label
   - total amount
   - receipt button target id or stable DOM path
   - visible index on the page
3. Normalize dates to ISO where possible, preserving the original display text.
4. Generate a synthetic `orderListId` from date, time, warehouse/location, total, and visible button target when no receipt id is visible yet.
5. Emit warnings for missing date, total, or receipt action.
6. Add a golden test that asserts the fixture order count and representative parsed records.

**Acceptance criteria:**

- Parser finds all visible in-warehouse order cards in the saved orders fixture.
- Parser does not depend on generated MUI class names.
- Golden output includes enough fields to queue receipt scraping.

**Handoff:** content-script adapters can later call this parser on `document`, but should not duplicate this parsing logic.

### Work package D: Receipt parser

**Goal:** parse receipt modal/table content into item-level structured data.

**Suggested file ownership:**

- `extension/src/parsers/receipt.ts`
- `extension/src/parsers/receiptRows.ts`
- `extension/src/parsers/receipt.test.ts`
- receipt golden fixture JSON

**Implementation steps:**

1. Locate the receipt table/container by looking for receipt-specific text such as `Member`, `SUBTOTAL`, `TOTAL NUMBER OF ITEMS SOLD`, and barcode/receipt-number sections.
2. Convert table rows into normalized row objects with cell text, colspan, row index, and raw text.
3. Parse header metadata:
   - member number, masked if needed
   - receipt barcode/id when visible
   - warehouse, terminal, transaction, operator
   - purchase date and time
4. Parse item rows until summary rows begin.
5. Distinguish row kinds:
   - item row
   - discount row
   - quantity/unit row
   - subtotal/tax/total row
   - tender/payment row
   - footer/metadata row
   - unknown row
6. Attach discount rows to the closest matching item by item number; otherwise keep an unattached discount warning.
7. Attach quantity/unit rows only when the fixture confirms direction; otherwise preserve a warning and raw row.
8. Validate totals:
   - sum item gross minus discounts should approximately equal subtotal.
   - parsed final total should match tender amount when present.
   - parsed item count should match reported item count when quantity semantics are known.
9. Add golden tests for representative items, discount attachment, summary totals, tender rows, and warnings.

**Acceptance criteria:**

- Parser extracts every normal item from the saved receipt fixture.
- Parser extracts subtotal, tax, total, instant-savings total, item count, tender amount, and warehouse/register metadata when present.
- Discount rows are either attached to items or reported as warnings.
- Tests fail loudly if Costco changes the receipt table shape.

**Handoff:** exporter agents should consume only the normalized receipt output, not raw DOM rows.

### Work package E: CSV/JSON/TOON exporters

**Goal:** generate analysis-ready CSV, JSON, and TOON downloads from normalized receipts.

**Suggested file ownership:**

- `extension/src/export/itemsCsv.ts`
- `extension/src/export/receiptsCsv.ts`
- `extension/src/export/ordersJson.ts`
- `extension/src/export/ordersToon.ts`
- `extension/src/export/csv.ts`
- exporter tests

**Implementation steps:**

1. Implement safe CSV escaping for commas, quotes, newlines, and empty values.
2. Implement `receiptToReceiptCsvRow` and `receiptToItemCsvRows` mappers using the columns in this document.
3. Implement a TOON exporter with the same semantic fields as the JSON exporter and stable field ordering.
4. Include parser warnings and raw text fields for auditability.
5. Add tests using synthetic receipts and the receipt golden fixture.
6. Add a browser-facing helper that creates `Blob` objects or download payloads without directly calling `chrome.downloads`.

**Acceptance criteria:**

- CSV output opens correctly in spreadsheet tools.
- Numeric fields are not formatted with dollar signs in CSV data cells.
- JSON and TOON exports preserve complete nested receipt objects and schema versions.

**Handoff:** background-worker agents can call exporter helpers and then use `chrome.downloads` for actual downloads.

### Work package F: Content-script Costco adapters

**Goal:** bridge live Costco pages to pure parsers without duplicating domain logic.

**Suggested file ownership:**

- `extension/src/content/costcoPageDetection.ts`
- `extension/src/content/ordersPageAdapter.ts`
- `extension/src/content/receiptModalAdapter.ts`
- `extension/src/content/messages.ts`
- content adapter tests where feasible

**Implementation steps:**

1. Define typed messages for page detection, visible order discovery, open receipt, read receipt HTML, close receipt, scroll, and date-filter actions.
2. Implement page detection for orders list and receipt modal states.
3. Implement `discoverVisibleOrders` by invoking the pure orders parser against the live document.
4. Implement `openReceipt(orderActionRef)` by clicking the corresponding `View Receipt` button and waiting for modal content with a timeout.
5. Implement `readOpenReceipt` by returning the modal/container `innerHTML` plus source URL and order context.
6. Implement `closeReceipt` using the modal close button and verify the modal disappears.
7. Add defensive timeout errors with enough detail for the UI to display recovery instructions.

**Acceptance criteria:**

- Adapters have no export or review rendering logic.
- All content-script responses are serializable plain objects.
- Timeouts and missing selectors return structured errors rather than throwing uncaught exceptions.

**Handoff:** background orchestration can now queue visible orders and scrape receipt modals.

### Work package G: Background scrape orchestrator

**Goal:** implement a session-only, rate-limited scrape state machine.

**Suggested file ownership:**

- `extension/src/background/index.ts`
- `extension/src/background/scrapeJob.ts`
- `extension/src/background/tabController.ts`
- `extension/src/background/downloads.ts`
- related tests with mocked Chrome APIs

**Implementation steps:**

1. Define scrape job commands: start, pause, resume, cancel, getStatus, export.
2. Discover visible orders from the active Costco tab.
3. Queue receipt actions, dedupe already-scraped receipt ids, and process one receipt at a time.
4. For each receipt:
   - open modal
   - read receipt HTML
   - parse receipt
   - append receipt and items to the in-memory scrape result
   - close modal
5. Add rate limits between modal opens and page interactions.
6. Detect login/session failures and transition to `loginRequired` with instructions.
7. Surface progress events to popup/side panel UI.

**Acceptance criteria:**

- Scraping can be paused/cancelled without losing parsed receipts during the current browser session.
- A single receipt failure does not abort the entire job unless the page/session is unusable.
- Job status includes counts for discovered, queued, parsed, skipped, failed, and exported receipts.

**Handoff:** UI agents can subscribe to status and render progress controls.

### Work package H: Popup or side-panel UI

**Goal:** provide user controls for scrape, progress, receipt/item review, and export.

**Suggested file ownership:**

- `extension/src/ui/*`
- UI styles
- UI tests if framework supports them

**Implementation steps:**

1. Show active-tab support status and link users to Costco Orders & Purchases if unsupported.
2. Add buttons for discover, start, pause, resume, cancel, and export.
3. Render progress counts and latest error/warning messages.
4. Render discovered receipts and item rows in an inspectable receipt-centric view.
5. Render parser warnings beside affected receipts/items.
6. Keep UI state derived from background job status rather than duplicating state locally.

**Acceptance criteria:**

- UI remains usable when the background worker restarts.
- Unsupported pages show clear instructions instead of disabled mystery controls.
- User can scrape current visible orders, inspect receipt items, and download files once background/exporter work exists.

**Handoff:** downstream categorization should consume exported CSV/JSON/TOON outside this extension.

### Work package I: Integration tests, QA, and packaging

**Goal:** validate the full extension flow and produce a repeatable release artifact.

**Suggested file ownership:**

- integration test config and specs
- `docs/QA.md`
- `docs/PRIVACY.md`
- release/package scripts

**Implementation steps:**

1. Add local fixture pages that host the saved Costco HTML for browser automation.
2. Use Playwright or Puppeteer to load the unpacked extension and fixture pages.
3. Test page detection, order discovery, receipt modal parsing, and export payload generation.
4. Add manual QA steps for live Costco, Chrome, and Arc.
5. Add privacy documentation explaining local-only processing and exported data sensitivity.
6. Add packaging script for an unpacked build and optional zip.

**Acceptance criteria:**

- Integration tests can run without logging into Costco by using fixtures.
- Manual QA checklist is explicit enough for a new agent or human tester to follow.
- Packaging script produces a deterministic artifact from a clean checkout.

## Cross-agent contracts

### Message contracts

All extension message payloads should be typed and versioned. A recommended shape is:

```ts
type ExtensionRequest =
  | { type: 'PAGE_DETECT'; version: 1 }
  | { type: 'ORDERS_DISCOVER_VISIBLE'; version: 1 }
  | { type: 'RECEIPT_OPEN'; version: 1; orderActionRef: string }
  | { type: 'RECEIPT_READ_OPEN'; version: 1 }
  | { type: 'RECEIPT_CLOSE'; version: 1 }
  | { type: 'SCRAPE_START'; version: 1; options: ScrapeOptions }
  | { type: 'SCRAPE_STATUS'; version: 1 }
  | { type: 'EXPORT_DOWNLOAD'; version: 1; format: 'items_csv' | 'receipts_csv' | 'json' | 'toon' };
```

Responses should use a consistent result wrapper:

```ts
type ExtensionResult<T> =
  | { ok: true; value: T; warnings?: string[] }
  | { ok: false; error: { code: string; message: string; details?: unknown } };
```

### Parser output contract

Parser output must remain deterministic:

- Same input HTML and parser version should produce the same JSON.
- Parsed amounts should be numbers in dollars, not formatted strings.
- Raw text should be retained only where useful for debugging and export auditability.
- Every warning should include a stable warning code and enough context to find the source row.

### Error-code conventions

Use machine-readable error codes so UI and tests can react consistently:

- `UNSUPPORTED_PAGE`
- `LOGIN_REQUIRED`
- `ORDER_CARD_NOT_FOUND`
- `RECEIPT_BUTTON_NOT_FOUND`
- `RECEIPT_MODAL_TIMEOUT`
- `RECEIPT_PARSE_FAILED`
- `RECEIPT_TOTAL_MISMATCH`
- `EXPORT_FAILED`

### Definition of done for project tasks

A task is not complete until:

1. Relevant code is implemented in the agreed layer.
2. Unit or integration tests are added/updated, unless the task is documentation-only.
3. `npm run build` and the relevant test command pass, once tooling exists.
4. The README or architecture document is updated if behavior, scripts, or contracts changed.
5. The handoff notes identify remaining risks and next steps.
