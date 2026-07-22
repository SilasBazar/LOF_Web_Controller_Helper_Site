'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseControllerTarget, readControllerTarget } = require('../controller-target.js');

test('accepts the runtime URL emitted by the game', () => {
    assert.equal(parseControllerTarget('http://192.168.6.65:8081'), 'http://192.168.6.65:8081');
});

test('accepts legacy host and port values', () => {
    assert.equal(parseControllerTarget('10.42.7.9:8090'), 'http://10.42.7.9:8090');
});

test('accepts valid non-RFC1918 ranges', () => {
    assert.equal(parseControllerTarget('100.64.23.9:8084'), 'http://100.64.23.9:8084');
    assert.equal(parseControllerTarget('198.51.100.25:8088'), 'http://198.51.100.25:8088');
});

test('reads the private fragment contract and legacy query contract', () => {
    const encodedTarget = 'http%3A%2F%2F172.20.10.4%3A8081';
    assert.equal(parseControllerTarget(readControllerTarget('', `#ip=${encodedTarget}`)), 'http://172.20.10.4:8081');
    assert.equal(parseControllerTarget(readControllerTarget(`?ip=${encodedTarget}`, '')), 'http://172.20.10.4:8081');
    assert.equal(readControllerTarget('?ip=10.0.0.1%3A8081', '#ip=10.0.0.2%3A8082'), '10.0.0.2:8082');
});

test('rejects missing, hosted, and secure targets', () => {
    assert.equal(parseControllerTarget(null), null);
    assert.equal(parseControllerTarget(''), null);
    assert.equal(parseControllerTarget('localhost:8081'), null);
    assert.equal(parseControllerTarget('controller.example.com:8081'), null);
    assert.equal(parseControllerTarget('https://192.168.1.20:8081'), null);
});

test('rejects special-purpose addresses', () => {
    assert.equal(parseControllerTarget('0.1.2.3:8081'), null);
    assert.equal(parseControllerTarget('127.0.0.1:8081'), null);
    assert.equal(parseControllerTarget('169.254.10.20:8081'), null);
    assert.equal(parseControllerTarget('224.0.0.1:8081'), null);
});

test('rejects ports outside the controller range', () => {
    assert.equal(parseControllerTarget('192.168.1.20'), null);
    assert.equal(parseControllerTarget('192.168.1.20:8079'), null);
    assert.equal(parseControllerTarget('192.168.1.20:8091'), null);
});

test('rejects credentials, paths, query strings, and fragments', () => {
    assert.equal(parseControllerTarget('http://user@192.168.1.20:8081'), null);
    assert.equal(parseControllerTarget('http://192.168.1.20:8081/controller'), null);
    assert.equal(parseControllerTarget('http://192.168.1.20:8081?x=1'), null);
    assert.equal(parseControllerTarget('http://192.168.1.20:8081#x'), null);
});

test('rejects non-canonical IPv4 spellings instead of normalizing them', () => {
    assert.equal(parseControllerTarget('192.168.006.065:8081'), null);
    assert.equal(parseControllerTarget('192.168.1:8081'), null);
    assert.equal(parseControllerTarget('0300.0250.0001.0001:8081'), null);
});

test('unified landing never preflights the HTTP target and navigates on join', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    assert.match(html, /function parseLanTarget/);
    assert.match(html, /window\.location\.assign\(LAN_TARGET\)/);
    assert.match(html, /id="landingView"/);
    assert.doesNotMatch(html, /fetch\s*\(/);
    assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
});
