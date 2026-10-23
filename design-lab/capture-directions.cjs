const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const root = path.join(__dirname, 'directions.html');
const out = 'C:/Users/alexl/Desktop/summoner-award-v4-evidence/concepts';
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  for (const concept of ['a','b','c']) {
    const page = await browser.newPage({viewport:{width:1440,height:920},deviceScaleFactor:1});
    await page.goto('file:///'+root.replace(/\\/g,'/')+'?concept='+concept,{waitUntil:'load'});
    await page.screenshot({path:path.join(out,'concept-'+concept+'.png')});
    console.log('CAPTURED',concept,await page.locator('.concept.active h1').innerText());
    await page.close();
  }
  await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1});
