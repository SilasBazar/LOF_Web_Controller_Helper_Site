const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'online.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');

test('online controller scripts parse and use authenticated fragment sessions', () => {
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
        .map((match) => match[1])
        .filter((script) => script.trim());
    scripts.forEach((script, index) => assert.doesNotThrow(() => new vm.Script(script, { filename: `online-${index}.js` })));
    assert.match(html, /location\.hash\.slice\(1\)/);
    assert.match(html, /controllerId:\s*CONTROLLER_ID/);
    assert.match(html, /connected - Online/);
});

test('online controller has an explicit relay configuration', () => {
    assert.doesNotMatch(config, /yourname/);
    assert.match(config, /LOF_RELAY_URL/);
});
