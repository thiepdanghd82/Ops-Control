import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchPendingQuote } from './pendingQuoteLoad.js';

const QUOTES = [{ id: 159, state: { usd_rate: 26341 } }];
const SEED = { rate: 26090, rfq_number: 'RFQ-2026-S0068' };

const deps = (over = {}) => ({
  getQuotes: async () => QUOTES,
  getLatestUsdRate: async () => SEED,
  ...over,
});

test('a copy fetches the rate alongside the quotes', async () => {
  const out = await fetchPendingQuote('copy', deps());
  assert.equal(out.seed.rate, 26090);
  assert.equal(out.quotes[0].id, 159);
});

test('opening does not ask for the rate at all', async () => {
  // Not asking is stronger than asking and discarding: a saved quote must
  // keep the rate it was quoted at, and a request that is never made cannot
  // be applied by a later edit that forgets which branch it is in.
  for (const action of ['load', undefined, 'open']) {
    let asked = false;
    const out = await fetchPendingQuote(
      action,
      deps({
        getLatestUsdRate: async () => {
          asked = true;
          return SEED;
        },
      })
    );
    assert.equal(asked, false, `action=${action} must not fetch a rate`);
    assert.equal(out.seed, null);
  }
});

test('both fetches are in flight together, not chained', async () => {
  // The bug this file exists for: the rate used to be fetched INSIDE the
  // quote-list .then(), which put it after a clearPendingQuote() that tore
  // the effect down. Starting them together removes the window entirely.
  let quotesStarted = 0;
  let rateStartedBeforeQuotesResolved = false;
  const out = await fetchPendingQuote(
    'copy',
    deps({
      getQuotes: async () => {
        quotesStarted = 1;
        await new Promise((r) => setTimeout(r, 20));
        return QUOTES;
      },
      getLatestUsdRate: async () => {
        if (quotesStarted === 1) rateStartedBeforeQuotesResolved = true;
        return SEED;
      },
    })
  );
  assert.equal(rateStartedBeforeQuotesResolved, true, 'the rate must not wait for the quote list');
  assert.equal(out.seed.rate, 26090);
});

test('a failed rate lookup still opens the quote', async () => {
  const out = await fetchPendingQuote(
    'copy',
    deps({
      getLatestUsdRate: async () => {
        throw new Error('network');
      },
    })
  );
  assert.equal(out.seed, null, 'no rate');
  assert.equal(out.quotes[0].id, 159, 'but the quote is still there');
});

test('a failed quote fetch still rejects — that one is not optional', async () => {
  await assert.rejects(
    () =>
      fetchPendingQuote(
        'copy',
        deps({
          getQuotes: async () => {
            throw new Error('network');
          },
        })
      ),
    /network/
  );
});

test('a missing quote list degrades to an empty array', async () => {
  const out = await fetchPendingQuote('load', deps({ getQuotes: async () => null }));
  assert.deepEqual(out.quotes, []);
});
