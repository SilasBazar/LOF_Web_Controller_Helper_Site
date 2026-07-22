/* [LOF P2P] Phone connection state machine: relay first, silent WebRTC upgrade.
 *
 * One canonical implementation used by controller-web/index.html. Runs in the
 * browser (window.LOFConnection) and under node --test (module.exports) with
 * injected WebSocket / RTCPeerConnection / timers.
 *
 * Waterfall (phone-side, overlapped):
 *   1. Connect the relay WSS, authenticate, handshake -> playable
 *      ('connected - Online').
 *   2. In the background, offer a WebRTC DataChannel over the same socket
 *      (signaling). On open, input moves to direct UDP
 *      ('connected - P2P'); the WSS stays as hot backup.
 *   3. DataChannel close -> input resumes on the WSS instantly and a
 *      re-offer is scheduled. Any path that is open is always sendable.
 */
(function (global) {
    'use strict';

    const P2P_OFFER_TIMEOUT_MS = 8000;
    const P2P_REOFFER_DELAY_MS = 5000;
    const PING_INTERVAL_MS = 2000;

    function create(options) {
        const env = options.env;
        const relayUrl = options.relayUrl;
        const room = options.room;
        const token = options.token;
        const controllerId = options.controllerId;
        const handshake = options.handshake;
        const onEvent = options.onEvent || function () {};

        let ws = null;
        let socketGeneration = 0;
        let reconnectAttempt = 0;
        let reconnectTimer = null;
        let gameplayReady = false;
        let stopRequested = false;
        let pingTimer = null;

        let pc = null;
        let dc = null;
        let p2pReady = false;
        let p2pOfferTimer = null;
        let p2pReofferTimer = null;

        function emit(type, a, b) {
            try { onEvent(type, a, b); } catch {}
        }
        function status(text, isConnected) {
            emit('status', text, isConnected);
        }

        // --- Send path: P2P first, relay fallback. Never throws. ---
        function send(message) {
            if (p2pReady && dc && dc.readyState === 'open') {
                try { dc.send(message); return; } catch {}
            }
            if (!gameplayReady || !ws || ws.readyState !== env.WebSocket.OPEN) return;
            try { ws.send(message); } catch {}
        }

        function sendEnvelope(object) {
            if (!ws || ws.readyState !== env.WebSocket.OPEN) return;
            try { ws.send(JSON.stringify(object)); } catch {}
        }

        // Raw relay-socket send that bypasses the gameplay gate (handshake).
        function sendWs(message) {
            if (!ws || ws.readyState !== env.WebSocket.OPEN) return;
            try { ws.send(message); } catch {}
        }

        // --- Ping over the active transport ---
        function startPing() {
            if (pingTimer) return;
            pingTimer = env.setInterval(() => send('c:ping:' + Date.now()), PING_INTERVAL_MS);
        }
        function stopPing() {
            if (pingTimer) { env.clearInterval(pingTimer); pingTimer = null; }
        }

        // --- WebRTC ---
        function tryPeerToPeer() {
            if (stopRequested || pc || !env.RTCPeerConnection || !gameplayReady) return;
            try {
                pc = new env.RTCPeerConnection({
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        { urls: 'stun:stun1.l.google.com:19302' },
                    ],
                });
                dc = pc.createDataChannel('input', { ordered: false, maxRetransmits: 0 });

                pc.onicecandidate = (event) => {
                    if (event.candidate && event.candidate.candidate) {
                        sendEnvelope({ v: 1, type: 'rtc_ice', candidate: event.candidate.candidate, mid: event.candidate.sdpMid || '0' });
                    }
                };
                pc.onconnectionstatechange = () => {
                    if (pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) {
                        cleanupPeerToPeer(false);
                    }
                };

                dc.onopen = () => {
                    p2pReady = true;
                    if (p2pOfferTimer) { env.clearTimeout(p2pOfferTimer); p2pOfferTimer = null; }
                    status('connected - P2P', true);
                };
                dc.onclose = () => {
                    const wasReady = p2pReady;
                    p2pReady = false;
                    cleanupPeerToPeer(true);
                    if (wasReady && gameplayReady) {
                        // Hot-swap back to the relay socket, then re-offer later.
                        status('connected - Online', true);
                        scheduleReoffer();
                    }
                };
                dc.onmessage = (event) => { if (typeof event.data === 'string') handleDataMessage(event.data); };

                const offerPromise = pc.createOffer();
                offerPromise
                    .then((offer) => pc.setLocalDescription(offer).then(() => offer))
                    .then((offer) => {
                        sendEnvelope({ v: 1, type: 'rtc_offer', sdp: { type: offer.type, sdp: offer.sdp } });
                    })
                    .catch(() => { cleanupPeerToPeer(true); });

                p2pOfferTimer = env.setTimeout(() => {
                    if (!p2pReady) cleanupPeerToPeer(true); // staying on relay
                }, P2P_OFFER_TIMEOUT_MS);
            } catch {
                cleanupPeerToPeer(true);
            }
        }

        function cleanupPeerToPeer(allowReoffer) {
            if (p2pOfferTimer) { env.clearTimeout(p2pOfferTimer); p2pOfferTimer = null; }
            const oldPc = pc;
            pc = null;
            dc = null;
            p2pReady = false;
            if (oldPc) { try { oldPc.close(); } catch {} }
            if (!allowReoffer && p2pReofferTimer) { env.clearTimeout(p2pReofferTimer); p2pReofferTimer = null; }
        }

        function scheduleReoffer() {
            if (p2pReofferTimer || stopRequested) return;
            p2pReofferTimer = env.setTimeout(() => {
                p2pReofferTimer = null;
                tryPeerToPeer();
            }, P2P_REOFFER_DELAY_MS);
        }

        function handleSignaling(envelope) {
            if (!pc) return false;
            if (envelope.type === 'rtc_answer' && envelope.sdp && envelope.sdp.sdp) {
                try {
                    const description = env.RTCSessionDescription
                        ? new env.RTCSessionDescription(envelope.sdp)
                        : envelope.sdp;
                    Promise.resolve(pc.setRemoteDescription(description)).catch(() => {});
                } catch {}
                return true;
            }
            if (envelope.type === 'rtc_ice' && typeof envelope.candidate === 'string') {
                try {
                    const candidate = { candidate: envelope.candidate, sdpMid: envelope.mid || '0' };
                    Promise.resolve(pc.addIceCandidate(candidate)).catch(() => {});
                } catch {}
                return true;
            }
            return false;
        }

        // --- Inbound data (same handling for WSS and DataChannel) ---
        function handleDataMessage(message) {
            if (message === 'ping') { send('pong'); return; }
            if (message.startsWith('c:pong:')) {
                const sentTime = Number(message.substring(7));
                if (sentTime > 0) emit('ping', Date.now() - sentTime);
                return;
            }
            if (message.startsWith('c:')) {
                const player = message.substring(2);
                if (!/^\d{1,3}$/.test(player)) return;
                gameplayReady = true;
                reconnectAttempt = 0;
                emit('player', player);
                startPing();
                tryPeerToPeer();
                return;
            }
            emit('message', message); // e.g. r:<ms> rumble
        }

        // --- Relay socket lifecycle ---
        function connect() {
            if (stopRequested) return;
            if (ws && (ws.readyState === env.WebSocket.CONNECTING || ws.readyState === env.WebSocket.OPEN)) return;
            if (reconnectTimer) { env.clearTimeout(reconnectTimer); reconnectTimer = null; }
            const base = relayUrl.replace(/\/+$/, '');
            startSocket(base + (base.endsWith('/v1/connect') ? '' : '/v1/connect'));
        }

        function startSocket(url) {
            const generation = ++socketGeneration;
            let socket;
            try { socket = new env.WebSocket(url); } catch { scheduleReconnect('connection failed'); return; }
            ws = socket;
            gameplayReady = false;
            status('connecting to game...', false);

            socket.onopen = () => {
                if (stopRequested || generation !== socketGeneration) { socket.close(); return; }
                sendEnvelope({
                    v: 1, type: 'auth', role: 'controller',
                    room, controllerToken: token, controllerId,
                });
                status('authenticating...', false);
            };

            socket.onmessage = (event) => {
                if (generation !== socketGeneration || typeof event.data !== 'string') return;
                const message = event.data;
                if (message.startsWith('{')) {
                    let envelope;
                    try { envelope = JSON.parse(message); } catch { return; }
                    if (envelope.v !== 1) return;
                    if (envelope.type === 'relay_ready') {
                        sendWs(handshake);
                        status(envelope.hostOnline ? 'waiting for game...' : 'game reconnecting...', false);
                    } else if (envelope.type === 'host_offline') {
                        gameplayReady = false;
                        cleanupPeerToPeer(false);
                        stopPing();
                        emit('gameplay', false);
                        status('game reconnecting...', false);
                    } else if (handleSignaling(envelope)) {
                        return;
                    }
                    return;
                }
                handleDataMessage(message);
            };

            socket.onclose = (event) => {
                if (generation !== socketGeneration) return;
                ws = null;
                gameplayReady = false;
                cleanupPeerToPeer(false);
                stopPing();
                emit('gameplay', false);
                if ([4400, 4403].includes(event.code)) {
                    status('join link rejected', false);
                    return;
                }
                scheduleReconnect('disconnected');
            };

            socket.onerror = () => {
                if (generation === socketGeneration) status('connection interrupted', false);
            };
        }

        function scheduleReconnect(text) {
            if (stopRequested || reconnectTimer) return;
            status(text + ' • retrying', false);
            const delay = Math.min(15000, 500 * (2 ** Math.min(reconnectAttempt++, 5))) + Math.floor(Math.random() * 250);
            reconnectTimer = env.setTimeout(() => { reconnectTimer = null; connect(); }, delay);
        }

        return {
            connect,
            send,
            stop() {
                stopRequested = true;
                stopPing();
                cleanupPeerToPeer(false);
                if (reconnectTimer) { env.clearTimeout(reconnectTimer); reconnectTimer = null; }
                const closing = ws;
                ws = null;
                socketGeneration++;
                if (closing && closing.readyState === env.WebSocket.OPEN) closing.close(1000, 'stop');
            },
            isGameplayReady() { return gameplayReady; },
            isP2p() { return p2pReady; },
            isSocketOpen() { return !!ws && ws.readyState === env.WebSocket.OPEN; },
        };
    }

    const api = Object.freeze({ create });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LOFConnection = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
