import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'node:test';

/**
 * apps/mobile-request cannot depend on this workspace package: its Metro setup
 * pins a separate Expo SDK and resolves a hand-vendored `src/shared` instead.
 * That is a deliberate trade, but it means the copy can silently drift — so
 * the two are compared here, and this test is the reminder to update both.
 */
const repoRoot = path.resolve(import.meta.dirname ?? __dirname, '..', '..', '..');

const vendored: Array<{ canonical: string; copy: string }> = [
  {
    canonical: 'packages/shared/src/apiErrors.ts',
    copy: 'apps/mobile-request/src/shared/apiErrors.ts',
  },
];

/** Drops the leading `// ...` note that marks a file as a vendored copy. */
function stripVendorHeader(source: string) {
  return source.replace(/^(\/\/[^\n]*\n)+\n?/, '');
}

describe('vendored copies of shared modules', () => {
  for (const { canonical, copy } of vendored) {
    it(`${copy} matches ${canonical}`, () => {
      const original = readFileSync(path.join(repoRoot, canonical), 'utf8');
      const duplicate = readFileSync(path.join(repoRoot, copy), 'utf8');
      assert.equal(
        stripVendorHeader(duplicate).trim(),
        original.trim(),
        `${copy} has drifted from ${canonical}. Copy the canonical file over it, keeping the vendored-from header.`
      );
    });
  }
});
