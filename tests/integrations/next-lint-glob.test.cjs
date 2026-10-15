const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { getRootDirs } = require('@next/eslint-plugin-next/dist/utils/get-root-dirs');

test('Next lint root discovery preserves literal, wildcard, brace, and array roots', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'next-lint-roots-'));
  try {
    for (const name of ['web', 'admin', 'other']) fs.mkdirSync(path.join(root, name));
    fs.writeFileSync(path.join(root, 'file.txt'), 'not a directory');
    const find = rootDir => getRootDirs({ cwd: root, settings: { next: { rootDir } } }).map(p => path.resolve(p)).sort();
    assert.deepEqual(find(undefined), [root]);
    assert.deepEqual(find(root + '/web'), [root + '/web']);
    assert.deepEqual(find(root + '/*'), ['admin', 'other', 'web'].map(n => root + '/' + n));
    assert.deepEqual(find(root + '/{admin,web}'), [root + '/admin', root + '/web']);
    assert.deepEqual(find([root + '/web', root + '/admin']), [root + '/admin', root + '/web']);
    assert.deepEqual(find(root + '/missing-*'), []);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
