/**
 * Covers the embed security boundary for the Media and Content section.
 *
 * The website never stores or renders administrator-supplied markup: a pasted snippet is parsed,
 * its iframe source is checked against a fixed allowlist, and only that address is kept. These
 * tests exercise the real module, so a change that widens the allowlist or lets markup through
 * fails here rather than on the live site.
 *
 * Requires Node's TypeScript type stripping (`--experimental-strip-types`, see package.json).
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  allowedEmbedHosts,
  isAllowedEmbedUrl,
  mediaPlatforms,
  parseEmbedCode,
  platformForUrl,
} from '../src/lib/mediaEmbed.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const facebookReel =
  '<iframe src="https://www.facebook.com/plugins/video.php?height=476&href=https%3A%2F%2Fwww.facebook.com%2Freel%2F1406919324619321%2F&show_text=true&width=267&t=0" width="267" height="591" style="border:none;overflow:hidden" scrolling="no" frameborder="0" allowfullscreen="true"></iframe>';

const facebookPost =
  '<iframe src="https://www.facebook.com/plugins/post.php?href=https%3A%2F%2Fwww.facebook.com%2FSmartSaveSolarBicol%2Fposts%2Fpfbid02ywmS1WyNbeRL2SMV7k26PNzBRJu9NwuvLuDWruXYWma5zFt1Yc3C1fNkjPRcA5Gl&show_text=true&width=500" width="500" height="716" style="border:none;overflow:hidden" scrolling="no" frameborder="0"></iframe>';

test('a pasted embed yields only an address and its natural size', () => {
  const { embed, error } = parseEmbedCode(facebookReel);
  assert.equal(error, undefined);
  assert.ok(embed);
  assert.equal(embed.width, 267);
  assert.equal(embed.height, 591);
  assert.equal(embed.platform, 'facebook');
  assert.ok(embed.url.startsWith('https://www.facebook.com/plugins/video.php'));

  // Nothing beyond the four known keys is carried across, so no markup can ride along.
  assert.deepEqual(Object.keys(embed).sort(), ['height', 'platform', 'url', 'width']);

  const post = parseEmbedCode(facebookPost);
  assert.equal(post.embed?.width, 500);
  assert.equal(post.embed?.height, 716);
});

test('a bare embed address is accepted without the surrounding markup', () => {
  const { embed } = parseEmbedCode(
    'https://www.youtube.com/embed/dQw4w9WgXcQ?rel=0&width=560&height=315',
  );
  assert.equal(embed?.platform, 'youtube');
  assert.equal(embed?.width, 560);
  assert.equal(embed?.height, 315);
});

test('escaped ampersands in a copied snippet are restored', () => {
  const { embed } = parseEmbedCode(
    '<iframe src="https://www.facebook.com/plugins/post.php?href=abc&amp;show_text=true&amp;width=500" width="500" height="300"></iframe>',
  );
  assert.ok(embed);
  assert.ok(embed.url.includes('&show_text=true'));
  assert.ok(!embed.url.includes('&amp;'));
});

test('untrusted and dangerous sources are refused', () => {
  const hostile = [
    // Wrong host entirely.
    '<iframe src="https://evil.example/pwn.html" width="500" height="500"></iframe>',
    // Lookalike hosts that merely contain an allowed name.
    '<iframe src="https://facebook.com.evil.example/x" width="500" height="500"></iframe>',
    '<iframe src="https://notfacebook.com/x" width="500" height="500"></iframe>',
    '<iframe src="https://www.facebook.com.attacker.net/x" width="500" height="500"></iframe>',
    // Script-bearing and non-http schemes.
    '<iframe src="javascript:alert(1)" width="500" height="500"></iframe>',
    '<iframe src="data:text/html,<script>alert(1)</script>" width="500" height="500"></iframe>',
    // Plaintext downgrade.
    '<iframe src="http://www.facebook.com/plugins/post.php" width="500" height="500"></iframe>',
    // Credentials in the authority, which browsers disagree about.
    '<iframe src="https://user:pass@www.facebook.com/plugins/post.php"></iframe>',
    // No iframe at all.
    '<script>alert(1)</script>',
    '<img src=x onerror="alert(1)">',
    'not an embed',
    '',
  ];

  for (const input of hostile) {
    const result = parseEmbedCode(input);
    assert.equal(result.embed, undefined, `should have been refused: ${input.slice(0, 60)}`);
    assert.ok(result.error, 'a refusal must explain itself');
  }
});

test('a script beside a permitted iframe contributes nothing', () => {
  // Only the iframe address survives parsing; the script is discarded rather than sanitised,
  // because no part of the pasted markup is ever stored or rendered.
  const { embed } = parseEmbedCode(
    `<script>fetch('https://evil.example')</script>${facebookReel}<script>alert(1)</script>`,
  );
  assert.ok(embed);
  assert.ok(embed.url.startsWith('https://www.facebook.com/'));
  assert.ok(!JSON.stringify(embed).includes('script'));
  assert.ok(!JSON.stringify(embed).includes('evil.example'));
});

test('the allowlist accepts only the documented platforms over https', () => {
  for (const host of allowedEmbedHosts) {
    assert.ok(isAllowedEmbedUrl(`https://${host}/embed`), `${host} should be allowed`);
    assert.ok(!isAllowedEmbedUrl(`http://${host}/embed`), `${host} must require https`);
  }
  assert.ok(!isAllowedEmbedUrl('https://vimeo.com/embed'));
  assert.ok(!isAllowedEmbedUrl(null));
  assert.ok(!isAllowedEmbedUrl(undefined));
  assert.ok(!isAllowedEmbedUrl(`https://www.facebook.com/${'a'.repeat(4000)}`));

  assert.equal(platformForUrl('https://www.tiktok.com/embed/x'), 'tiktok');
  assert.equal(platformForUrl('https://www.youtube-nocookie.com/embed/x'), 'youtube');
  assert.equal(platformForUrl('nonsense'), 'other');
});

test('media records are validated again when they are read back', async () => {
  const types = await readFile(path.join(root, 'src/cms/types.ts'), 'utf8');
  // The guard runs on every stored row, so a record written straight to the API rather than
  // through the admin form is dropped before it can be rendered.
  assert.match(types, /isAllowedEmbedUrl\(value\.embedUrl\)/);
  assert.match(types, /case 'media':/);

  const siteData = await readFile(path.join(root, 'src/data/siteData.ts'), 'utf8');
  assert.match(siteData, /embedUrl: string;/);
  // Storing markup would defeat the whole approach.
  assert.doesNotMatch(siteData, /embedCode|embedHtml/i);
});

test('no component injects embed markup into the page', async () => {
  const files = [
    'src/components/media/MediaSection.tsx',
    'src/components/media/MediaCarousel.tsx',
    'src/components/media/MediaEmbedFrame.tsx',
    'src/components/admin/ContentEditor.tsx',
    'src/lib/mediaEmbed.ts',
  ];
  const source = (
    await Promise.all(files.map((file) => readFile(path.join(root, file), 'utf8')))
  ).join('\n');

  assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(source, /\.innerHTML\s*=/);
  assert.doesNotMatch(source, /document\.write/);
  assert.doesNotMatch(source, /eval\(/);
  // Every rendered iframe takes its address from the validated record.
  assert.match(source, /src=\{item\.embedUrl\}/);
});

test('the media platform list and its labels stay in step', async () => {
  const types = await readFile(path.join(root, 'src/lib/mediaEmbed.ts'), 'utf8');
  for (const platform of mediaPlatforms) {
    assert.ok(types.includes(`${platform}:`), `${platform} needs a label`);
  }
});
