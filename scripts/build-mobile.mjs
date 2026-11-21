// Prepara www/ para Android (Capacitor): la misma interfaz de src/ más la capa nativa
// (mobile/bridge.js) y el runtime de Capacitor. Luego: npx cap sync android
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const www = path.join(root, 'www');

fs.rmSync(www, { recursive: true, force: true });
fs.cpSync(path.join(root, 'src'), www, { recursive: true });
fs.copyFileSync(path.join(root, 'firebase-config.json'), path.join(www, 'firebase-config.json'));
fs.copyFileSync(path.join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), path.join(www, 'capacitor.js'));
fs.copyFileSync(path.join(root, 'mobile/bridge.js'), path.join(www, 'bridge.js'));

const index = path.join(www, 'index.html');
let html = fs.readFileSync(index, 'utf8');
// En Android la propia interfaz hace las peticiones de Comunidad y de actualizaciones.
const connect = ['https://firestore.googleapis.com', 'https://identitytoolkit.googleapis.com', 'https://securetoken.googleapis.com', 'https://api.github.com'];
const csp = `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ${connect.join(' ')};`;
const replace = (from, to) => {
  if (!html.includes(from)) throw new Error(`No se encontró en index.html: ${from}`);
  html = html.replace(from, to);
};
replace(/content="default-src[^"]*"/.exec(html)?.[0] ?? 'CSP', `content="${csp}"`);
replace('content="width=device-width, initial-scale=1"', 'content="width=device-width, initial-scale=1, viewport-fit=cover"');
replace('<script src="scheduler.js"></script>', [
  '<script src="capacitor.js"></script>',
  '<script src="community-core.js"></script>',
  '<script src="bridge.js"></script>',
  '<script src="scheduler.js"></script>',
].join('\n  '));
fs.writeFileSync(index, html);
console.log('www/ listo para Capacitor');
