import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.resolve(process.argv[2] || path.join(projectRoot, '..', 'Leap_Of_Faith', 'controller-web'));

fs.copyFileSync(path.join(sourceRoot, 'index.html'), path.join(projectRoot, 'online.html'));
fs.copyFileSync(path.join(sourceRoot, 'config.js'), path.join(projectRoot, 'config.js'));
console.log(`Synced online controller from ${sourceRoot}`);
