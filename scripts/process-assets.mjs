import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputRoot = path.join(root, 'public', 'assets');

const recipes = [
  {
    source: 'logo/images-removebg-preview.png',
    output: 'brand/brand-mark.png',
    resize: {
      width: 384,
      height: 384,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
    format: 'png',
  },
  {
    source: 'Cover/676896824_122199545648487243_6914997237328649967_n.png',
    output: 'brand/cover-og.webp',
    resize: { width: 1200, height: 630, fit: 'cover', position: 'center' },
  },
  {
    source: 'Products/678507699_122199552002487243_1903034989554300275_n.jpg',
    output: 'products/aesolar-730w.webp',
    extract: { left: 70, top: 500, width: 720, height: 1080 },
  },
  {
    source: 'Products/705246995_122202960908487243_161131196118972715_n.jpg',
    output: 'products/aesolar-730w-alt.webp',
    extract: { left: 65, top: 340, width: 880, height: 1340 },
  },
  {
    source: 'Products/704247617_122202960968487243_4931383496915364844_n.jpg',
    output: 'products/protective-devices.webp',
    extract: { left: 70, top: 705, width: 1880, height: 760 },
  },
  {
    source: 'Products/704507190_122202960938487243_6770757383729737968_n.jpg',
    output: 'products/mounting-accessories.webp',
    extract: { left: 135, top: 420, width: 1780, height: 1240 },
  },
  {
    source: 'Products/715098627_122205059930487243_7163553318269054879_n.jpg',
    output: 'products/window-aircon-2hp.webp',
    extract: { left: 920, top: 620, width: 970, height: 1320 },
  },
  {
    source: 'Products/718315905_122205060014487243_2229542025750677455_n.jpg',
    output: 'products/split-aircon-1hp.webp',
    extract: { left: 850, top: 630, width: 1050, height: 1130 },
  },
  {
    source: 'Products/733171830_122207118458487243_3972604877434896304_n.jpg',
    output: 'products/split-aircon-1hp-sale.webp',
    extract: { left: 520, top: 420, width: 690, height: 580 },
  },
  {
    source: 'Products/720989602_122205059924487243_1491592851211208495_n.jpg',
    output: 'products/split-aircon-1-5hp.webp',
    extract: { left: 850, top: 760, width: 1110, height: 880 },
  },
  {
    source: 'Products/721702792_122205059936487243_8501170599659934570_n.jpg',
    output: 'products/window-aircon-1hp.webp',
    extract: { left: 930, top: 625, width: 925, height: 1330 },
  },
  {
    source: 'Products/722217932_122205552758487243_3345310414971461112_n.jpg',
    output: 'products/floodlight-200w.webp',
    extract: { left: 850, top: 970, width: 1110, height: 1010 },
  },
  {
    source: 'Products/724097918_122205552050487243_3126333187237622560_n.jpg',
    output: 'products/floodlight-100w.webp',
    extract: { left: 790, top: 870, width: 1180, height: 1040 },
  },
  {
    source: 'Products/738503843_122207837474487243_8133364968035558929_n.jpg',
    output: 'products/solis-hybrid-inverters.webp',
    extract: { left: 140, top: 680, width: 1770, height: 1050 },
  },
  {
    source: 'Products/738593651_122207837600487243_849616176645008077_n.jpg',
    output: 'products/aesolar-620w.webp',
    extract: { left: 105, top: 390, width: 850, height: 1410 },
  },
  {
    source: 'Products/739214774_122207837432487243_204640520366377611_n.jpg',
    output: 'products/lifepo4-batteries.webp',
    extract: { left: 70, top: 780, width: 1900, height: 990 },
  },
  {
    source: 'Products/749878482_122209848686487243_2278605115556772033_n.jpg',
    output: 'products/smart-save-hybrid-inverters.webp',
    extract: { left: 280, top: 610, width: 1510, height: 1090 },
  },
  {
    source: 'Promotions/752484635_122210133044487243_2251433083577835687_n.jpg',
    output: 'promotions/free-aircon-products.webp',
    extract: { left: 55, top: 735, width: 1140, height: 290 },
  },
];

const manifest = [];

for (const recipe of recipes) {
  const sourcePath = path.join(root, recipe.source);
  const outputPath = path.join(outputRoot, recipe.output);
  await mkdir(path.dirname(outputPath), { recursive: true });

  let pipeline = sharp(sourcePath, { failOn: 'warning' }).rotate();
  if (recipe.extract) pipeline = pipeline.extract(recipe.extract);
  if (recipe.resize) pipeline = pipeline.resize(recipe.resize);
  else if (recipe.width)
    pipeline = pipeline.resize({ width: recipe.width, withoutEnlargement: true });
  else pipeline = pipeline.resize({ width: 960, withoutEnlargement: true });

  if (recipe.format === 'png') pipeline = pipeline.png({ compressionLevel: 9, palette: true });
  else pipeline = pipeline.webp({ quality: 84, effort: 5, smartSubsample: true });

  const info = await pipeline.toFile(outputPath);
  manifest.push({
    source: recipe.source,
    output: recipe.output,
    width: info.width,
    height: info.height,
    bytes: info.size,
  });
}

const modelSourceRoot = path.join(root, 'models');
const modelOutputRoot = path.join(outputRoot, 'models');
const modelFiles = (await readdir(modelSourceRoot))
  .filter((file) => file.toLowerCase().endsWith('.glb'))
  .sort();

await mkdir(modelOutputRoot, { recursive: true });
for (const file of modelFiles) {
  const sourcePath = path.join(modelSourceRoot, file);
  const outputPath = path.join(modelOutputRoot, file);
  await copyFile(sourcePath, outputPath);
  const info = await stat(outputPath);
  manifest.push({
    source: `models/${file}`,
    output: `models/${file}`,
    bytes: info.size,
  });
}

await writeFile(
  path.join(outputRoot, 'processed-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8',
);

console.log(
  `Created ${manifest.length} processed assets without modifying source files (${modelFiles.length} GLB models copied).`,
);
