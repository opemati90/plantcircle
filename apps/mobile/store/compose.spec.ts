import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';

/**
 * Frames the raw screens from capture.spec.ts into the store images: brand green, the logo, a
 * headline and a phone with the real screen. Output in store/out/{app-store,google-play,promo}.
 */
const RAW = join(__dirname, 'out', 'raw');
const OUT = join(__dirname, 'out');
const LOGO = join(
  __dirname,
  '../../../design/brand/logo/plantcircle-logo-horizontal-white.svg',
);

interface Shot {
  file: string;
  raw: string;
  title: [string, string];
  sub: string;
  /** The screen's top is a dark photo: light status bar. */
  darkTop?: boolean;
  /** A scrolled screen: the status bar gets a solid band, as under a scrolled header. */
  solidTop?: boolean;
}

/** Order sells the weekly loop first; most people only see the first two or three. */
const SHOTS: Shot[] = [
  {
    file: '01-this-week',
    raw: 'this-week',
    title: ['Find your people.', 'Cook together.'],
    sub: 'A weekly cook club with people near you.',
  },
  {
    file: '02-challenge',
    raw: 'circle-week',
    title: ['One theme a week.', 'Everyone cooks.'],
    sub: 'Your Circle sets it. You cook it at home.',
    darkTop: true,
  },
  {
    file: '03-share',
    raw: 'composer',
    title: ['Show what', 'you cooked.'],
    sub: 'A photo and a line, shared only with your Circle.',
  },
  {
    file: '04-ideas',
    raw: 'feed',
    title: ['Fresh ideas', 'from your Circle.'],
    sub: 'See what others made, say yum, ask how.',
    solidTop: true,
  },
  {
    file: '05-together',
    raw: 'plan-joined',
    title: ['Then cook together', 'in person.'],
    sub: 'Cooking nights and potlucks. Join in one tap.',
    darkTop: true,
  },
  {
    file: '06-invite',
    raw: 'invite',
    title: ['Bring a friend', 'with one link.'],
    sub: 'They can look around first. No app needed.',
    darkTop: true,
  },
];

type Platform = 'ios' | 'android';

/** Each store sees its own platform's phone: iPhone for the App Store, Android for Google Play. */
const SIZES: { dir: string; w: number; h: number; platform: Platform }[] = [
  { dir: 'app-store/6.9-inch', w: 1320, h: 2868, platform: 'ios' },
  { dir: 'app-store/6.5-inch', w: 1284, h: 2778, platform: 'ios' },
  { dir: 'google-play/phone', w: 1080, h: 1920, platform: 'android' },
];

const dataUri = (path: string, mime: string) =>
  `data:${mime};base64,${readFileSync(path).toString('base64')}`;
const screen = (name: string) => dataUri(join(RAW, `${name}.png`), 'image/png');
const logo = () => dataUri(LOGO, 'image/svg+xml');

const BASE_CSS = `
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; }
  body {
    font-family: -apple-system, 'SF Pro Display', system-ui, sans-serif;
    -webkit-font-smoothing: antialiased;
    overflow: hidden;
    color: #fff;
    background:
      radial-gradient(120% 60% at 50% 0%, #1F7449 0%, rgba(31,116,73,0) 70%),
      #155A37;
  }
  .accent { color: #B6E3C6; }
  .phone {
    position: relative;
    background: #0B0B0B;
    box-shadow: 0 40px 120px rgba(0,0,0,0.28), inset 0 0 0 2px #2A2A2A;
  }
  .phone .screen { position: relative; overflow: hidden; background: #fff; }
  .phone .screen img.ui { display: block; width: 100%; }
  .status {
    position: absolute; left: 0; right: 0; top: 0;
    display: flex; align-items: center; justify-content: space-between;
    font-weight: 600; letter-spacing: -0.01em;
  }
  .island { position: absolute; left: 50%; transform: translateX(-50%); background: #000; border-radius: 999px; }
`;

/** A phone at `width` px showing `raw`; the status bar is drawn over the app's own top space. */
function phone(
  raw: string,
  width: number,
  platform: Platform,
  darkTop = false,
  solidTop = false,
): string {
  const android = platform === 'android';
  const bezel = Math.round(width * (android ? 0.02 : 0.026));
  const inner = width - bezel * 2;
  const pt = inner / 430;
  const ink = darkTop ? '#FFFFFF' : '#0A0A0A';
  const outer = Math.round(width * (android ? 0.1 : 0.15));
  const iosIcons = `
    <svg width="${18 * pt}" height="${12 * pt}" viewBox="0 0 18 12" fill="${ink}"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1"/></svg>
    <svg width="${26 * pt}" height="${12 * pt}" viewBox="0 0 26 12"><rect x="0.5" y="0.5" width="22" height="11" rx="3.5" fill="none" stroke="${ink}" stroke-opacity="0.45"/><rect x="2" y="2" width="19" height="8" rx="2" fill="${ink}"/><rect x="24" y="4" width="1.6" height="4" rx="0.8" fill="${ink}" fill-opacity="0.45"/></svg>`;
  const androidIcons = `
    <svg width="${15 * pt}" height="${15 * pt}" viewBox="0 0 16 16" fill="${ink}"><path d="M8 13.5 0.5 5a10.6 10.6 0 0 1 15 0z"/></svg>
    <svg width="${15 * pt}" height="${15 * pt}" viewBox="0 0 16 16" fill="${ink}"><path d="M15 1v14H1z"/></svg>
    <svg width="${9 * pt}" height="${15 * pt}" viewBox="0 0 9 16"><rect x="2.5" y="0" width="4" height="2" rx="0.6" fill="${ink}"/><rect x="0.5" y="1.5" width="8" height="14" rx="1.6" fill="${ink}"/></svg>`;
  // iPhone: Dynamic Island. Android: a centred punch-hole camera, smaller status text.
  const camera = android
    ? `<div class="island" style="top:${12 * pt}px;width:${16 * pt}px;height:${16 * pt}px"></div>`
    : `<div class="island" style="top:${11 * pt}px;width:${124 * pt}px;height:${36 * pt}px"></div>`;
  const bar = [
    solidTop ? 'background:#fff' : '',
    `height:${(android ? 40 : 54) * pt}px`,
    android ? `padding:0 ${22 * pt}px 0 ${24 * pt}px` : `padding:0 ${30 * pt}px 0 ${44 * pt}px`,
    `font-size:${(android ? 15 : 17) * pt}px`,
    android ? 'font-weight:500' : '',
    `color:${ink}`,
  ]
    .filter(Boolean)
    .join(';');
  return `
  <div class="phone" style="width:${width}px;padding:${bezel}px;border-radius:${outer}px">
    <div class="screen" style="border-radius:${outer - bezel}px">
      <img class="ui" src="${screen(raw)}">
      <div class="status" style="${bar}">
        <span>9:41</span><span style="display:flex;gap:${(android ? 4 : 6) * pt}px;align-items:center">${android ? androidIcons : iosIcons}</span>
      </div>
      ${camera}
    </div>
  </div>`;
}

function portrait(shot: Shot, w: number, h: number, platform: Platform): string {
  const s = w / 1320;
  // Shorter canvases (Play 9:16) get a slightly smaller phone so the screen still reads.
  const tall = h / w > 2;
  const phoneW = Math.round(w * (tall ? 0.76 : 0.72));
  return `<!doctype html><html><head><style>${BASE_CSS}
    .wrap { display: flex; flex-direction: column; align-items: center; text-align: center; padding-top: ${(tall ? 150 : 110) * s}px; }
    .logo { height: ${(tall ? 64 : 58) * s}px; margin-bottom: ${(tall ? 64 : 48) * s}px; }
    h1 { font-size: ${(tall ? 128 : 118) * s}px; font-weight: 800; letter-spacing: -0.045em; line-height: 1; }
    p { font-size: ${(tall ? 50 : 46) * s}px; margin-top: ${36 * s}px; color: rgba(255,255,255,0.86); line-height: 1.3; max-width: ${1080 * s}px; }
    .phone { margin-top: ${(tall ? 96 : 70) * s}px; }
  </style></head><body><div class="wrap">
    <img class="logo" src="${logo()}">
    <h1>${shot.title[0]}<br><span class="accent">${shot.title[1]}</span></h1>
    <p>${shot.sub}</p>
    ${phone(shot.raw, phoneW, platform, shot.darkTop, shot.solidTop)}
  </div></body></html>`;
}

/** Landscape: text left, two phones right, cropped at the bottom edge. */
function landscape(
  w: number,
  h: number,
  platform: Platform,
  title: [string, string],
  sub: string,
): string {
  // Laid out on 1024 × 500; a wider or taller canvas scales by the tighter side.
  const s = Math.min(h / 500, w / 1024);
  const phoneW = Math.round(250 * s);
  return `<!doctype html><html><head><style>${BASE_CSS}
    body { background: radial-gradient(90% 120% at 15% 10%, #1F7449 0%, rgba(31,116,73,0) 70%), #155A37; }
    .text { position: absolute; left: ${64 * s}px; top: 50%; transform: translateY(-50%); width: ${470 * s}px; }
    .logo { height: ${30 * s}px; margin-bottom: ${30 * s}px; }
    h1 { font-size: ${54 * s}px; font-weight: 800; letter-spacing: -0.045em; line-height: 1.02; }
    p { font-size: ${21 * s}px; margin-top: ${18 * s}px; color: rgba(255,255,255,0.86); line-height: 1.35; }
    .a { position: absolute; left: ${w - 64 * s - phoneW * 1.72}px; top: ${h - 408 * s}px; }
    .b { position: absolute; left: ${w - 64 * s - phoneW}px; top: ${h - 464 * s}px; }
  </style></head><body>
    <div class="text"><img class="logo" src="${logo()}"><h1>${title[0]}<br><span class="accent">${title[1]}</span></h1><p>${sub}</p></div>
    <div class="a">${phone('circle-week', phoneW, platform, true)}</div>
    <div class="b">${phone('this-week', phoneW, platform)}</div>
  </body></html>`;
}

test('compose store images', async ({ browser }) => {
  test.setTimeout(180_000);
  for (const size of SIZES) {
    const dir = join(OUT, size.dir);
    mkdirSync(dir, { recursive: true });
    const page = await browser.newPage({
      viewport: { width: size.w, height: size.h },
      deviceScaleFactor: 1,
    });
    for (const shot of SHOTS) {
      await page.setContent(portrait(shot, size.w, size.h, size.platform), {
        waitUntil: 'load',
      });
      await page.screenshot({ path: join(dir, `${shot.file}.png`) });
    }
    await page.close();
  }
  const wide: [string, number, number, Platform][] = [
    ['google-play/feature-graphic-1024x500.png', 1024, 500, 'android'],
    ['promo/promo-1920x1080.png', 1920, 1080, 'ios'],
  ];
  for (const [file, w, h, platform] of wide) {
    mkdirSync(join(OUT, file, '..'), { recursive: true });
    const page = await browser.newPage({
      viewport: { width: w, height: h },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      landscape(
        w,
        h,
        platform,
        ['Find your people.', 'Cook together.'],
        'A weekly cook club with people near you.',
      ),
      { waitUntil: 'load' },
    );
    await page.screenshot({ path: join(OUT, file) });
    await page.close();
  }
});
