import assert from 'node:assert/strict';
import test from 'node:test';

import { resolvePublicAppUrl } from '../../lib/server/env.ts';

test('uses the clean public URL for Linq links without changing the webhook URL', () => {
  assert.equal(
    resolvePublicAppUrl({
      APP_URL: 'https://webhook.serveousercontent.com/',
      PUBLIC_APP_URL: 'https://growxth.lhr.life///',
    }),
    'https://growxth.lhr.life',
  );
});

test('falls back to APP_URL when no separate public URL is configured', () => {
  assert.equal(
    resolvePublicAppUrl({
      APP_URL: 'https://growxth.example/',
      PUBLIC_APP_URL: undefined,
    }),
    'https://growxth.example',
  );
});
