#!/usr/bin/env node
// Second Cheerio pass: QA-driven fixes — broken links, Sitecore artefacts, form replacement

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const DIST = path.join(__dirname, 'dist');

const FORMSPREE_URL = 'https://formspree.io/f/xwkgpovb'; // placeholder endpoint

const STATIC_CONTACT_FORM = `
<form class="fpa-static-form" action="${FORMSPREE_URL}" method="POST" style="max-width:600px;margin:0 auto;">
  <div class="form-group" style="margin-bottom:1rem;">
    <label for="sf-name" style="display:block;margin-bottom:.25rem;font-weight:600;">Name *</label>
    <input id="sf-name" type="text" name="name" required style="width:100%;padding:.5rem;border:1px solid #ccc;border-radius:4px;">
  </div>
  <div class="form-group" style="margin-bottom:1rem;">
    <label for="sf-email" style="display:block;margin-bottom:.25rem;font-weight:600;">Email *</label>
    <input id="sf-email" type="email" name="email" required style="width:100%;padding:.5rem;border:1px solid #ccc;border-radius:4px;">
  </div>
  <div class="form-group" style="margin-bottom:1rem;">
    <label for="sf-phone" style="display:block;margin-bottom:.25rem;font-weight:600;">Phone</label>
    <input id="sf-phone" type="tel" name="phone" style="width:100%;padding:.5rem;border:1px solid #ccc;border-radius:4px;">
  </div>
  <div class="form-group" style="margin-bottom:1rem;">
    <label for="sf-subject" style="display:block;margin-bottom:.25rem;font-weight:600;">Subject</label>
    <input id="sf-subject" type="text" name="subject" style="width:100%;padding:.5rem;border:1px solid #ccc;border-radius:4px;">
  </div>
  <div class="form-group" style="margin-bottom:1rem;">
    <label for="sf-message" style="display:block;margin-bottom:.25rem;font-weight:600;">Message *</label>
    <textarea id="sf-message" name="message" required rows="5" style="width:100%;padding:.5rem;border:1px solid #ccc;border-radius:4px;"></textarea>
  </div>
  <button type="submit" style="background:#2d6a4f;color:#fff;padding:.6rem 1.4rem;border:none;border-radius:4px;cursor:pointer;font-size:1rem;">Send Message</button>
  <input type="hidden" name="_subject" value="Mambourin Marketplace Enquiry">
</form>
`;

const STATIC_NEWSLETTER_FORM = `
<form class="fpa-static-form" action="${FORMSPREE_URL}" method="POST" style="display:flex;gap:.5rem;flex-wrap:wrap;">
  <input type="email" name="email" placeholder="Your email address" required style="flex:1;min-width:200px;padding:.5rem;border:1px solid #ccc;border-radius:4px;">
  <input type="hidden" name="_subject" value="Newsletter Signup">
  <button type="submit" style="background:#2d6a4f;color:#fff;padding:.5rem 1rem;border:none;border-radius:4px;cursor:pointer;">Subscribe</button>
</form>
`;

function getAllHtmlFiles(dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllHtmlFiles(full));
    } else if (entry.name.endsWith('.html')) {
      results.push(full);
    }
  }
  return results;
}

const NET_DEBUG_RE = /System\.\w[\w+.<>\[\]]+\+?<[\w\s,]+>[\w\s()/]+/g;
const SITECORE_LINK_RE = /~\/link\.aspx\?[^"'\s]*/g;

function processFile(filePath) {
  let html = fs.readFileSync(filePath, 'utf-8');

  // 1. Strip .NET debug strings from raw HTML before Cheerio parses
  html = html.replace(NET_DEBUG_RE, '');

  // 2. Fix Sitecore ~/link.aspx artefacts — replace with #
  html = html.replace(SITECORE_LINK_RE, '#');

  const $ = cheerio.load(html, { decodeEntities: false });

  // 3. Fix favicon path
  $('link[rel*="icon"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('/-/media/') || href.startsWith('http')) return; // already captured or external
    // Ensure root-relative
    if (!href.startsWith('/')) {
      $(el).attr('href', '/' + href);
    }
  });

  // 4. Replace Sitecore Experience Forms (contact/newsletter) with static HTML forms
  // Detect experience forms by the SF fieldset/form wrapper
  $('form[data-sc-fxb]').each((_, el) => {
    const formHtml = $.html(el);
    const isNewsletter = formHtml.toLowerCase().includes('newsletter') ||
      formHtml.toLowerCase().includes('subscribe') ||
      formHtml.toLowerCase().includes('email');
    $(el).replaceWith(isNewsletter ? STATIC_NEWSLETTER_FORM : STATIC_CONTACT_FORM);
  });

  // Also replace forms that POST to Sitecore endpoints
  $('form[action*="sitecore"], form[action*="ExperienceForms"], form[action*="/api/"]').each((_, el) => {
    const formHtml = $.html(el);
    const isNewsletter = formHtml.toLowerCase().includes('newsletter') ||
      formHtml.toLowerCase().includes('subscribe');
    $(el).replaceWith(isNewsletter ? STATIC_NEWSLETTER_FORM : STATIC_CONTACT_FORM);
  });

  // 5. Fix broken internal links pointing to .aspx or Sitecore paths
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('.aspx') || href.includes('/sitecore/')) {
      $(el).attr('href', '#');
    }
  });

  // 6. Ensure static-fixes.js is injected (idempotent with postprocess)
  if (!$('script[src="/static-fixes.js"]').length) {
    $('body').append('<script src="/static-fixes.js"></script>');
  }

  // 7. Ensure static-fixes.css is injected
  if (!$('link[href="/static-fixes.css"]').length) {
    $('head').append('<link rel="stylesheet" href="/static-fixes.css">');
  }

  fs.writeFileSync(filePath, $.html(), 'utf-8');
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error('dist/ not found. Run crawl.js first.');
    process.exit(1);
  }
  const files = getAllHtmlFiles(DIST);
  console.log(`fix2: processing ${files.length} HTML files...`);
  for (const f of files) {
    try {
      processFile(f);
      console.log(`  OK ${path.relative(DIST, f)}`);
    } catch (e) {
      console.warn(`  ERR ${path.relative(DIST, f)}: ${e.message}`);
    }
  }
  console.log('Done.');
}

main();
