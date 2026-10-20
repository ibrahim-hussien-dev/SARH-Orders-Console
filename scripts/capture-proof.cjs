'use strict';

// Render an already-captured real execution log. This does not fabricate a
// terminal window or independently rerun the proof.
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('@playwright/test');

async function main() {
  const evidence = path.resolve(__dirname, '../docs/evidence');
  const log = await fs.readFile(path.join(evidence, 'duplicate-proof.txt'), 'utf8');
  if (!/^PASS\s*$/m.test(log)) throw new Error('A successful captured proof log is required.');
  const escape = (value) => value.replace(/[&<>"]/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
  const html = `<!doctype html><meta charset="utf-8"><title>SARH live duplicate proof</title>
<style>body{margin:48px;font:18px system-ui;color:#18212b;background:#f5f7fa}
h1{font-size:28px}p{color:#455364}pre{padding:24px;background:white;border:1px solid #ccd5df;
border-radius:8px;font:16px/1.65 Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere}</style>
<h1>SARH Orders Console · Live duplicate proof</h1>
<p>Captured output from <code>npm run prove:duplicates</code> against http://localhost:4000</p>
<pre>${escape(log)}</pre>
<p>Actual CLI output rendered for review. One server process; real login cookie; two parallel
creates followed by twenty retries. Source: duplicate-proof.txt.</p>`;
  await fs.writeFile(path.join(evidence, 'duplicate-proof.html'), html);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
    await page.setContent(html);
    await page.screenshot({ path: path.join(evidence, '04-duplicate-proof.png'), fullPage: true });
  } finally {
    await browser.close();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
