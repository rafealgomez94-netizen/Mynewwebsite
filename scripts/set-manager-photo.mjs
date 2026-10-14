#!/usr/bin/env node
/**
 * Installs the manager photo used by the manager contact card
 * (src/components/manager-card.tsx → /manager.jpg).
 *
 *   npm run photo:manager -- ~/Downloads/me.png
 *   npm run photo:manager -- path/to/photo.jpg
 *   npm run photo:manager                  # auto-detects a single image in ./uploads
 *
 * The source image is centre-cropped to a square and written to public/manager.jpg
 * at 640×640 (JPEG quality 88) which is what the card and the Open Graph image use.
 * Requires ImageMagick (`convert`); without it the file is copied unchanged, which
 * still works as long as the name ends in .jpg/.jpeg.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const target = path.join(root, 'public', 'manager.jpg');
const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.heic', '.tif', '.tiff', '.bmp'];

function hasConvert() {
  try {
    execFileSync('convert', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function collect(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .map((name) => path.join(directory, name))
    .filter((file) => fs.statSync(file).isFile() && IMAGE_EXTENSIONS.includes(path.extname(file).toLowerCase()));
}

let source = process.argv.slice(2).find((argument) => !argument.startsWith('-'));
if (!source) {
  const candidates = [...collect(path.join(root, 'uploads')), ...collect(path.join(process.env.HOME || '', 'uploads'))];
  if (candidates.length === 1) source = candidates[0];
  else if (candidates.length > 1) {
    console.error('Multiple images found — pass the one you want explicitly:');
    for (const candidate of candidates) console.error(`  npm run photo:manager -- "${candidate}"`);
    process.exit(1);
  }
}

if (!source) {
  console.error('Usage: npm run photo:manager -- <path-to-image>');
  console.error(`The photo is written to ${path.relative(root, target)}`);
  process.exit(1);
}

const absolute = path.resolve(source);
if (!fs.existsSync(absolute)) {
  console.error(`Not found: ${absolute}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(target), { recursive: true });

if (hasConvert()) {
  try {
    execFileSync(
      'convert',
      [absolute, '-auto-orient', '-resize', '640x640^', '-gravity', 'center', '-extent', '640x640', '-strip', '-quality', '88', target],
      { stdio: 'inherit' },
    );
  } catch (error) {
    console.error('ImageMagick failed, copying the original file instead:', error instanceof Error ? error.message : error);
    fs.copyFileSync(absolute, target);
  }
} else {
  console.warn('ImageMagick not available — copied the file without resizing.');
  fs.copyFileSync(absolute, target);
}

const size = fs.statSync(target).size;
console.log(`✓ manager photo installed → ${path.relative(root, target)} (${Math.round(size / 1024)} KB)`);
console.log('  Restart `npm run dev` if the old image is still cached, or hard-refresh the page.');
