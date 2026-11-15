/* Draws every icon from resources/logo-*.svg. Run: node scripts/make-icons.mjs  (needs: npm i -D sharp) */
import sharp from 'sharp';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';

const fg = readFileSync('resources/logo-fg.svg'), bg = readFileSync('resources/logo-bg.svg');
const out = async (svg, size, file) => { mkdirSync(file.replace(/\/[^/]+$/, ''), { recursive: true }); await sharp(svg, { density: 384 }).resize(size, size).png().toFile(file); };
const compose = async (size, { round = 0, pad = 0, mask = false } = {}) => {
  const base = await sharp(bg, { density: 384 }).resize(size, size).png().toBuffer();
  const f = await sharp(fg, { density: 384 }).resize(Math.round(size * (1 + pad)), Math.round(size * (1 + pad))).png().toBuffer();
  const off = Math.round(-size * pad / 2);
  let img = await sharp(base).composite([{ input: await sharp(f).extract({ left: Math.max(0, -off), top: Math.max(0, -off), width: size, height: size }).png().toBuffer() }]).png().toBuffer();
  if (round) { const r = Math.round(size * round), m = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}"/></svg>`); img = await sharp(img).composite([{ input: m, blend: 'dest-in' }]).png().toBuffer(); }
  return img;
};

// website / PWA icons (the logo is drawn at 108 with a 66-wide safe zone; scale it up a little for the plain icons)
const web = async (size, file, o) => writeFileSync(file, await compose(size, o));
await web(192, 'public/icon-192.png', { round: .22, pad: .18 });
await web(512, 'public/icon-512.png', { round: .22, pad: .18 });
await web(512, 'public/icon-maskable-512.png', {});
await web(180, 'public/apple-touch-icon.png', { pad: .18 });
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108"><clipPath id="c"><rect width="108" height="108" rx="24"/></clipPath><g clip-path="url(#c)">${bg.toString().replace(/<\/?svg[^>]*>/g, '')}</g><g transform="translate(-9.7 -9.7) scale(1.18)">${fg.toString().replace(/<\/?svg[^>]*>/g, '')}</g></svg>`;
writeFileSync('public/icon.svg', svg);

// Android: adaptive icon layers (108dp) + legacy icons (48dp)
const res = 'android/app/src/main/res', D = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(D)) {
  await out(fg, Math.round(108 * k), `${res}/mipmap-${d}/ic_launcher_foreground.png`);
  await out(bg, Math.round(108 * k), `${res}/mipmap-${d}/ic_launcher_background.png`);
  const s = Math.round(48 * k);
  writeFileSync(`${res}/mipmap-${d}/ic_launcher.png`, await compose(s, { round: .2, pad: .18 }));
  writeFileSync(`${res}/mipmap-${d}/ic_launcher_round.png`, await compose(s, { round: .5, pad: .18 }));
}
const ad = n => `<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n    <background android:drawable="@mipmap/ic_launcher_background"/>\n    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>\n    <monochrome android:drawable="@mipmap/ic_launcher_foreground"/>\n</adaptive-icon>`;
writeFileSync(`${res}/mipmap-anydpi-v26/ic_launcher.xml`, ad()); writeFileSync(`${res}/mipmap-anydpi-v26/ic_launcher_round.xml`, ad());

// splash: brand colour with the logo in the middle (one image for every density; shown centred, never stretched)
const splash = async (w, h, file) => {
  const s = Math.round(Math.min(w, h) * .42);
  const logo = await compose(s, { round: .22, pad: .18 });
  await sharp({ create: { width: w, height: h, channels: 4, background: '#0E7A4F' } }).composite([{ input: await sharp(bg, { density: 200 }).resize(w, h, { fit: 'cover' }).png().toBuffer() }, { input: logo, left: Math.round((w - s) / 2), top: Math.round((h - s) / 2) }]).png().toFile(file);
};
for (const dir of readdirSync(res).filter(d => /^drawable(-(land|port)-\w+)?$/.test(d))) {
  const f = `${res}/${dir}/splash.png`; if (!existsSync(f)) continue;
  const m = sharp(f); const { width, height } = await m.metadata(); await splash(Math.round(width / 2), Math.round(height / 2), f + '.tmp'); // half size keeps the APK small
  const { renameSync } = await import('node:fs'); renameSync(f + '.tmp', f);
}
writeFileSync(`${res}/values/ic_launcher_background.xml`, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#0E7A4F</color>\n</resources>\n');
console.log('icons done');
