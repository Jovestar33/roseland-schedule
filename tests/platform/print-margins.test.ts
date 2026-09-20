import test from 'node:test';
import assert from 'node:assert/strict';
import {printMarginCss} from '../../lib/print-margins.ts';
test('document labels cannot terminate CSS strings or inject a style tag',()=>{
 const css=printMarginCss('Scene "A" \\ </style>\nNew line','Oct 20, 2026','Call Sheet');
 assert.ok(!css.includes('</style>'));
 assert.ok(css.includes('\\22 A\\22'));
 assert.ok(css.includes('\\5c '));
 assert.ok(css.includes('\\a New line'));
 assert.ok(css.includes('counter(page)'));
 assert.ok(css.includes('counter(pages)'));
});
