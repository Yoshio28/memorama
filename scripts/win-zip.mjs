// Crea la versión portable: un .zip con la carpeta de la app lista para ejecutar Memomancer.exe.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const dist = path.join(root, 'dist');
const name = `Memomancer-Portable-${version}`;
const staging = path.join(dist, name);
const out = path.join(dist, `${name}.zip`);

fs.rmSync(staging, { recursive: true, force: true });
fs.rmSync(out, { force: true });
fs.cpSync(path.join(dist, 'win-unpacked'), staging, { recursive: true });
execFileSync('zip', ['-qr9', out, name], { cwd: dist });
fs.rmSync(staging, { recursive: true, force: true });
console.log(`Versión portable: ${path.relative(root, out)}`);
