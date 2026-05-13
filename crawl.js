#!/usr/bin/env node
// Playwright crawler for mambourinmarketplace.shopping
// Saves server-rendered HTML + assets to dist/

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const url = require('url');

const BASE_URL = 'https://www.mambourinmarketplace.shopping';
const DIST = path.join(__dirname, 'dist');
const MAX_PAGES = 200;

const visited = new Set();
const queue = ['/'];
const assetQueue = new Set();

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function urlToLocalPath(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl, BASE_URL);
  } catch {
    return null;
  }
  if (parsed.hostname && parsed.hostname !== 'www.mambourinmarketplace.shopping') {
    return null; // external
  }
  let p = parsed.pathname;
  // Strip trailing slash for index files
  if (p === '/') {
    return path.join(DIST, 'index.html');
  }
  if (p.endsWith('/')) {
    p = p.slice(0, -1);
  }
  // Determine extension
  const ext = path.extname(p);
  if (!ext) {
    return path.join(DIST, p, 'index.html');
  }
  return path.join(DIST, p);
}

function rewriteUrl(rawUrl) {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl, BASE_URL);
    if (parsed.hostname === 'www.mambourinmarketplace.shopping') {
      return parsed.pathname + (parsed.search || '');
    }
  } catch {}
  return rawUrl;
}

function downloadFile(fileUrl, localPath) {
  return new Promise((resolve) => {
    ensureDir(localPath);
    if (fs.existsSync(localPath)) {
      return resolve();
    }
    const client = fileUrl.startsWith('https') ? https : http;
    const req = client.get(fileUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      },
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirect = new URL(res.headers.location, fileUrl).href;
        return downloadFile(redirect, localPath).then(resolve);
      }
      if (res.statusCode !== 200) {
        console.warn(`  SKIP ${fileUrl} (${res.statusCode})`);
        return resolve();
      }
      const out = fs.createWriteStream(localPath);
      res.pipe(out);
      out.on('finish', resolve);
      out.on('error', (e) => { console.warn(`  WRITE ERR ${localPath}: ${e.message}`); resolve(); });
    });
    req.on('error', (e) => { console.warn(`  DL ERR ${fileUrl}: ${e.message}`); resolve(); });
    req.setTimeout(15000, () => { req.destroy(); resolve(); });
  });
}

function isCaptureAsset(urlStr) {
  // Assets to capture locally
  return (
    urlStr.includes('/-/media/') ||
    urlStr.includes('/~/media/') ||
    urlStr.includes('/assets/corporate/') ||
    urlStr.includes('/bundles/') ||
    urlStr.includes('/FontCssFiles/')
  );
}

function isInternalPage(urlStr) {
  try {
    const parsed = new URL(urlStr, BASE_URL);
    return parsed.hostname === 'www.mambourinmarketplace.shopping' &&
      !parsed.pathname.match(/\.(css|js|jpg|jpeg|png|gif|svg|woff|woff2|ttf|eot|ico|pdf|xml|json|mp4|webp)$/i);
  } catch {
    return false;
  }
}

function extractLinks(html, baseUrl) {
  const links = [];
  // href and src
  const re = /(?:href|src|action)=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1];
    if (raw.startsWith('#') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue;
    try {
      const abs = new URL(raw, baseUrl).href;
      links.push(abs);
    } catch {}
  }
  return links;
}

function rewriteHtmlUrls(html) {
  // Rewrite absolute same-origin URLs to root-relative
  return html.replace(
    /https?:\/\/www\.mambourinmarketplace\.shopping(\/[^"'\s>]*)/g,
    (match, p1) => p1
  );
}

async function run() {
  fs.mkdirSync(DIST, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: true,
    extraHTTPHeaders: {
      'Accept-Language': 'en-AU,en;q=0.9',
    },
  });

  // Intercept responses to capture assets
  context.on('response', async (response) => {
    const reqUrl = response.url();
    if (!isCaptureAsset(reqUrl)) return;
    const localPath = urlToLocalPath(reqUrl);
    if (!localPath || fs.existsSync(localPath)) return;
    try {
      const buf = await response.body();
      ensureDir(localPath);
      fs.writeFileSync(localPath, buf);
      console.log(`  ASSET ${reqUrl.replace(BASE_URL, '')}`);
    } catch {}
  });

  let pageCount = 0;

  while (queue.length > 0 && pageCount < MAX_PAGES) {
    const pagePath = queue.shift();
    const pageUrl = pagePath.startsWith('http') ? pagePath : BASE_URL + pagePath;

    // Normalise — strip query/hash for dedup
    let normPath;
    try {
      const p = new URL(pageUrl);
      normPath = p.pathname;
    } catch {
      continue;
    }

    if (visited.has(normPath)) continue;
    visited.add(normPath);
    pageCount++;

    const localPath = urlToLocalPath(normPath);
    if (!localPath) continue;

    console.log(`[${pageCount}] ${normPath}`);

    const page = await context.newPage();
    try {
      await page.goto(pageUrl, { waitUntil: 'networkidle', timeout: 60000 });

      // Scroll to bottom to trigger lazy loading
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          let total = 0;
          const step = 500;
          const timer = setInterval(() => {
            window.scrollBy(0, step);
            total += step;
            if (total >= document.body.scrollHeight) {
              clearInterval(timer);
              resolve();
            }
          }, 100);
        });
      });

      // Wait a moment for lazy content
      await page.waitForTimeout(1500);

      let html = await page.content();
      html = rewriteHtmlUrls(html);

      ensureDir(localPath);
      fs.writeFileSync(localPath, html, 'utf-8');

      // Extract links for further crawling
      const links = extractLinks(html, pageUrl);
      for (const link of links) {
        let linkPath;
        try {
          linkPath = new URL(link).pathname;
        } catch {
          continue;
        }
        if (isInternalPage(link) && !visited.has(linkPath)) {
          if (!queue.includes(linkPath)) {
            queue.push(linkPath);
          }
        } else if (isCaptureAsset(link)) {
          assetQueue.add(link);
        }
      }
    } catch (e) {
      console.warn(`  ERR ${normPath}: ${e.message}`);
    } finally {
      await page.close();
    }
  }

  await browser.close();

  // Download any missed assets
  console.log(`\nDownloading ${assetQueue.size} additional assets...`);
  for (const assetUrl of assetQueue) {
    const localPath = urlToLocalPath(assetUrl);
    if (localPath) {
      await downloadFile(assetUrl, localPath);
    }
  }

  console.log(`\nDone. Crawled ${pageCount} pages. Output: ${DIST}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
