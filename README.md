# Leap of Faith Web Controller Helper

This site hosts both phone-controller entry points:

- `/` is the HTTPS handoff to the HTTP controller hosted by the game PC for LAN play.
- `/online.html` is the HTTPS/WSS controller for internet play through the Fly relay.

## URL contract

The QR code must link to:

```text
https://leap-of-faith-controller.netlify.app/#ip=<encoded-controller-url>
```

Example:

```text
https://leap-of-faith-controller.netlify.app/#ip=http%3A%2F%2F192.168.6.65%3A8081
```

The fragment keeps the LAN address out of Netlify request logs. Legacy links
using the `?ip=` query parameter remain supported. The `ip` value may be a full
`http://IPv4:port` URL or the legacy `IPv4:port` form. `controller-target.js`
accepts canonical dotted-decimal, non-special-purpose IPv4 addresses on ports
8080 through 8090. It rejects domains, credentials, paths, nested query strings,
additional fragments, HTTPS targets, non-canonical IPv4 spellings, and invalid
ports.

The helper must not use `fetch()` to test the controller. Browsers block an
HTTPS page from fetching an HTTP LAN endpoint as mixed content or private
network access. The Join button performs a top-level navigation from a user
gesture instead.

Online links use a separate fragment contract and open the controller directly:

```text
https://leap-of-faith-controller.netlify.app/online.html#v=1&room=<room>&token=<token>
```

Run `node scripts/sync-online-controller.mjs` from this repository after changing
`Leap_Of_Faith/controller-web`. Set the production WSS origin in `config.js`
before deploying.

## Test

```powershell
npm ci
npm run build
npm test
```

`styles.css` is generated from `tailwind.css` and the classes in `Index.html`.
It is committed so the deployed helper has no runtime Tailwind CDN dependency.
The same build and test commands run in `.github/workflows/test.yml` for every
push and pull request.

After deploying, test with a newly generated in-game QR code. The displayed
target must match `SimpleController Plugin: Http server started:` in the game
log. Guest Wi-Fi may isolate clients even when the target is correct.
