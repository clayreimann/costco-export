# costco-export

A Chrome/Arc extension for bulk export of Costco receipt data, focused on item-level receipt export for out-of-band spending analysis.

## Planning

- [Architecture and build plan](docs/ARCHITECTURE.md)

## Fixtures

The `examples/` directory contains saved Costco pages used to design and test parsers:

- `Orders & Purchases _ Costco.html` — order-history list with in-warehouse receipt entries.
- `View Recipt _ Orders & Purchases _ Costco.html` — receipt detail/modal with item rows, discounts, totals, taxes, tender, and warehouse metadata.
