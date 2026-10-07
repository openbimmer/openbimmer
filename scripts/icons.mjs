import sharp from 'sharp';

const BG = '#0B0D10';
const TRACK = '#20252C';
const ACCENT = '#3D7BFF';
const FG = '#F2F4F6';

const mark = ({ track = TRACK, accent = ACCENT, fg = FG } = {}) => `
  <path d="M 27.4 72.6 A 32 32 0 1 1 72.6 72.6" stroke="${track}" stroke-width="9" stroke-linecap="round" fill="none"/>
  <path d="M 27.4 72.6 A 32 32 0 0 1 66 22.3" stroke="${accent}" stroke-width="9" stroke-linecap="round" fill="none"/>
  <line x1="50" y1="50" x2="63" y2="27.5" stroke="${fg}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="50" cy="50" r="6" fill="${fg}"/>`;

const svg = (size, inner, { bg, scale = 1 } = {}) => {
  const offset = (100 - 100 * scale) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
    ${bg ? `<rect width="100" height="100" fill="${bg}"/>` : ''}
    <g transform="translate(${offset} ${offset + 3 * scale}) scale(${scale})">${inner}</g>
  </svg>`);
};

const out = (name) => `assets/images/${name}`;

await sharp(svg(1024, mark(), { bg: BG, scale: 0.78 })).png().toFile(out('icon.png'));
await sharp(svg(1024, mark(), { scale: 0.62 })).png().toFile(out('android-icon-foreground.png'));
await sharp(svg(1024, '', { bg: BG })).png().toFile(out('android-icon-background.png'));
await sharp(svg(1024, mark({ track: '#FFFFFF55', accent: '#FFFFFF', fg: '#FFFFFF' }), { scale: 0.62 })).png().toFile(out('android-icon-monochrome.png'));
await sharp(svg(512, mark(), { scale: 0.92 })).png().toFile(out('splash-icon.png'));
await sharp(svg(96, mark(), { bg: BG, scale: 0.84 })).png().toFile(out('favicon.png'));
console.log('icons written');
