// Renders the MUNE TOKENS logo to the app icons and the Windows shortcut .ico.
// Run with `npm run icons` (uses sharp, which ships with Next.js). Output is committed in public/icons.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const out = path.resolve("public/icons");
fs.mkdirSync(out, { recursive: true });

const logo = (pad = 0) => {
  const s = 64 + pad * 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${s} ${s}" width="512" height="512">
  ${pad ? `<rect x="${-pad}" y="${-pad}" width="${s}" height="${s}" fill="#000000"/>` : ""}
  <rect x="2" y="2" width="60" height="60" rx="16" fill="#ffffff"/>
  <path d="M16 45V20l16 17 16-17v25" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
};

fs.writeFileSync(path.join(out, "icon.svg"), logo());

const png = (svg, size) => sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();

for (const size of [192, 512]) {
  fs.writeFileSync(path.join(out, `icon-${size}.png`), await png(logo(), size));
}
// Maskable icons need the artwork inside the central 80% safe zone.
fs.writeFileSync(path.join(out, "maskable-512.png"), await png(logo(10), 512));

// .ico with embedded PNGs (supported since Windows Vista).
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(sizes.map((s) => png(logo(), s)));
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(images.length, 4);
const dir = Buffer.alloc(16 * images.length);
let offset = 6 + dir.length;
images.forEach((img, i) => {
  const s = sizes[i];
  const e = i * 16;
  dir.writeUInt8(s >= 256 ? 0 : s, e);
  dir.writeUInt8(s >= 256 ? 0 : s, e + 1);
  dir.writeUInt8(0, e + 2);
  dir.writeUInt8(0, e + 3);
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(img.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += img.length;
});
fs.writeFileSync(path.join(out, "mune-tokens.ico"), Buffer.concat([header, dir, ...images]));

console.log("Icons written to", out);
