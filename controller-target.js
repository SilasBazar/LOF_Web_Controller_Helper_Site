/* global URLSearchParams */
(function (global) {
    'use strict';

    const MIN_CONTROLLER_PORT = 8080;
    const MAX_CONTROLLER_PORT = 8090;

    function isAllowedIPv4Address(hostname) {
        const parts = hostname.split('.');
        if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || (part.length > 1 && part.startsWith('0')))) {
            return false;
        }

        const octets = parts.map(Number);
        if (octets.some((octet) => octet < 0 || octet > 255)) {
            return false;
        }

        const [first, second] = octets;
        return first !== 0 && first !== 127 && first < 224 && !(first === 169 && second === 254);
    }

    function parseControllerTarget(rawTarget) {
        if (typeof rawTarget !== 'string' || rawTarget.trim() === '') {
            return null;
        }

        let candidate = rawTarget.trim();
        if (!/^[a-z][a-z\d+.-]*:\/\//i.test(candidate)) {
            candidate = `http://${candidate}`;
        }

        const match = /^http:\/\/(\d{1,3}(?:\.\d{1,3}){3}):(\d{1,5})\/?$/i.exec(candidate);
        if (!match) {
            return null;
        }

        const hostname = match[1];
        const port = Number(match[2]);
        if (!isAllowedIPv4Address(hostname) ||
            !Number.isInteger(port) ||
            port < MIN_CONTROLLER_PORT ||
            port > MAX_CONTROLLER_PORT) {
            return null;
        }

        return `http://${hostname}:${port}`;
    }

    function readControllerTarget(search, hash) {
        const fragment = typeof hash === 'string' ? hash.replace(/^#/, '') : '';
        const query = typeof search === 'string' ? search.replace(/^\?/, '') : '';
        return new URLSearchParams(fragment).get('ip') || new URLSearchParams(query).get('ip');
    }

    const api = Object.freeze({ parseControllerTarget, readControllerTarget });
    global.LOFControllerTarget = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);
