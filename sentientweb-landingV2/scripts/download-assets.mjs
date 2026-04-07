import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

const urls = [
  'https://www.browserbase.com/_next/static/media/vanta.8804687b.svg',
  'https://www.browserbase.com/_next/static/media/perplexity.e3505c8d.svg',
  'https://www.browserbase.com/_next/static/media/microsoft.8f9b7c8e.svg',
  'https://www.browserbase.com/_next/static/media/vercel.66835247.svg',
  'https://www.browserbase.com/_next/static/media/hero-cube.png'
];

async function download(url) {
  try {
    const filename = path.basename(new URL(url).pathname);
    const dest = path.join('public/images', filename);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch ${url}`);
    await pipeline(response.body, fs.createWriteStream(dest));
    console.log(`Downloaded: ${filename}`);
  } catch (err) {
    console.error(`Error downloading ${url}: ${err.message}`);
  }
}

async function main() {
  if (!fs.existsSync('public/images')) fs.mkdirSync('public/images', { recursive: true });
  await Promise.all(urls.map(download));
}

main();
