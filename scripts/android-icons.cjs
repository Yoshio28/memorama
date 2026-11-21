// Genera los iconos y la pantalla de inicio de Android a partir de build/icon.svg.
// Uso: node scripts/android-icons.cjs   (necesita Playwright con Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const res = path.join(root, 'android/app/src/main/res');
const svg = fs.readFileSync(path.join(root, 'build/icon.svg'), 'utf8');
const BG = '#24195a';

// El dibujo sin el fondo redondeado (para el icono adaptativo y la pantalla de inicio).
const inner = svg.replace(/<rect x="8" y="8"[^>]*\/>/, '').replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const art = (scale) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><g transform="translate(${256 - 256 * scale} ${256 - 256 * scale}) scale(${scale})">${inner}</g></svg>`;
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><clipPath id="c"><circle cx="256" cy="256" r="256"/></clipPath></defs><g clip-path="url(#c)"><rect width="512" height="512" fill="${BG}"/>${svg.replace(/<rect x="8" y="8"[^>]*\/>/, '').replace(/^[\s\S]*?<svg[^>]*>/, '<g transform="translate(51 51) scale(0.8)">').replace(/<\/svg>\s*$/, '</g>')}</g></svg>`;

const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  async function shot(markup, w, h, file, bg = 'transparent') {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(`<html><body style="margin:0;background:${bg};display:grid;place-items:center;width:${w}px;height:${h}px">${markup}</body></html>`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file, omitBackground: bg === 'transparent' });
  }
  const sized = (markup, s) => markup.replace('<svg ', `<svg width="${s}" height="${s}" `);
  for (const [d, k] of Object.entries(DENS)) {
    const dir = path.join(res, `mipmap-${d}`);
    await shot(sized(svg, 48 * k), 48 * k, 48 * k, path.join(dir, 'ic_launcher.png'));
    await shot(sized(round, 48 * k), 48 * k, 48 * k, path.join(dir, 'ic_launcher_round.png'));
    // Icono adaptativo: lienzo de 108 dp; la zona segura es el círculo central de 66 dp.
    await shot(sized(art(0.6), 108 * k), 108 * k, 108 * k, path.join(dir, 'ic_launcher_foreground.png'));
  }
  // Pantalla de inicio (Android 11 y anteriores; en 12+ el sistema usa el icono y el color de fondo).
  for (const f of fs.readdirSync(res).filter((n) => n.startsWith('drawable'))) {
    const file = path.join(res, f, 'splash.png');
    if (!fs.existsSync(file)) continue;
    const buf = fs.readFileSync(file);
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
    await shot(sized(svg, Math.round(Math.min(w, h) * 0.4)), w, h, file, BG);
  }
  await browser.close();
  console.log('Iconos de Android generados');
})();
