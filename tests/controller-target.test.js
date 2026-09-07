'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
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

test('page keeps the fallback timer alive while the LAN target opens', () => {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
    const bodyClasses = html.match(/<body class="([^"]+)"/)[1].split(/\s+/);
    assert.match(html, /<script src="controller-target\.js"><\/script>/);
    assert.match(html, /<link rel="stylesheet" href="styles\.css">/);
	assert.match(html, /window\.open\(targetUrl, 'lof-controller'\)/);
	assert.match(html, /event\.data === 'lof-lan-controller-ready'/);
	assert.match(html, /navigator\.connection && navigator\.connection\.type/);
	assert.match(html, /document\.addEventListener\('visibilitychange'/);
	assert.match(html, /id="online-fallback-btn"/);
	assert.match(html, /#online-fallback-btn\.hidden/);
	assert.match(html, /!fallbackAbsoluteUrl \|\| !supportsLanHandshake/);
    assert.doesNotMatch(html, /fetch\s*\(/);
    assert.doesNotMatch(html, /cdn\.tailwindcss\.com/);
    assert.ok(bodyClasses.includes('overflow-y-auto'));
    assert.ok(!bodyClasses.includes('overflow-hidden'));
});

function runLandingPage(options = {}) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'Index.html'), 'utf8');
    const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
        .map((match) => match[1])
        .find((source) => source.includes("window.open(targetUrl, 'lof-controller')"));
    const listeners = {};
    const documentListeners = {};
    const elements = new Map();
    const assignedUrls = [];
    const child = {
        location: { href: 'http://192.168.1.20:8081' },
        closed: false,
        close() { this.closed = true; }
    };
    let fallbackTask = null;
    let openedCount = 0;
    let mockNow = 1000000;

    function element() {
        const classes = new Set();
        return {
            disabled: false,
            innerText: '',
            classList: {
                add(name) { classes.add(name); },
                remove(name) { classes.delete(name); },
                contains(name) { return classes.has(name); }
            },
            querySelector() { return element(); },
            addEventListener(type, callback) { this[type] = callback; },
            click() { if (this['click']) this['click'](); }
        };
    }

    for (const id of ['join-btn', 'error-popup', 'close-popup', 'target-ip-display', 'error-ip-display', 'online-fallback-btn']) {
        elements.set(id, element());
    }

    const context = {
        URL,
        URLSearchParams,
        Date: { now: () => mockNow },
        navigator: { connection: { type: options.connectionType } },
        document: {
            getElementById: (id) => elements.get(id),
            visibilityState: 'hidden',
            addEventListener(type, callback) { documentListeners[type] = callback; }
        },
        setTimeout(callback) { fallbackTask = callback; return 1; },
        clearTimeout() { fallbackTask = null; },
        window: {
            LOFControllerTarget: { readControllerTarget: () => '192.168.1.20:8081', parseControllerTarget },
            location: {
                search: '',
                hash: '#ip=192.168.1.20%3A8081&r=ABC123&t=secret&lh=1',
                href: 'https://leap-of-faith-controller.netlify.app/#test',
                assign(url) { assignedUrls.push(url); }
            },
            addEventListener(type, callback) { listeners[type] = callback; },
            open() {
                openedCount++;
                if (options.popupBlocked) return null;
                return child;
            }
        }
    };

    vm.runInNewContext(script, context);
    return {
        child,
        elements,
        listeners,
        documentListeners,
        assignedUrls,
        getOpenedCount: () => openedCount,
        getFallbackTask: () => fallbackTask,
        advanceClock: (ms) => { mockNow += ms; },
        setVisibilityState(state) { context.document.visibilityState = state; },
        join() { elements.get('join-btn').click(); },
        playOnline() { elements.get('online-fallback-btn').click(); }
    };
}

test('failed LAN navigation redirects the child to the online controller', () => {
	const landing = runLandingPage();
	landing.join();
	const fallbackTask = landing.getFallbackTask();
    assert.equal(typeof fallbackTask, 'function');
    fallbackTask();
	assert.equal(landing.child.location.href, 'https://leap-of-faith-controller.netlify.app/online.html#v=1&room=ABC123&token=secret');
});

test('LAN acknowledgement rejects unrelated messages and cancels online fallback', () => {
	const landing = runLandingPage();
	landing.join();
	landing.listeners.message({ source: {}, origin: 'http://192.168.1.20:8081', data: 'lof-lan-controller-ready' });
	assert.equal(typeof landing.getFallbackTask(), 'function');
	landing.listeners.message({ source: landing.child, origin: 'https://attacker.example', data: 'lof-lan-controller-ready' });
	assert.equal(typeof landing.getFallbackTask(), 'function');
	landing.listeners.message({ source: landing.child, origin: 'http://192.168.1.20:8081', data: 'wrong-message' });
	assert.equal(typeof landing.getFallbackTask(), 'function');
	landing.listeners.message({ source: landing.child, origin: 'http://192.168.1.20:8081', data: 'lof-lan-controller-ready' });
	assert.equal(landing.getFallbackTask(), null);
	assert.ok(landing.elements.get('online-fallback-btn').classList.contains('hidden'));
});

test('cellular connection joins the online controller directly without a LAN attempt', () => {
	const landing = runLandingPage({ connectionType: 'cellular' });
	landing.join();
	assert.equal(landing.getOpenedCount(), 0);
	assert.equal(landing.getFallbackTask(), null);
	assert.deepEqual(landing.assignedUrls, ['https://leap-of-faith-controller.netlify.app/online.html#v=1&room=ABC123&token=secret']);
});

test('manual online button navigates this tab online and closes the stuck child', () => {
	const landing = runLandingPage();
	landing.join();
	assert.equal(typeof landing.getFallbackTask(), 'function');
	landing.playOnline();
	assert.equal(landing.getFallbackTask(), null);
	assert.equal(landing.child.closed, true);
	assert.deepEqual(landing.assignedUrls, ['https://leap-of-faith-controller.netlify.app/online.html#v=1&room=ABC123&token=secret']);
});

test('returning to the tab after the deadline fires a frozen fallback immediately', () => {
	const landing = runLandingPage();
	landing.join();
	assert.equal(typeof landing.getFallbackTask(), 'function');
	landing.advanceClock(5001);
	landing.setVisibilityState('visible');
	landing.documentListeners.visibilitychange();
	assert.equal(landing.getFallbackTask(), null);
	assert.equal(landing.child.location.href, 'https://leap-of-faith-controller.netlify.app/online.html#v=1&room=ABC123&token=secret');
});

test('returning to the tab early keeps the healthy LAN attempt alive', () => {
	const landing = runLandingPage();
	landing.join();
	assert.equal(typeof landing.getFallbackTask(), 'function');
	landing.setVisibilityState('visible');
	landing.documentListeners.visibilitychange();
	assert.equal(typeof landing.getFallbackTask(), 'function');
	assert.equal(landing.child.location.href, 'http://192.168.1.20:8081');
});

test('popup-blocked join navigates this tab to the online controller', () => {
	const landing = runLandingPage({ popupBlocked: true });
	landing.join();
	assert.equal(landing.getOpenedCount(), 1);
	assert.equal(landing.getFallbackTask(), null);
	assert.deepEqual(landing.assignedUrls, ['https://leap-of-faith-controller.netlify.app/online.html#v=1&room=ABC123&token=secret']);
});
