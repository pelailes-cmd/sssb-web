import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const screenshotDir = path.join(root, 'tmp', 'viewport-checks');
const forceStaticFallback = process.env.SSSB_AUDIT_STATIC_FALLBACK === '1';
const preferredBrowser = process.env.SSSB_AUDIT_BROWSER;
const chromeCandidates = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
];
const orderedCandidates =
  preferredBrowser === 'edge'
    ? [...chromeCandidates.slice(2), ...chromeCandidates.slice(0, 2)]
    : chromeCandidates;
const chromePath = orderedCandidates.find(existsSync);

if (!chromePath) throw new Error('Chrome or Edge was not found for the responsive browser audit.');

const tempPrefix = path.join(tmpdir(), 'sssb-browser-audit-');
const profileDir = await mkdtemp(tempPrefix);
await mkdir(screenshotDir, { recursive: true });

const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--remote-debugging-port=0',
    '--remote-allow-origins=*',
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-default-apps',
    '--disable-sync',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    ...(forceStaticFallback
      ? [
          '--no-sandbox',
          '--disable-gpu',
          '--disable-webgl',
          '--disable-webgl2',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu-sandbox',
        ]
      : ['--ignore-gpu-blocklist']),
    '--hide-scrollbars',
    'about:blank',
  ],
  { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] },
);
console.log(`Starting responsive audit with ${path.basename(chromePath)}.`);
let browserDiagnostics = '';
chrome.stderr?.on('data', (chunk) => {
  browserDiagnostics = `${browserDiagnostics}${String(chunk)}`.slice(-12000);
});

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForDevToolsPort() {
  const portFile = path.join(profileDir, 'DevToolsActivePort');
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (existsSync(portFile)) {
      try {
        const contents = await Promise.race([
          readFile(portFile, 'utf8'),
          delay(250).then(() => null),
        ]);
        if (!contents) continue;
        const [port] = contents.trim().split(/\r?\n/);
        if (port) return Number(port);
      } catch (error) {
        if (!['EBUSY', 'EPERM'].includes(error.code)) throw error;
      }
    }
    await delay(100);
  }
  throw new Error('Timed out waiting for the headless browser debugging port.');
}

function createCdpClient(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 0;

  const rejectPending = (reason) => {
    const error = reason instanceof Error ? reason : new Error(String(reason));
    pending.forEach((request) => request.reject(error));
    pending.clear();
  };

  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener(
      'error',
      () => reject(new Error(`Unable to open the browser connection at ${webSocketUrl}.`)),
      { once: true },
    );
  });

  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id) {
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
      return;
    }

    const methodListeners = listeners.get(message.method) ?? [];
    methodListeners.forEach((listener) => listener(message.params));
  });
  socket.addEventListener('close', () => rejectPending(new Error('Browser connection closed.')));
  socket.addEventListener('error', () => rejectPending(new Error('Browser connection failed.')));

  return {
    opened,
    send(method, params = {}, timeout = 15000) {
      if (socket.readyState !== WebSocket.OPEN) {
        return Promise.reject(new Error(`Cannot send ${method}; browser connection is closed.`));
      }
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`Timed out sending ${method} to the browser.`));
        }, timeout);
        pending.set(id, {
          resolve(value) {
            clearTimeout(timer);
            resolve(value);
          },
          reject(error) {
            clearTimeout(timer);
            reject(error);
          },
        });
        try {
          socket.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
    },
    once(method, timeout = 10000) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(`Timed out waiting for ${method}`)),
          timeout,
        );
        const listener = (params) => {
          clearTimeout(timer);
          listeners.set(
            method,
            (listeners.get(method) ?? []).filter((item) => item !== listener),
          );
          resolve(params);
        };
        listeners.set(method, [...(listeners.get(method) ?? []), listener]);
      });
    },
    on(method, listener) {
      listeners.set(method, [...(listeners.get(method) ?? []), listener]);
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression) {
  const response = await client.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    const details = response.exceptionDetails;
    throw new Error(details.exception?.description ?? details.text ?? 'Browser evaluation failed.');
  }
  return response.result.value;
}

const viewportWidths = [360, 390, 768, 1024, 1440];
const report = [];
const runtimeErrors = [];
let client;

try {
  const port = await waitForDevToolsPort();
  console.log('Headless browser is ready.');
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(5000),
    })
  ).json();
  const pageTarget = targets.find((target) => target.type === 'page');
  if (!pageTarget?.webSocketDebuggerUrl) throw new Error('No browser page target was available.');

  client = createCdpClient(pageTarget.webSocketDebuggerUrl);
  await Promise.race([
    client.opened,
    delay(5000).then(() => {
      throw new Error('Timed out opening the headless browser connection.');
    }),
  ]);
  await Promise.all([
    client.send('Page.enable'),
    client.send('Runtime.enable'),
    client.send('Log.enable'),
  ]);
  client.on('Runtime.exceptionThrown', (details) =>
    runtimeErrors.push(details.exceptionDetails?.text ?? 'Runtime exception'),
  );
  client.on('Log.entryAdded', ({ entry }) => {
    if (entry.level === 'error') runtimeErrors.push(entry.text);
  });

  for (const width of viewportWidths) {
    console.log(`Auditing ${width}px viewport...`);
    const height = width <= 390 ? 800 : width <= 768 ? 900 : 960;
    await client.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width <= 580,
      screenWidth: width,
      screenHeight: height,
    });

    const loaded = client.once('Page.loadEventFired');
    await client.send('Page.navigate', { url: 'http://127.0.0.1:5173/' });
    await loaded;
    await delay(1800);

    const layout = await evaluate(
      client,
      `(() => {
        const root = document.documentElement;
        const requiredIds = ['home','services','products','promotions','documentation','portfolio','contact','about'];
        const navItems = [...document.querySelectorAll('.desktop-nav a')];
        const productCards = [...document.querySelectorAll('.product-card')];
        const categoryCount = (category) => productCards.filter((card) =>
          card.querySelector('.product-card__meta span')?.textContent.trim() === category
        ).length;
        const menuButton = document.querySelector('.menu-toggle');
        const visible = (element) => element && getComputedStyle(element).display !== 'none' && element.getBoundingClientRect().width > 0;
        return {
          viewportWidth: innerWidth,
          documentWidth: root.scrollWidth,
          horizontalOverflow: Math.max(0, root.scrollWidth - innerWidth),
          requiredSectionsPresent: requiredIds.every((id) => document.getElementById(id)),
          desktopNavCount: navItems.filter(visible).length,
          mobileMenuVisible: visible(menuButton),
          mobileMenuSize: menuButton ? { width: menuButton.getBoundingClientRect().width, height: menuButton.getBoundingClientRect().height } : null,
          canvasAvailable: Boolean(document.querySelector('.hero-scene:not([hidden])')),
          navOrder: [...document.querySelectorAll('.mobile-menu nav a')].map((item) => item.textContent.trim().replace(/^\\d+/, '')),
          productCards: productCards.length,
          solarPanelCards: categoryCount('Solar Panels'),
          inverterCards: categoryCount('Inverters'),
          modelPreviews: document.querySelectorAll('[data-model-preview]').length,
          modelFallbacks: document.querySelectorAll('[data-model-fallback]').length,
          formLocalOnlyNotice: document.querySelector('.inquiry-form__footer p')?.textContent.includes('local') ?? false,
          headerAdminVisible: visible(document.querySelector('.header-admin')),
          mobileAdminAvailable: Boolean(document.querySelector('.mobile-menu__admin')),
        };
      })()`,
    );

    let mobileMenu = null;
    if (width < 1180) {
      mobileMenu = await evaluate(
        client,
        `new Promise((resolve) => {
          document.querySelector('.menu-toggle')?.click();
          setTimeout(() => resolve({
            expanded: document.querySelector('.menu-toggle')?.getAttribute('aria-expanded'),
            focusedLabel: document.activeElement?.getAttribute('aria-label'),
            panelRight: Math.round(document.querySelector('.mobile-menu__panel')?.getBoundingClientRect().right ?? -1),
            viewportRight: innerWidth,
          }), 520);
        })`,
      );
      await client.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      });
      await client.send('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: 'Escape',
        code: 'Escape',
        windowsVirtualKeyCode: 27,
      });
      await delay(100);
      mobileMenu.closed = await evaluate(
        client,
        `({
          expanded: document.querySelector('.menu-toggle')?.getAttribute('aria-expanded'),
          focusedLabel: document.activeElement?.getAttribute('aria-label'),
        })`,
      );
    }

    let productFilterFlow = null;
    let modelVariantFlow = null;
    let modelDialogFlow = null;
    let adminLoginFlow = null;
    let mobileAdminLoginFlow = null;
    if (width === 390) {
      await evaluate(
        client,
        `(() => {
          document.documentElement.style.scrollBehavior = 'auto';
          const solarPanels = [...document.querySelectorAll('.catalog-filters button')]
            .find((button) => button.textContent.trim() === 'Solar Panels');
          solarPanels?.click();
          document.querySelector('.product-grid')?.scrollIntoView();
        })()`,
      );
      await delay(1400);
      const filtered = await evaluate(
        client,
        `(() => {
          const firstCard = document.querySelector('.product-card');
          return {
            cardCount: document.querySelectorAll('.product-card').length,
            firstCardOpacity: firstCard ? Number(getComputedStyle(firstCard).opacity) : null,
            firstModelStatus: document.querySelector('.product-card [data-model-preview]')?.dataset.modelStatus,
            firstModelDiagnostic: document.querySelector('.product-card [data-model-preview]')?.dataset.modelDiagnostic,
            status: document.querySelector('.catalog-status')?.textContent.trim(),
            rootText: document.querySelector('#root')?.textContent.slice(0, 160),
          };
        })()`,
      );

      await evaluate(
        client,
        `(() => {
          const allProducts = [...document.querySelectorAll('.catalog-filters button')]
            .find((button) => button.textContent.trim() === 'All');
          allProducts?.click();
          document.querySelector('.product-grid')?.scrollIntoView();
        })()`,
      );
      await delay(900);
      const reset = await evaluate(
        client,
        `(() => {
          const firstCard = document.querySelector('.product-card');
          return {
            cardCount: document.querySelectorAll('.product-card').length,
            firstCardOpacity: firstCard ? Number(getComputedStyle(firstCard).opacity) : null,
            status: document.querySelector('.catalog-status')?.textContent.trim(),
            allPressed: document.querySelector('.catalog-filters button')?.getAttribute('aria-pressed'),
          };
        })()`,
      );
      productFilterFlow = { filtered, reset };

      await evaluate(
        client,
        `(() => {
          const inverters = [...document.querySelectorAll('.catalog-filters button')]
            .find((button) => button.textContent.trim() === 'Inverters');
          inverters?.click();
          document.querySelector('.product-grid')?.scrollIntoView();
        })()`,
      );
      await delay(1400);
      const variantBefore = await evaluate(
        client,
        `(() => {
          const preview = document.querySelector('.product-card [data-model-preview]');
          return {
            label: preview?.querySelector('.model-preview__variants strong')?.textContent.trim(),
            status: preview?.dataset.modelStatus,
            diagnostic: preview?.dataset.modelDiagnostic,
            canvasLabel: preview?.querySelector('.model-canvas')?.getAttribute('aria-label'),
          };
        })()`,
      );
      await evaluate(
        client,
        `document.querySelector('.product-card [data-model-preview] button[aria-label="Show next 3D model"]')?.click()`,
      );
      await delay(1400);
      const variantAfter = await evaluate(
        client,
        `(() => {
          const preview = document.querySelector('.product-card [data-model-preview]');
          return {
            label: preview?.querySelector('.model-preview__variants strong')?.textContent.trim(),
            status: preview?.dataset.modelStatus,
            diagnostic: preview?.dataset.modelDiagnostic,
            canvasLabel: preview?.querySelector('.model-canvas')?.getAttribute('aria-label'),
          };
        })()`,
      );
      modelVariantFlow = { before: variantBefore, after: variantAfter };

      await evaluate(
        client,
        `(() => {
          const allProducts = [...document.querySelectorAll('.catalog-filters button')]
            .find((button) => button.textContent.trim() === 'All');
          allProducts?.click();
        })()`,
      );
      await evaluate(client, `window.scrollTo(0, 0)`);
      await delay(100);

      await evaluate(client, `document.querySelector('.menu-toggle')?.click()`);
      await delay(520);
      await evaluate(client, `document.querySelector('.mobile-menu__admin')?.click()`);
      await delay(700);
      mobileAdminLoginFlow = await evaluate(
        client,
        `(() => {
          const dialog = document.querySelector('.admin-login');
          return {
            open: dialog?.open ?? false,
            title: dialog?.querySelector('h2')?.textContent.trim(),
            setupVisible: Boolean(dialog?.querySelector('.admin-login__setup')),
            passwordFieldPresent: Boolean(dialog?.querySelector('input[type="password"]')),
          };
        })()`,
      );
      const mobileAdminScreenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      await writeFile(
        path.join(screenshotDir, 'admin-login-390.png'),
        Buffer.from(mobileAdminScreenshot.data, 'base64'),
      );
      await evaluate(
        client,
        `document.querySelector('.admin-login button[aria-label="Close administrator login"]')?.click()`,
      );
      await delay(150);
    }

    if (width === 1440) {
      adminLoginFlow = await evaluate(
        client,
        `new Promise((resolve) => {
          document.querySelector('.header-admin')?.click();
          setTimeout(() => {
            const dialog = document.querySelector('.admin-login');
            resolve({
              open: dialog?.open ?? false,
              title: dialog?.querySelector('h2')?.textContent.trim(),
              setupVisible: Boolean(dialog?.querySelector('.admin-login__setup')),
              passwordFieldPresent: Boolean(dialog?.querySelector('input[type="password"]')),
            });
          }, 700);
        })`,
      );
      const adminLoginScreenshot = await client.send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      await writeFile(
        path.join(screenshotDir, 'admin-login-1440.png'),
        Buffer.from(adminLoginScreenshot.data, 'base64'),
      );
      await evaluate(
        client,
        `document.querySelector('.admin-login button[aria-label="Close administrator login"]')?.click()`,
      );
      await delay(150);
    }

    const screenshot = await client.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(
      path.join(screenshotDir, `home-${width}.png`),
      Buffer.from(screenshot.data, 'base64'),
    );

    if (width === 390 || width === 1440) {
      const sectionIds =
        width === 390 ? ['products', 'promotions', 'contact'] : ['products', 'promotions'];
      for (const sectionId of sectionIds) {
        await evaluate(
          client,
          `(() => {
            document.documentElement.style.scrollBehavior = 'auto';
            const section = document.getElementById('${sectionId}');
            if (section) window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY);
          })()`,
        );
        await delay(900);
        const sectionScreenshot = await client.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: false,
        });
        await writeFile(
          path.join(screenshotDir, `${sectionId}-${width}.png`),
          Buffer.from(sectionScreenshot.data, 'base64'),
        );

        if (sectionId === 'products') {
          await evaluate(client, `document.querySelector('.product-grid')?.scrollIntoView()`);
          await delay(1500);
          const modelGridScreenshot = await client.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: false,
          });
          await writeFile(
            path.join(screenshotDir, `model-grid-${width}.png`),
            Buffer.from(modelGridScreenshot.data, 'base64'),
          );

          await evaluate(
            client,
            `(() => {
              const card = document.querySelector('.product-card:has([data-model-preview])')
                ?? document.querySelector('.product-card');
              card?.querySelector('.product-card__details')?.click();
            })()`,
          );
          await delay(1400);
          modelDialogFlow = await evaluate(
            client,
            `(() => {
              const dialog = document.querySelector('.product-dialog');
              const preview = dialog?.querySelector('[data-model-preview]');
              return {
                open: dialog?.open ?? false,
                status: preview?.dataset.modelStatus,
                canvasLabel: preview?.querySelector('.model-canvas')?.getAttribute('aria-label'),
              };
            })()`,
          );
          const modelDialogScreenshot = await client.send('Page.captureScreenshot', {
            format: 'png',
            fromSurface: true,
            captureBeyondViewport: false,
          });
          await writeFile(
            path.join(screenshotDir, `model-dialog-${width}.png`),
            Buffer.from(modelDialogScreenshot.data, 'base64'),
          );
          await evaluate(
            client,
            `document.querySelector('.product-dialog button[aria-label="Close product details"]')?.click()`,
          );
          await delay(180);
        }
      }
    }
    report.push({
      width,
      height,
      layout,
      mobileMenu,
      productFilterFlow,
      modelVariantFlow,
      modelDialogFlow,
      adminLoginFlow,
      mobileAdminLoginFlow,
    });
  }

  const failures = report.flatMap((entry) => {
    const issues = [];
    if (entry.layout.horizontalOverflow > 1) issues.push('horizontal overflow');
    if (!entry.layout.requiredSectionsPresent) issues.push('missing required section');
    if (entry.layout.productCards < 1) issues.push('no product cards');
    if (entry.layout.modelPreviews + entry.layout.modelFallbacks !== entry.layout.productCards + 1)
      issues.push('product preview count');
    if (!entry.layout.formLocalOnlyNotice) issues.push('missing local-only form notice');
    if (entry.width === 390) {
      if (entry.productFilterFlow?.filtered?.cardCount !== entry.layout.solarPanelCards)
        issues.push('category filter card count');
      if (
        entry.layout.solarPanelCards > 0 &&
        entry.productFilterFlow?.filtered?.firstCardOpacity < 0.99
      )
        issues.push('category filter cards stayed hidden');
      if (
        entry.layout.solarPanelCards > 0 &&
        !forceStaticFallback &&
        entry.productFilterFlow?.filtered?.firstModelStatus !== 'ready'
      )
        issues.push('filtered 3D preview did not become ready');
      if (entry.productFilterFlow?.reset?.cardCount !== entry.layout.productCards)
        issues.push('All filter card count');
      if (entry.productFilterFlow?.reset?.firstCardOpacity < 0.99)
        issues.push('All filter cards stayed hidden');
      if (entry.productFilterFlow?.reset?.allPressed !== 'true')
        issues.push('All filter pressed state');
      if (!entry.mobileAdminLoginFlow?.open)
        issues.push('mobile administrator login dialog did not open');
      if (entry.mobileAdminLoginFlow?.title !== 'Administrator login')
        issues.push('mobile administrator login heading');
      if (
        entry.mobileAdminLoginFlow?.setupVisible ===
        entry.mobileAdminLoginFlow?.passwordFieldPresent
      ) {
        issues.push('mobile administrator configuration state');
      }
      if (
        entry.layout.inverterCards > 0 &&
        !forceStaticFallback &&
        entry.modelVariantFlow?.before?.status !== 'ready'
      )
        issues.push('initial inverter 3D variant did not load');
      if (
        entry.layout.inverterCards > 0 &&
        !forceStaticFallback &&
        entry.modelVariantFlow?.after?.status !== 'ready'
      )
        issues.push('next inverter 3D variant did not load');
      if (
        entry.layout.inverterCards > 0 &&
        entry.modelVariantFlow?.before?.label === entry.modelVariantFlow?.after?.label
      )
        issues.push('inverter 3D variant did not change');
      if (
        entry.layout.inverterCards > 0 &&
        !forceStaticFallback &&
        !entry.modelVariantFlow?.after?.canvasLabel?.includes('10kW')
      )
        issues.push('inverter 10kW model was not selected');
    }
    if (entry.width === 390 || entry.width === 1440) {
      if (!entry.modelDialogFlow?.open) issues.push('3D product dialog did not open');
      if (!forceStaticFallback && entry.modelDialogFlow?.status !== 'ready')
        issues.push('3D product dialog model did not load');
      if (!forceStaticFallback && !entry.modelDialogFlow?.canvasLabel)
        issues.push('3D product dialog lacks an accessible model label');
    }
    if (entry.width >= 1180) {
      if (entry.layout.desktopNavCount !== 10) issues.push('desktop nav count');
      if (!entry.layout.headerAdminVisible) issues.push('desktop administrator login button');
    }
    if (entry.width < 1180) {
      if (!entry.layout.mobileAdminAvailable) issues.push('mobile administrator login button');
      if (entry.layout.mobileMenuSize?.width < 44 || entry.layout.mobileMenuSize?.height < 44) {
        issues.push('mobile menu touch target');
      }
      if (entry.mobileMenu?.expanded !== 'true') issues.push('mobile menu did not open');
      if (entry.mobileMenu?.focusedLabel !== 'Close navigation menu')
        issues.push('mobile menu focus');
      if (Math.abs(entry.mobileMenu?.panelRight - entry.mobileMenu?.viewportRight) > 1) {
        issues.push('mobile menu panel alignment');
      }
      if (entry.mobileMenu?.closed?.expanded !== 'false') issues.push('Escape did not close menu');
      if (entry.mobileMenu?.closed?.focusedLabel !== 'Open navigation menu') {
        issues.push('menu focus was not restored');
      }
    }
    if (entry.width === 1440) {
      if (!entry.adminLoginFlow?.open) issues.push('administrator login dialog did not open');
      if (entry.adminLoginFlow?.title !== 'Administrator login')
        issues.push('administrator login heading');
      if (entry.adminLoginFlow?.setupVisible === entry.adminLoginFlow?.passwordFieldPresent) {
        issues.push('administrator configuration state');
      }
    }
    return issues.map((issue) => `${entry.width}px: ${issue}`);
  });

  if (runtimeErrors.length)
    failures.push(...runtimeErrors.map((error) => `browser error: ${error}`));

  console.log(
    JSON.stringify({ report, runtimeErrors, screenshotDir, forceStaticFallback }, null, 2),
  );
  if (failures.length) throw new Error(`Responsive audit failed:\n${failures.join('\n')}`);
} catch (error) {
  if (browserDiagnostics.trim()) console.error(browserDiagnostics.trim());
  throw error;
} finally {
  try {
    if (client) {
      await Promise.race([client.send('Browser.close'), delay(2500)]);
    }
  } catch {
    chrome.kill();
  }
  client?.close();
  if (chrome.exitCode === null) {
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(2500)]);
  }
  if (chrome.exitCode === null) {
    chrome.kill();
    await Promise.race([new Promise((resolve) => chrome.once('exit', resolve)), delay(1500)]);
  }
  chrome.stderr?.destroy();
  chrome.unref();
  const resolvedProfile = path.resolve(profileDir);
  const resolvedPrefix = path.resolve(tempPrefix);
  if (!resolvedProfile.startsWith(resolvedPrefix)) {
    console.error(`Refusing to clean unexpected browser profile path: ${resolvedProfile}`);
    process.exitCode = 1;
  } else {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        const cleanupResult = await Promise.race([
          rm(resolvedProfile, { recursive: true, force: true }).then(() => 'removed'),
          delay(1000).then(() => 'timed-out'),
        ]);
        if (cleanupResult === 'timed-out') {
          console.warn('Browser profile cleanup timed out; the OS can release it later.');
        }
        break;
      } catch (error) {
        if (error.code !== 'EBUSY' || attempt === 7) {
          console.warn(`Browser profile cleanup was incomplete: ${error.message}`);
          break;
        }
        await delay(250);
      }
    }
  }
}

// Headless Chromium can leave a Windows process handle open after Browser.close.
// All audit work and cleanup are complete here, so end the CLI deterministically.
process.exit(process.exitCode ?? 0);
