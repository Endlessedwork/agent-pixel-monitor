import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';

const CHAR_DIR = path.join(__dirname, '..', 'client', 'public', 'assets', 'characters');
const FRAME_W = 16;
const FRAME_H = 32;

for (let i = 0; i < 6; i++) {
  const file = path.join(CHAR_DIR, `char_${i}.png`);
  const buf = fs.readFileSync(file);
  const png = PNG.sync.read(buf);

  // Extract colors from frame 0, direction 0 (down, idle-ish)
  const colorCounts = new Map<string, number>();

  // Scan all frames to get full palette
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (y * png.width + x) * 4;
      const r = png.data[idx];
      const g = png.data[idx + 1];
      const b = png.data[idx + 2];
      const a = png.data[idx + 3];
      if (a < 2) continue;
      const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      colorCounts.set(hex, (colorCounts.get(hex) || 0) + 1);
    }
  }

  // Sort by frequency
  const sorted = [...colorCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n=== char_${i}.png (${sorted.length} unique colors) ===`);
  for (const [color, count] of sorted) {
    console.log(`  ${color}  ${count}px`);
  }
}
