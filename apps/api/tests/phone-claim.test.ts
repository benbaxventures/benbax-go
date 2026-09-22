import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it, mock } from 'node:test';

process.env.DOTENV_CONFIG_PATH = 'tests/.env.does-not-exist';
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:59999/benbax_test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-must-be-at-least-24-chars';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-must-be-at-least-24-chars';
delete process.env.REDIS_URL;

import jwt from 'jsonwebtoken';

type FakeUser = { id: string; phone: string };

const GOOGLE_USER = 'google-user-1';
const PHONE_USER = 'phone-user-1';

let server: http.Server;
let baseUrl: string;
let users: FakeUser[] = [];

function token(userId: string, role = 'CUSTOMER') {
  return jwt.sign({ sub: userId, role }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '5m' });
}

async function claim(phone: string, userId = GOOGLE_USER) {
  const response = await fetch(`${baseUrl}/api/v1/users/me/phone`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token(userId)}` },
    body: JSON.stringify({ phone }),
  });
  const text = await response.text();
  const body = JSON.parse(text) as {
    ok: boolean;
    data?: { phone: string; alreadySet: boolean };
    error?: { code: string; message: string };
  };
  return { status: response.status, body, text };
}

function seed() {
  users = [
    // A Google sign-up: the unique phone column holds a placeholder.
    { id: GOOGLE_USER, phone: `google:11223344556677889900` },
    { id: PHONE_USER, phone: '+233594172522' },
  ];
}

describe('PATCH /users/me/phone', () => {
  before(async () => {
    seed();
    const fakePrisma = {
      user: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          const user = users.find((candidate) => candidate.id === where.id);
          return user ? { ...user } : null;
        },
        findFirst: async ({
          where,
        }: {
          where: { phone?: { in: string[] }; NOT?: { id: string } };
        }) => {
          const match = users.find(
            (candidate) =>
              (where.phone?.in ?? []).includes(candidate.phone) && candidate.id !== where.NOT?.id
          );
          return match ? { ...match } : null;
        },
        update: async ({ where, data }: { where: { id: string }; data: { phone: string } }) => {
          const user = users.find((candidate) => candidate.id === where.id);
          if (!user) throw new Error('not found');
          user.phone = data.phone;
          return { ...user };
        },
      },
    };

    mock.module('../src/config/prisma', {
      exports: { prisma: fakePrisma },
    } as unknown as Parameters<typeof mock.module>[1]);

    const { createApp } = (await import('../src/app')) as { createApp: () => http.RequestListener };
    server = http.createServer(createApp());
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('lets a Google account claim a number, stored in E.164', async () => {
    seed();

    const result = await claim('059 417 2599');

    assert.equal(result.status, 200, result.text);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.data!.phone, '+233594172599');
    assert.equal(result.body.data!.alreadySet, false);
    assert.equal(users.find((u) => u.id === GOOGLE_USER)?.phone, '+233594172599');
  });

  it('accepts a local number with a trunk zero', async () => {
    seed();

    const result = await claim('0594172599');

    assert.equal(result.status, 200);
    assert.equal(result.body.data!.phone, '+233594172599');
  });

  it('rejects a number that is not phone-shaped', async () => {
    seed();

    const result = await claim('12');

    assert.equal(result.status, 400);
    assert.equal(result.body.error!.code, 'BAD_REQUEST');
    // The placeholder is untouched, so the gate keeps asking.
    assert.match(users.find((u) => u.id === GOOGLE_USER)?.phone ?? '', /^google:/);
  });

  it('refuses a number another account already holds', async () => {
    seed();

    const result = await claim('0594172522');

    assert.equal(result.status, 409);
    assert.equal(result.body.error!.code, 'PHONE_IN_USE');
    assert.match(users.find((u) => u.id === GOOGLE_USER)?.phone ?? '', /^google:/);
  });

  it('refuses a number held under an older spelling', async () => {
    seed();
    // Written by an older seed: country code glued onto the trunk zero.
    users[1]!.phone = '+2330594172522';

    const result = await claim('+233594172522');

    assert.equal(result.status, 409);
    assert.equal(result.body.error!.code, 'PHONE_IN_USE');
  });

  it('will not silently change a number that is already set', async () => {
    seed();

    const result = await claim('0201234567', PHONE_USER);

    assert.equal(result.status, 409);
    assert.equal(result.body.error!.code, 'PHONE_ALREADY_SET');
    assert.equal(users.find((u) => u.id === PHONE_USER)?.phone, '+233594172522');
  });

  it('is idempotent when the same number is claimed twice', async () => {
    seed();

    const first = await claim('0594172599');
    const second = await claim('0594172599');

    assert.equal(first.status, 200);
    assert.equal(second.status, 200, second.text);
    assert.equal(second.body.data!.phone, '+233594172599');
    assert.equal(second.body.data!.alreadySet, true);
  });

  it('requires a signed-in caller', async () => {
    const response = await fetch(`${baseUrl}/api/v1/users/me/phone`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '0594172599' }),
    });
    assert.equal(response.status, 401);
  });
});
