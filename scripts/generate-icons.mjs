// Renders the app icons in public/icons from one SVG design (uses Playwright's
// bundled Chromium, already a dev dependency). Run after changing the design:
//   node scripts/generate-icons.mjs
import { writeFileSync } from 'node:fs';

import { chromium } from 'playwright-core';

// Family-tree glyph (Ionicons "git-network-outline", MIT) on the login gradient.
const glyph = `
  <g fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="32">
    <circle cx="128" cy="96" r="48"/><circle cx="256" cy="416" r="48"/><circle cx="384" cy="96" r="48"/>
    <path d="M256 256v112M128 144c0 74.67 68.92 112 128 112M384 144c0 74.67-68.92 112-128 112"/>
  </g>`;

/** rounded: corner radius for "any" icons; scale: glyph size (maskable icons need a smaller, safe-zone glyph). */
const svg = (rounded, scale) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0054e9"/><stop offset="1" stop-color="#6030ff"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded}" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">${glyph}</g>
</svg>`;

const icons = [
  { file: 'public/icons/icon.svg', svg: svg(112, 0.62) },
  { file: 'public/icons/icon-192.png', svg: svg(112, 0.62), size: 192 },
  { file: 'public/icons/icon-512.png', svg: svg(112, 0.62), size: 512 },
  { file: 'public/icons/maskable-512.png', svg: svg(0, 0.5), size: 512 },
  { file: 'public/icons/apple-touch-icon.png', svg: svg(0, 0.56), size: 180 },
  { file: 'src/assets/icon/favicon.png', svg: svg(112, 0.66), size: 64 },
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const { file, svg: markup, size } of icons) {
  if (!size) {
    writeFileSync(file, markup.trim() + '\n');
  } else {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`);
    await page.screenshot({ path: file, omitBackground: true });
  }
  console.log('wrote', file);
}

// Link-preview image (WhatsApp, Facebook, LinkedIn, X...): 1200x630.
await page.setViewportSize({ width: 1200, height: 630 });
await page.setContent(`
  <style>
    * { margin: 0; box-sizing: border-box; }
    body { width: 1200px; height: 630px; display: flex; align-items: center; gap: 64px; padding: 0 96px;
      background: linear-gradient(135deg, #0054e9, #6030ff); color: #fff;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
    svg { width: 280px; height: 280px; flex: none; filter: drop-shadow(0 16px 32px rgba(0,0,0,.25)); }
    h1 { font-size: 88px; font-weight: 700; letter-spacing: -1px; }
    p { font-size: 40px; line-height: 1.3; margin-top: 16px; opacity: .92; }
  </style>
  ${svg(112, 0.62).replace('url(#bg)', '#ffffff22')}
  <div><h1>Generations</h1><p>Every family has a story.<br>Build your family tree together.</p></div>`);
// JPEG keeps it well under WhatsApp's ~300 KB preview limit.
await page.screenshot({ path: 'public/og-image.jpg', type: 'jpeg', quality: 88 });
console.log('wrote public/og-image.jpg');

await browser.close();
