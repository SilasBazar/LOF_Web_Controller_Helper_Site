import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(process.argv[2] || path.join(projectRoot, '..', 'Leap_Of_Faith', 'controller-web'));

// The old separate LAN landing page (capital-I Index.html) is superseded by
// the unified page; remove it FIRST so GitHub/Netlify can't serve both (and
// so a case-insensitive filesystem doesn't alias it onto the new file).
const staleLanding = path.join(projectRoot, 'Index.html');
const canonicalLanding = path.join(projectRoot, 'index.html');
if (fs.existsSync(staleLanding)) {
    const sameFile = (() => {
        try { return fs.statSync(staleLanding).ino === (fs.existsSync(canonicalLanding) ? fs.statSync(canonicalLanding).ino : -1); }
        catch { return false; }
    })();
    if (!sameFile || staleLanding === canonicalLanding) fs.rmSync(staleLanding);
}

// The unified controller page (LAN landing + online controller with the P2P
// waterfall) is served from the site root as index.html.
fs.copyFileSync(path.join(sourceRoot, 'index.html'), canonicalLanding);
fs.copyFileSync(path.join(sourceRoot, 'connection.js'), path.join(projectRoot, 'connection.js'));
fs.copyFileSync(path.join(sourceRoot, 'online.html'), path.join(projectRoot, 'online.html'));
fs.copyFileSync(path.join(sourceRoot, 'config.js'), path.join(projectRoot, 'config.js'));

console.log(`Synced unified controller from ${sourceRoot}`);
