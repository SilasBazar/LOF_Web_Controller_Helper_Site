// Leap Of Faith - online controller page config.
// Set this to the deployed relay's wss:// origin (see ../relay/README.md).
// Localhost automatically uses the relay started by `npm start`.
window.LOF_RELAY_URL = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? 'ws://localhost:8080'
    : 'wss://leap-of-faith-phone-relay.fly.dev';
