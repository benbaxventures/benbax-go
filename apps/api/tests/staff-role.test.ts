import { StaffRole, UserRole } from '@prisma/client';
import assert from 'node:assert/strict';
import test from 'node:test';
import { isStaff, requireRoles, rolesOf, type AuthUser } from '../src/middleware/auth';

/** Runs a requireRoles guard and reports what it did. */
function check(user: AuthUser, allowed: UserRole[]): 'allowed' | 'forbidden' {
  let outcome: 'allowed' | 'forbidden' = 'allowed';
  const req = { user } as unknown as Parameters<ReturnType<typeof requireRoles>>[0];
  requireRoles(...allowed)(req, {} as never, (err?: unknown) => {
    if (err) outcome = 'forbidden';
  });
  return outcome;
}

const ADMIN_ONLY = [UserRole.ADMIN, UserRole.OPERATIONS, UserRole.SUPPORT];

// The account this whole change exists for: one login that drives and runs ops.
const driverAdmin: AuthUser = {
  id: 'u1',
  role: UserRole.DRIVER,
  staffRole: StaffRole.ADMIN,
};
const plainDriver: AuthUser = { id: 'u2', role: UserRole.DRIVER, staffRole: null };
const legacyAdmin: AuthUser = { id: 'u3', role: UserRole.ADMIN, staffRole: null };
const customerSupport: AuthUser = {
  id: 'u4',
  role: UserRole.CUSTOMER,
  staffRole: StaffRole.SUPPORT,
};

test('a driver with staff access holds both roles', () => {
  assert.deepEqual(rolesOf(driverAdmin), [UserRole.DRIVER, UserRole.ADMIN]);
  assert.deepEqual(rolesOf(plainDriver), [UserRole.DRIVER]);
});

test('driver-admin reaches the dashboard without losing driver routes', () => {
  assert.equal(check(driverAdmin, ADMIN_ONLY), 'allowed');
  assert.equal(check(driverAdmin, [UserRole.DRIVER]), 'allowed');
});

test('staff access does not leak to drivers who were never granted it', () => {
  assert.equal(check(plainDriver, ADMIN_ONLY), 'forbidden');
  assert.equal(isStaff(plainDriver), false);
  assert.equal(isStaff(driverAdmin), true);
});

test('accounts that predate the split still work off role alone', () => {
  assert.equal(check(legacyAdmin, ADMIN_ONLY), 'allowed');
  assert.equal(isStaff(legacyAdmin), true);
});

test('a support hat does not grant driver-only routes', () => {
  assert.equal(check(customerSupport, ADMIN_ONLY), 'allowed');
  assert.equal(check(customerSupport, [UserRole.DRIVER]), 'forbidden');
});

test('customer-facing routes stay open to every role', () => {
  const bookingRoles = [
    UserRole.CUSTOMER,
    UserRole.RIDER,
    UserRole.DRIVER,
    UserRole.ADMIN,
    UserRole.OPERATIONS,
  ];
  for (const user of [driverAdmin, plainDriver, legacyAdmin, customerSupport]) {
    assert.equal(check(user, bookingRoles), 'allowed', `${user.id} should be able to book`);
  }
});

test('an unauthenticated request is rejected, not treated as staff', () => {
  const req = {} as unknown as Parameters<ReturnType<typeof requireRoles>>[0];
  let errored = false;
  requireRoles(...ADMIN_ONLY)(req, {} as never, (err?: unknown) => {
    if (err) errored = true;
  });
  assert.equal(errored, true);
});
