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

test('administrator content management is backend-authorized without committed passwords', async () => {
  const files = [
    'src/cms/AdminContext.tsx',
    'src/cms/contentRepository.ts',
    'src/cms/supabaseClient.ts',
    'src/components/admin/AdminDashboard.tsx',
    'src/components/admin/AdminLoginDialog.tsx',
    '.env.example',
    '.github/workflows/deploy-pages.yml',
  ];
  const source = (
    await Promise.all(files.map((file) => readFile(path.join(root, file), 'utf8')))
  ).join('\n');
  const migration = await readFile(
    path.join(root, 'supabase/migrations/202607260001_admin_cms.sql'),
    'utf8',
  );
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));

  assert.equal(typeof packageJson.dependencies['@supabase/supabase-js'], 'string');
  assert.match(source, /signInWithPassword/);
  assert.match(source, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(source, /VITE_ADMIN_PASSWORD|ADMIN_PASSWORD|service[_-]?role\s*=/i);
  assert.match(migration, /alter table public\.admin_users enable row level security/i);
  assert.match(migration, /alter table public\.content_items enable row level security/i);
  assert.match(migration, /private\.is_admin\(\)/i);
  assert.match(migration, /function public\.reorder_content_items\(ordered_ids uuid\[\]\)/i);
  assert.match(source, /rpc\('reorder_content_items'/);
});

test('missing baseline content is merged safely before first collection additions', async () => {
  const repository = await readFile(path.join(root, 'src/cms/contentRepository.ts'), 'utf8');
  const dashboard = await readFile(
    path.join(root, 'src/components/admin/AdminDashboard.tsx'),
    'utf8',
  );

  assert.match(repository, /export async function importMissingStaticContent/);
  assert.match(repository, /ignoreDuplicates:\s*true/);
  assert.match(repository, /seedCollectionBeforeFirstWrite/);
  assert.match(repository, /Math\.max\(input\.position, seededItemCount\)/);
  assert.match(dashboard, /Import .*missing item/);
  assert.doesNotMatch(repository, /\.upsert\(itemRows, \{ onConflict: 'content_type,slug' \}\)/);
});

test('coworker provisioning stays server-side and owner-authorized', async () => {
  const migration = await readFile(
    path.join(root, 'supabase/migrations/202607260002_team_access.sql'),
    'utf8',
  );
  const edgeFunction = await readFile(
    path.join(root, 'supabase/functions/manage-team-user/index.ts'),
    'utf8',
  );
  const clientSource = (
    await Promise.all(
      [
        'src/cms/AdminContext.tsx',
        'src/cms/supabaseClient.ts',
        'src/cms/teamRepository.ts',
        'src/components/admin/TeamAccessPanel.tsx',
      ].map((file) => readFile(path.join(root, file), 'utf8')),
    )
  ).join('\n');

  assert.match(migration, /role text not null default 'editor'/i);
  assert.match(migration, /set role = 'owner'/i);
  assert.match(migration, /private\.is_owner\(\)/i);
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /auth\.admin\.createUser/);
  assert.match(edgeFunction, /callerResult\.data\?\.role !== 'owner'/);
  assert.match(edgeFunction, /allowedOrigins/);
  assert.match(clientSource, /authEmailForUsername/);
  assert.match(clientSource, /functions\.invoke<TeamResponse>\('manage-team-user'/);
  assert.doesNotMatch(clientSource, /SUPABASE_SERVICE_ROLE_KEY|service[_-]?role\s*=/i);
});

const quotationTables = ['quote_settings', 'quote_categories', 'quotations', 'quotation_counters'];

test('quotation pricing is unreadable by unauthenticated visitors', async () => {
  const migration = await readFile(
    path.join(root, 'supabase/migrations/202608160001_quotation_system.sql'),
    'utf8',
  );

  // Defence in depth: the privilege is revoked, and no policy is written for the anon role.
  for (const table of quotationTables) {
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated;`),
      `${table} must revoke anon privileges`,
    );
  }

  for (const line of migration.split('\n')) {
    const statement = line.trim();
    if (!statement.startsWith('grant ')) continue;
    const table = quotationTables.find((name) => statement.includes(`public.${name}`));
    if (table) {
      assert.doesNotMatch(statement, /\banon\b/, `${table} must never be granted to anon`);
    }
  }

  // The rate card is owner-only; stored quotations may be managed by any administrator.
  const ownerOnlyTables = ['quote_settings', 'quote_categories'];
  for (const block of migration.split('create policy').slice(1)) {
    const statement = block.split(';')[0];
    const table = quotationTables.find((name) => statement.includes(`public.${name}`));
    if (!table) continue;

    assert.doesNotMatch(
      statement,
      /^\s*to .*\banon\b/m,
      `the policy on ${table} must not target anon`,
    );
    if (ownerOnlyTables.includes(table)) {
      assert.match(
        statement,
        /private\.is_owner\(\)/,
        `${table} holds pricing, so its policy must require owner access`,
      );
    } else {
      assert.match(
        statement,
        /private\.is_(admin|owner)\(\)/,
        `${table} policies must check administrator access`,
      );
    }
  }
  // Editors must not be able to reach pricing through the API even though the menu hides it.
  assert.doesNotMatch(
    migration.split('on public.quote_settings')[1]?.split('drop policy')[0] ?? '',
    /private\.is_admin\(\)/,
  );

  // Reference numbers can only be minted by the server-side function, never from a browser.
  assert.match(migration, /revoke all on function public\.issue_quotation_number\(\) from public;/);
  assert.match(
    migration,
    /grant execute on function public\.issue_quotation_number\(\) to service_role;/,
  );
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.issue_quotation_number\(\) to (anon|authenticated)/,
  );
});

test('the public quotation surface never handles pricing rules', async () => {
  const edgeFunction = await readFile(
    path.join(root, 'supabase/functions/quotation-estimate/index.ts'),
    'utf8',
  );
  assert.match(edgeFunction, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edgeFunction, /allowedOrigins/);
  assert.match(edgeFunction, /issue_quotation_number/);

  const publicFiles = [
    'src/components/quotation/QuotationWizard.tsx',
    'src/components/quotation/QuotationResult.tsx',
    'src/components/quotation/QuotationEstimateDialog.tsx',
    'src/components/quotation/QuoteInquiryDialog.tsx',
    'src/lib/quotationDocument.ts',
    'src/lib/quoteInquiry.ts',
    'src/lib/docgen/png.ts',
    'src/lib/docgen/pdf.ts',
    'src/lib/docgen/docx.ts',
  ];
  const publicSource = (
    await Promise.all(publicFiles.map((file) => readFile(path.join(root, file), 'utf8')))
  ).join('\n');

  for (const table of quotationTables) {
    assert.doesNotMatch(
      publicSource,
      new RegExp(table),
      `the public quotation UI must not reference ${table}`,
    );
  }
  assert.doesNotMatch(publicSource, /SUPABASE_SERVICE_ROLE_KEY|service[_-]?role\s*=/i);

  // The estimate the browser receives carries labels and amounts only.
  const types = await readFile(path.join(root, 'src/cms/quotationTypes.ts'), 'utf8');
  const estimate = types.split('export type QuotationEstimate = {')[1].split('};')[0];
  assert.doesNotMatch(estimate, /rate|basis|multiplier|margin|markup|supplier|quantity/i);
});

test('service-area availability stays optional so existing records keep validating', async () => {
  const types = await readFile(path.join(root, 'src/cms/types.ts'), 'utf8');
  const siteData = await readFile(path.join(root, 'src/data/siteData.ts'), 'utf8');

  assert.match(
    types,
    /value\.availability === undefined \|\| isStringArray\(value\.availability\)/,
  );
  assert.match(siteData, /availability\?: ServiceAreaCode\[\]/);
  // A required availability key would make every pre-existing row fail validation and vanish.
  assert.doesNotMatch(types, /hasStrings\(value, \[[^\]]*'availability'/);
  assert.match(
    siteData,
    /!area \|\| !item\.availability\?\.length \|\| item\.availability\.includes/,
  );
});
