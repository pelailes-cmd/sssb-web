import assert from 'node:assert/strict';
import { access, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('all supplied source images are represented in the processed manifest', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'public/assets/processed-manifest.json'), 'utf8'),
  );
  const productSources = new Set(
    manifest.filter((item) => item.source.startsWith('Products/')).map((item) => item.source),
  );
  assert.equal(productSources.size, 15);
  assert.equal(manifest.filter((item) => item.source.startsWith('Promotions/')).length, 1);
  assert.equal(manifest.filter((item) => item.source.startsWith('Cover/')).length, 1);
  assert.equal(manifest.filter((item) => item.source.startsWith('logo/')).length, 1);
});

test('all supplied GLB models are published and referenced by the product experience', async () => {
  const manifest = JSON.parse(
    await readFile(path.join(root, 'public/assets/processed-manifest.json'), 'utf8'),
  );
  const sourceModels = (await readdir(path.join(root, 'models')))
    .filter((file) => file.endsWith('.glb'))
    .sort();
  const publishedModels = manifest
    .filter((item) => item.source.startsWith('models/'))
    .map((item) => path.basename(item.source))
    .sort();
  assert.equal(sourceModels.length, 37);
  assert.deepEqual(publishedModels, sourceModels);

  const productData = await readFile(path.join(root, 'src/data/siteData.ts'), 'utf8');
  await Promise.all(
    sourceModels.map(async (file) => {
      const buffer = await readFile(path.join(root, 'models', file));
      assert.equal(buffer.readUInt32LE(0), 0x46546c67, `${file} has a valid GLB header`);
      assert.equal(buffer.readUInt32LE(4), 2, `${file} uses GLB version 2`);
      const jsonLength = buffer.readUInt32LE(12);
      assert.equal(buffer.readUInt32LE(16), 0x4e4f534a, `${file} starts with a JSON chunk`);
      const document = JSON.parse(
        buffer
          .subarray(20, 20 + jsonLength)
          .toString('utf8')
          .replace(/\0+$/g, '')
          .trim(),
      );
      assert.equal(document.asset?.version, '2.0', `${file} declares glTF 2.0`);
      assert.ok(document.meshes?.length, `${file} contains renderable meshes`);
    }),
  );
  sourceModels.forEach((file) => {
    assert.match(productData, new RegExp(file.replace(/\.glb$/, '')));
  });
});

test('verified phone and address are present and the uncertain email is not linked', async () => {
  const sourceFiles = ['src/data/siteData.ts', 'src/components/ContactSection.tsx'];
  const source = (
    await Promise.all(sourceFiles.map((file) => readFile(path.join(root, file), 'utf8')))
  ).join('\n');
  assert.match(source, /0997-688-4865/);
  assert.match(source, /Zone 1, Caroyroyan, Pili, Camarines Sur/);
  assert.doesNotMatch(source, /mailto:ssvc\.\.bicol@gmail\.com/);
});

test('production support files and optimized assets exist', async () => {
  await Promise.all(
    [
      'public/robots.txt',
      'public/404.html',
      'public/assets/brand/brand-mark.png',
      'public/assets/brand/cover-og.webp',
      'public/assets/promotions/free-aircon-products.webp',
    ].map((file) => access(path.join(root, file))),
  );
});
