/* Run: node scripts/qa-summoner-4a.cjs
 * Browser-level visual and navigation checks. No application mutations.
 */
const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');

const BASE = process.env.SUMMONER_BASE_URL || 'http://127.0.0.1:3037';
const OUTPUT = process.env.SUMMONER_QA_OUTPUT || path.join(process.cwd(), 'output', 'summoner-refinement');
const routes = ['/enter', '/summons', '/contracts/bind', '/duel/demo', '/rituals', '/judgment/demo', '/profile'];
const sizes = [{ label: 'desktop', width: 1440, height: 900 }, { label: 'mobile', width: 390, height: 844 }];
fs.mkdirSync(OUTPUT, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    args: ['--no-sandbox', '--disable-extensions'],
  });
  const checks = [];
  let failed = 0;
  try {
    for (const size of sizes) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        deviceScaleFactor: 1,
        isMobile: size.label === 'mobile',
        hasTouch: size.label === 'mobile',
        reducedMotion: 'reduce',
      });
      const page = await context.newPage();
      for (const route of routes) {
        const errors = [];
        const onPageError = error => errors.push(error.message);
        page.on('pageerror', onPageError);
        const item = { route, viewport: size.label, width: size.width, height: size.height };
        try {
          const response = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
          await page.waitForTimeout(480);
          item.httpStatus = response && response.status();
          item.url = new URL(page.url()).pathname;
          item.h1 = (await page.locator('h1').allTextContents()).map(x => x.trim().replace(/\s+/g, ' ').slice(0, 100));
          item.hasPrimaryNavigation = await page.locator('nav[aria-label="Quest world navigation"]').count() > 0;
          item.hasSkipLink = await page.locator('.sum-skip-link').count() > 0;
          item.hasPico = await page.locator('.sum-familiar').count() > 0;
          item.overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - innerWidth));
          item.errors = errors;
          const file = route.replace(/\W/g, '-').replace(/^-/, '') + '-' + size.label + '.png';
          item.screenshot = path.join(OUTPUT, file);
          await page.screenshot({ path: item.screenshot, fullPage: true, animations: 'disabled' });
          if (!(item.httpStatus >= 200 && item.httpStatus < 400) || item.overflow > 1 || errors.length) failed++;
        } catch (error) {
          failed++;
          item.error = String(error.message || error).slice(0, 600);
        }
        checks.push(item);
        process.stdout.write(JSON.stringify(item) + '\n');
        page.off('pageerror', onPageError);
      }
      await context.close();
    }
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
    await page.goto(BASE + '/enter', { waitUntil: 'domcontentloaded', timeout: 30000 });
    const enterButton = page.locator('[data-testid="gateway-handle"]');
    const gatewayAction = { name: 'gatewayCTA', found: await enterButton.count() };
    if (gatewayAction.found) {
      await enterButton.click();
      try { await page.waitForURL(/\/summons(?:\?|$)/, { timeout: 12000 }); gatewayAction.passed = true; }
      catch (error) { gatewayAction.passed = false; gatewayAction.error = String(error.message).slice(0, 350); failed++; }
    } else { gatewayAction.passed = false; failed++; }
    checks.push(gatewayAction);
    process.stdout.write(JSON.stringify(gatewayAction) + '\n');
    await page.close();
  } finally { await browser.close(); }
  const report = { base: BASE, checks, failed, passed: checks.length - failed };
  fs.writeFileSync(path.join(OUTPUT, 'qa-summary.json'), JSON.stringify(report, null, 2));
  process.stdout.write('QA_RESULT: ' + report.passed + '/' + checks.length + ' passing. Screenshots: ' + OUTPUT + '\n');
  if (failed) process.exitCode = 1;
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
