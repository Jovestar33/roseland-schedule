const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function render(file, auth, location, extra = {}) {
  const effects = [], navigations = [];
  const router = { replace: path => navigations.push(path) };
  const store = selector => selector ? selector(auth) : auth;
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, URLSearchParams, window: { location, scrollTo() {} },
    document: { cookie: '', activeElement: null, documentElement: {}, body: {} },
    history: {}, setTimeout: callback => callback(),
    require(name) {
      if (name === 'react') return { useEffect: fn => effects.push(fn), useState: value => [value === '' && extra.password ? extra.password : value, () => {}] };
      if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
      if (name === 'next/navigation') return { useRouter: () => router };
      if (name.includes('authStore')) return { useAuthStore: store };
      if (name.endsWith('.png')) return { default: { src: 'logo' } };
      throw Error(name);
    }, ...extra };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(code, context);
  const tree = context.exports.default({ children: 'schedule' });
  effects.forEach(fn => fn());
  return { navigations, tree, context };
}
const gate = 'components/AuthGate.tsx';
const login = 'app/(auth)/login/page.tsx';

test('new tab missing its session token preserves encoded schedule, query, and anchor through login', () => {
  const location = { pathname: '/schedule/Rocky%20Mount%20%E2%80%93%20Apr%2024', search: '?ph=shoot', hash: '#notes' };
  const expected = location.pathname + location.search + location.hash;
  const first = render(gate, { hydrated: true, isAuthenticated: false, hydrate() {} }, location);
  assert.equal(first.navigations.length, 1);
  const loginUrl = new URL(first.navigations[0], 'https://example.com');
  assert.equal(loginUrl.searchParams.get('next'), expected);
  const second = render(login, { hydrated: true, isAuthenticated: true, hydrate() {} }, { search: loginUrl.search });
  assert.deepEqual(second.navigations, [expected]);
});
test('authenticated tabs stay on their requested schedule', () => {
  assert.deepEqual(render(gate, { hydrated: true, isAuthenticated: true, hydrate() {} }, {}).navigations, []);
});
test('ordinary login returns to library and external redirect targets are rejected', () => {
  for (const next of ['', '//example.com', '/\\example.com', 'https://example.com']) {
    assert.deepEqual(render(login, { hydrated: true, isAuthenticated: true, hydrate() {} }, { search: '?next=' + encodeURIComponent(next) }).navigations, ['/']);
  }
});
test('successful password submission keeps destination even if auth effect already navigated', async () => {
  const location = { search: '?next=%2Fschedule%2FBenson' };
  const auth = { hydrated: true, isAuthenticated: false, hydrate() {}, async login() { location.search = ''; return { ok: true }; } };
  const result = render(login, auth, location, { password: 'test-only' });
  function findForm(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'form') return node;
    for (const child of [node.props?.children].flat()) { const found = findForm(child); if (found) return found; }
  }
  await findForm(result.tree).props.onSubmit({ preventDefault() {} });
  assert.deepEqual(result.navigations, ['/schedule/Benson']);
});
