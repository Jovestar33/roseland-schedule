const test = require('node:test');
const assert = require('node:assert/strict');
const { NextRequest } = require('next/server');
const { sourceLoader } = require('./source-loader.cjs');
const { middleware } = sourceLoader()('middleware.ts');
test('canonical tokenized public view passes through without an auth cookie or redirect', () => {
  const response = middleware(new NextRequest('https://example.test/view?v=synthetic&vt=synthetic'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('location'), null);
});
test('legacy viewer link redirects once and preserves encoded name and token', () => {
  const first = middleware(new NextRequest('https://example.test/?v=A%20%26%20B&vt=synthetic%2Btoken'));
  assert.equal(first.status, 307);
  const target = new URL(first.headers.get('location'));
  assert.equal(target.pathname, '/view');
  assert.equal(target.searchParams.get('v'), 'A & B');
  assert.equal(target.searchParams.get('vt'), 'synthetic+token');
  assert.equal(middleware(new NextRequest(target)).headers.get('location'), null);
});
test('private schedules still require the auth flag', () => {
  const response = middleware(new NextRequest('https://example.test/schedule/A'));
  assert.equal(new URL(response.headers.get('location')).pathname, '/login');
});
