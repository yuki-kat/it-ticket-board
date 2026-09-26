// Copies the ticket board page from the repo root into desktop/app/ before
// each build or local run, so index.html stays the single file to edit.
const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, '..', '..', 'index.html');
const targetDir = path.join(__dirname, '..', 'app');

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, path.join(targetDir, 'index.html'));
console.log(`[copyApp] ${path.relative(process.cwd(), source)} -> app/index.html`);
