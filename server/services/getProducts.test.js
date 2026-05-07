/**
 * getProducts() — Finished Goods → product lookup mapping.
 *
 * Regression guard for the bug where the helper used `Part No` /
 * `Part Description` keys against IFS Finished Goods rows that
 * actually carry `Catalog No` / `Catalog Desc`. Pre-fix, the
 * Order Entry datalist was a list of empty strings.
 *
 *   node --test server/services/getProducts.test.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getProducts, clearCache } from './dataSync.js';

test('getProducts maps Catalog No → partNo (string-coerced)', () => {
  clearCache();
  const products = getProducts();
  assert.ok(products.length > 0, 'expected at least one product loaded');
  for (const p of products.slice(0, 50)) {
    assert.equal(typeof p.partNo, 'string');
    assert.notEqual(p.partNo, '', 'partNo should be non-empty');
  }
});

test('getProducts populates description from Catalog Desc', () => {
  clearCache();
  const products = getProducts();
  // At least one product should have a non-empty description in any
  // realistic FG fixture (Catalog Desc is mandatory in IFS export).
  const withDesc = products.filter((p) => p.description && p.description.length > 0);
  assert.ok(withDesc.length > 0, 'expected products with non-empty descriptions');
});

test('getProducts populates customer from Association No', () => {
  clearCache();
  const products = getProducts();
  // Most FG rows carry an Association No (English customer name).
  // Allow some without — but the ratio should be majority.
  const withCustomer = products.filter((p) => p.customer && p.customer.length > 0);
  assert.ok(
    withCustomer.length > products.length * 0.5,
    `expected >50% products to have customer; got ${withCustomer.length}/${products.length}`
  );
});

test('getProducts filters out empty partNo entries', () => {
  clearCache();
  const products = getProducts();
  for (const p of products) {
    assert.notEqual(p.partNo, '', 'no product should have empty partNo after filter');
  }
});

test('getProducts is cached — second call returns identical reference', () => {
  clearCache();
  const a = getProducts();
  const b = getProducts();
  assert.equal(a, b, 'cache should return same array reference');
});

// ─── BOM/Routing lookup — string-coercion regression guard ───
//
// IFS exports purely numeric Part Nos as JS numbers. Strict equality
// returned 0 rows for any numeric PN before the fix (BOM Explosion
// always showed "No BOM data found"). Verifies CLAUDE.md lesson #21.

test('getBOMForPart string-coerces numeric PN', async () => {
  const { getBOMForPart, getManufacturingStructures } = await import('./dataSync.js');
  clearCache();
  // Find a product whose Parent Part No is stored as a number.
  const all = getManufacturingStructures();
  const numericRow = all.find((r) => typeof r['Parent Part No'] === 'number');
  if (!numericRow) {
    // Fixture has no numeric PN; skip
    return;
  }
  const stringPn = String(numericRow['Parent Part No']);
  const matches = getBOMForPart(stringPn);
  assert.ok(matches.length > 0, `expected match for string PN '${stringPn}'`);
});

test('getRoutingForPart string-coerces numeric PN', async () => {
  const { getRoutingForPart, getRoutingOperations } = await import('./dataSync.js');
  clearCache();
  const all = getRoutingOperations();
  const numericRow = all.find((r) => typeof r['Part No'] === 'number');
  if (!numericRow) return;
  const stringPn = String(numericRow['Part No']);
  const matches = getRoutingForPart(stringPn);
  assert.ok(matches.length > 0, `expected routing match for string PN '${stringPn}'`);
});
