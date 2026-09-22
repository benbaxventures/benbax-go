import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isPlaceholderPhone,
  needsPhoneNumber,
  normalizePhoneNumber,
  phoneLookupVariants,
} from '../src/utils/phone';

describe('normalizePhoneNumber', () => {
  it('converts Ghana local numbers to E.164', () => {
    assert.equal(normalizePhoneNumber('0594172522'), '+233594172522');
    assert.equal(normalizePhoneNumber('594172522'), '+233594172522');
    assert.equal(normalizePhoneNumber('059 417 2522'), '+233594172522');
    assert.equal(normalizePhoneNumber('+233594172522'), '+233594172522');
  });

  it('strips the trunk zero an older seed glued onto the country code', () => {
    assert.equal(normalizePhoneNumber('+2330594172522'), '+233594172522');
  });

  it('rejects the placeholders written for accounts with no number', () => {
    // Google sign-in returns no phone number under any scope, so those
    // accounts hold a sentinel in the unique phone column. It must never be
    // treated as dialable, and must never reach a client.
    assert.equal(normalizePhoneNumber('google:11223344556677889900'), null);
    assert.equal(normalizePhoneNumber('deleted:ckxyz123'), null);
  });

  it('rejects values that are not phone numbers', () => {
    assert.equal(normalizePhoneNumber(''), null);
    assert.equal(normalizePhoneNumber('   '), null);
    assert.equal(normalizePhoneNumber('12345'), null);
    assert.equal(normalizePhoneNumber(null), null);
    assert.equal(normalizePhoneNumber(undefined), null);
  });
});

describe('isPlaceholderPhone', () => {
  it('recognises accounts created without a real number', () => {
    assert.equal(isPlaceholderPhone('google:11223344556677889900'), true);
    assert.equal(isPlaceholderPhone('deleted:ckxyz123'), true);
    assert.equal(isPlaceholderPhone(''), true);
    assert.equal(isPlaceholderPhone(null), true);
  });

  it('leaves real numbers alone', () => {
    assert.equal(isPlaceholderPhone('+233594172522'), false);
    assert.equal(isPlaceholderPhone('0594172522'), false);
  });
});

describe('needsPhoneNumber', () => {
  it('is true for anything that cannot be dialled', () => {
    assert.equal(needsPhoneNumber('google:112233'), true);
    assert.equal(needsPhoneNumber('deleted:abc'), true);
    assert.equal(needsPhoneNumber('12345'), true);
    assert.equal(needsPhoneNumber(null), true);
  });

  it('is false once a usable number is stored', () => {
    assert.equal(needsPhoneNumber('+233594172522'), false);
    // Including the older spellings still sitting in the database.
    assert.equal(needsPhoneNumber('+2330594172522'), false);
    assert.equal(needsPhoneNumber('0594172522'), false);
  });
});

describe('phoneLookupVariants', () => {
  it('covers every spelling the same number has been stored as', () => {
    const variants = phoneLookupVariants('0594172522');
    for (const spelling of [
      '+233594172522',
      '233594172522',
      '0594172522',
      '594172522',
      '+2330594172522',
    ]) {
      assert.ok(variants.includes(spelling), `expected variants to include ${spelling}`);
    }
  });

  it('returns nothing for an email address', () => {
    assert.deepEqual(phoneLookupVariants('someone@example.com'), []);
  });
});
