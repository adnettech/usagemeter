import { deflateSync } from "node:zlib";

// Minimal PNG encoder (8-bit RGBA) — used to draw the tray gauge icon at runtime,
// tinted by the most-constrained limit. No image-library dependency.

function crc32(buf: Uint8Array): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (~c) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

type RGBA = [number, number, number, number];

function makePng(size: number, draw: (x: number, y: number) => RGBA): Uint8Array {
  const raw = new Uint8Array((size * 4 + 1) * size);
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = draw(x, y);
      raw[p++] = r;
      raw[p++] = g;
      raw[p++] = b;
      raw[p++] = a;
    }
  }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, size);
  dv.setUint32(4, size);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const idat = new Uint8Array(deflateSync(raw));
  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array(0))];
  const total = parts.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of parts) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

function colorFor(util: number): RGBA {
  if (util >= 90) return [255, 77, 79, 255]; // red
  if (util >= 70) return [245, 166, 35, 255]; // amber
  return [74, 158, 255, 255]; // blue
}

/**
 * A donut gauge filled clockwise in proportion to `util` (0..100), colored by
 * severity. Returned as base64 PNG for systray2.
 */
export function gaugeIconBase64(util: number, size = 32): string {
  const cx = (size - 1) / 2;
  const cy = (size - 1) / 2;
  const rOuter = size / 2 - 1;
  const rInner = rOuter * 0.62;
  const [r, g, b] = colorFor(util);
  const frac = Math.max(0, Math.min(100, util)) / 100;
  const png = makePng(size, (x, y) => {
    const dx = x - cx;
    const dy = y - cy;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d > rOuter + 0.5 || d < rInner) return [0, 0, 0, 0];
    let ang = Math.atan2(dx, -dy); // 0 at top, increasing clockwise
    if (ang < 0) ang += Math.PI * 2;
    const filled = ang / (Math.PI * 2) <= frac;
    return filled ? [r, g, b, 255] : [r, g, b, 55]; // filled vs faint track
  });
  return Buffer.from(png).toString("base64");
}

/**
 * A static bar-chart glyph (three ascending bars), used as the panel icon. The icon
 * cannot be live-updated through systray2 on GNOME/appindicator, so it is intentionally
 * neutral — it never implies a specific usage value. Live numbers live in the menu.
 */
export function meterIconBase64(size = 32): string {
  const blue: RGBA = [74, 158, 255, 255];
  const bars = [
    { x0: 4, x1: 10, top: 18 },
    { x0: 13, x1: 19, top: 12 },
    { x0: 22, x1: 28, top: 6 },
  ];
  const bottom = 26;
  const png = makePng(size, (x, y) => {
    for (const b of bars) {
      if (x >= b.x0 && x < b.x1 && y >= b.top && y <= bottom) return blue;
    }
    return [0, 0, 0, 0];
  });
  return Buffer.from(png).toString("base64");
}
