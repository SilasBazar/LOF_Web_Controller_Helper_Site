const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const onlineRedirect = fs.readFileSync(path.join(root, 'online.html'), 'utf8');
const connection = fs.readFileSync(path.join(root, 'connection.js'), 'utf8');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');

test('unified controller scripts parse and use authenticated fragment sessions', () => {
    const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
        .map((match) => match[1])
        .filter((script) => script.trim());
    scripts.forEach((script, index) => assert.doesNotThrow(() => new vm.Script(script, { filename: `index-${index}.js` })));
    assert.match(html, /location\.hash\.slice\(1\)/);
    assert.match(connection, /controllerToken:\s*token/);
    assert.match(connection, /controllerId/);
    assert.match(html, /connected - Online/);
});

test('P2P upgrade path is present in the connection layer', () => {
    assert.match(connection, /createDataChannel\('input'/);
    assert.match(connection, /'rtc_offer'/);
    assert.match(connection, /connected - P2P/);
});

test('online.html redirects to the unified page preserving the fragment', () => {
    assert.match(onlineRedirect, /location\.replace\('\.\/' \+ location\.hash\)/);
});

test('online controller has an explicit relay configuration', () => {
    assert.doesNotMatch(config, /yourname/);
    assert.match(config, /LOF_RELAY_URL/);
});
