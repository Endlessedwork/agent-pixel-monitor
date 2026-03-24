import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';

const CHAR_DIR = path.join(__dirname, '..', 'client', 'public', 'assets', 'characters');

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360; s /= 100; l /= 100;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1/3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1/3) * 255),
  ];
}

interface ColorShift {
  hueShift: number;    // degrees to add to hue
  satShift: number;    // add to saturation
  lightShift: number;  // add to lightness
}

interface RecolorConfig {
  source: number;       // source char index
  skin?: ColorShift;
  hair?: ColorShift;
  shirt?: ColorShift;
  pants?: ColorShift;
  gender: 'male' | 'female';
}

// Color classification by hue/saturation/lightness ranges
function classifyPixel(r: number, g: number, b: number, sourceIdx: number): 'skin' | 'hair' | 'shirt' | 'pants' | 'other' {
  const [h, s, l] = rgbToHsl(r, g, b);

  // Very dark or very light = outline/highlight, don't change
  if (l < 8 || l > 95) return 'other';
  // Low saturation grays (eyes, outlines)
  if (s < 5 && l > 20 && l < 80) return 'other';

  if (sourceIdx === 0) {
    // char_0: male, brown skin, blue shirt, brown pants
    // Skin: warm pinkish tones (hue ~15-30, sat > 40, light > 50)
    if (h >= 5 && h <= 35 && s > 30 && l > 50) return 'skin';
    // Hair: very dark reddish-brown (hue ~0-20, lightness < 20)
    if (l < 20 && s > 10 && (h < 30 || h > 340)) return 'hair';
    // Shirt: blue tones (hue ~200-220)
    if (h >= 190 && h <= 230 && s > 30) return 'shirt';
    // Pants: warm brown (hue ~25-40, sat > 30, light 20-55)
    if (h >= 20 && h <= 45 && s > 30 && l >= 20 && l <= 55) return 'pants';
  }

  if (sourceIdx === 4) {
    // char_4: male, light skin, dark brown hair, white/gray shirt, gray pants
    // Skin: warm pinkish
    if (h >= 5 && h <= 35 && s > 30 && l > 50) return 'skin';
    // Hair: dark brown (hue ~15-30, low lightness)
    if (h >= 10 && h <= 35 && s > 30 && l < 35) return 'hair';
    // Shirt: gray/white (low saturation, medium-high lightness)
    if (s < 15 && l > 55) return 'shirt';
    // Pants: medium gray
    if (s < 15 && l >= 25 && l <= 55) return 'pants';
  }

  if (sourceIdx === 1) {
    // char_1: female, light skin, orange/brown hair, dark clothes
    if (h >= 5 && h <= 30 && s > 30 && l > 55) return 'skin';
    // Hair: orange-brown (hue ~25-35, medium sat/light)
    if (h >= 15 && h <= 40 && s > 30 && l >= 25 && l <= 55) return 'hair';
    // Clothes: very dark (low lightness, low-medium sat)
    if (l < 25 && s < 20) return 'shirt';
  }

  if (sourceIdx === 3) {
    // char_3: female, light skin, white/silver hair, light clothes
    if (h >= 5 && h <= 30 && s > 25 && l > 45 && l < 80) return 'skin';
    // Hair: desaturated pink/white (hue ~0-20, low sat, high lightness)
    if (s < 20 && l > 55) return 'hair';
    // Shirt: medium tones
    if (h >= 250 && h <= 280 && s > 15 && l < 45) return 'shirt';
    if (h >= 25 && h <= 40 && s > 20 && l >= 30 && l <= 65) return 'pants';
  }

  if (sourceIdx === 5) {
    // char_5: female, dark skin, black hair, red top
    if (h >= 5 && h <= 25 && s > 25 && l > 55) return 'skin';
    // Hair: very dark (near black)
    if (l < 30 && s < 20) return 'hair';
    // Shirt: red tones
    if ((h >= 340 || h <= 15) && s > 30 && l > 25 && l < 60) return 'shirt';
    // Pants: dark warm
    if (h >= 15 && h <= 40 && s > 15 && l < 40) return 'pants';
  }

  if (sourceIdx === 2) {
    // char_2: female, dark skin, black curly hair, orange top
    if (h >= 5 && h <= 25 && s > 20 && l > 30 && l < 55) return 'skin';
    // Hair: near-black
    if (l < 20 && s < 25) return 'hair';
    // Shirt: orange (hue ~20-35, high sat)
    if (h >= 15 && h <= 40 && s > 60 && l > 40) return 'shirt';
    // Dark red accents
    if ((h >= 340 || h <= 10) && s > 50 && l < 40) return 'pants';
  }

  return 'other';
}

function applyShift(r: number, g: number, b: number, shift: ColorShift): [number, number, number] {
  let [h, s, l] = rgbToHsl(r, g, b);
  h = (h + shift.hueShift + 360) % 360;
  s = Math.max(0, Math.min(100, s + shift.satShift));
  l = Math.max(0, Math.min(100, l + shift.lightShift));
  return hslToRgb(h, s, l);
}

function recolorSprite(config: RecolorConfig, outputIdx: number) {
  const srcFile = path.join(CHAR_DIR, `char_${config.source}.png`);
  const buf = fs.readFileSync(srcFile);
  const png = PNG.sync.read(buf);
  const out = new PNG({ width: png.width, height: png.height });

  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (y * png.width + x) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];

      if (a < 2) {
        out.data[idx] = 0; out.data[idx+1] = 0; out.data[idx+2] = 0; out.data[idx+3] = 0;
        continue;
      }

      const type = classifyPixel(r, g, b, config.source);
      let nr = r, ng = g, nb = b;

      const shift = type === 'skin' ? config.skin
        : type === 'hair' ? config.hair
        : type === 'shirt' ? config.shirt
        : type === 'pants' ? config.pants
        : undefined;

      if (shift) {
        [nr, ng, nb] = applyShift(r, g, b, shift);
      }

      out.data[idx] = nr;
      out.data[idx+1] = ng;
      out.data[idx+2] = nb;
      out.data[idx+3] = a;
    }
  }

  const outFile = path.join(CHAR_DIR, `char_${outputIdx}.png`);
  fs.writeFileSync(outFile, PNG.sync.write(out));
  console.log(`Created ${outFile} (${config.gender}) from char_${config.source}`);
}

// ── New characters ──────────────────────────────────────────

const newChars: RecolorConfig[] = [
  // char_6: Male from char_0 - red shirt, black pants, lighter skin
  {
    source: 0, gender: 'male',
    shirt: { hueShift: 160, satShift: 10, lightShift: 5 },  // blue→red
    pants: { hueShift: 0, satShift: -30, lightShift: -15 },  // brown→dark
    skin: { hueShift: 0, satShift: -5, lightShift: 10 },     // lighter skin
    hair: { hueShift: 0, satShift: 0, lightShift: -5 },
  },
  // char_7: Female from char_1 - blue outfit, blonde hair
  {
    source: 1, gender: 'female',
    shirt: { hueShift: 220, satShift: 30, lightShift: 10 },  // dark→blue
    hair: { hueShift: -10, satShift: -10, lightShift: 20 },  // lighter blonde
    skin: { hueShift: 0, satShift: 0, lightShift: 5 },
  },
  // char_8: Male from char_4 - green shirt, darker hair
  {
    source: 4, gender: 'male',
    shirt: { hueShift: 120, satShift: 30, lightShift: -10 },  // gray→green
    pants: { hueShift: 30, satShift: 10, lightShift: -10 },   // darker pants
    hair: { hueShift: 0, satShift: 0, lightShift: -10 },      // darker hair
    skin: { hueShift: 5, satShift: 0, lightShift: -5 },       // slightly darker
  },
  // char_9: Female from char_3 - purple shirt, dark hair
  {
    source: 3, gender: 'female',
    shirt: { hueShift: 30, satShift: 20, lightShift: -5 },    // shift purple more
    hair: { hueShift: 20, satShift: 20, lightShift: -40 },    // white→dark
    skin: { hueShift: 5, satShift: 5, lightShift: -10 },      // tanner
    pants: { hueShift: 0, satShift: -10, lightShift: -10 },
  },
  // char_10: Male from char_0 - white shirt, dark pants (formal)
  {
    source: 0, gender: 'male',
    shirt: { hueShift: 0, satShift: -60, lightShift: 40 },   // blue→white
    pants: { hueShift: 0, satShift: -40, lightShift: -20 },  // brown→dark gray
    hair: { hueShift: 30, satShift: -10, lightShift: 10 },   // lighter brown
    skin: { hueShift: 0, satShift: 0, lightShift: 0 },
  },
  // char_11: Female from char_5 - blue top, lighter skin
  {
    source: 5, gender: 'female',
    shirt: { hueShift: 220, satShift: 10, lightShift: 5 },   // red→blue
    skin: { hueShift: 0, satShift: -5, lightShift: 8 },
    hair: { hueShift: 20, satShift: 10, lightShift: 5 },     // warm black
  },
  // char_12: Male from char_4 - navy suit, black hair (formal)
  {
    source: 4, gender: 'male',
    shirt: { hueShift: 220, satShift: 50, lightShift: -20 },  // gray→navy
    pants: { hueShift: 220, satShift: 30, lightShift: -15 },  // gray→dark navy
    hair: { hueShift: 0, satShift: -20, lightShift: -15 },    // very dark
    skin: { hueShift: 10, satShift: 5, lightShift: -15 },     // darker skin
  },
  // char_13: Female from char_2 - green top, brown skin
  {
    source: 2, gender: 'female',
    shirt: { hueShift: 100, satShift: 0, lightShift: 0 },    // orange→green
    skin: { hueShift: 5, satShift: 5, lightShift: 5 },
    hair: { hueShift: 10, satShift: 5, lightShift: 3 },
    pants: { hueShift: 100, satShift: -10, lightShift: 0 },
  },
];

// Generate all
for (let i = 0; i < newChars.length; i++) {
  recolorSprite(newChars[i], 6 + i);
}

console.log(`\nDone! Created ${newChars.length} new characters (char_6 to char_${5 + newChars.length})`);
console.log('\nMale:   ' + newChars.filter(c => c.gender === 'male').map((_, i) => newChars.indexOf(_) + 6).join(', '));
console.log('Female: ' + newChars.filter(c => c.gender === 'female').map((_, i) => newChars.indexOf(_) + 6).join(', '));
