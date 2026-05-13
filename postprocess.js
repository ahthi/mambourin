#!/usr/bin/env node
// Post-process crawled HTML: strip Sitecore dependencies, fix carousels, inject static JS

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const DIST = path.join(__dirname, 'dist');

const HAMBURGER_JS = `
(function() {
  var btn = document.querySelector('.fpa-retail-header__burger-menu-button');
  var nav = document.querySelector('.fpa-retail-header__navigation') || document.querySelector('.fpa-retail-header__nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', function() {
    nav.classList.toggle('is-open');
    btn.classList.toggle('is-active');
  });
})();
`;

const SEARCH_FALLBACK_HTML = `
<div class="search-static-fallback" style="padding:2rem;text-align:center;font-family:inherit;">
  <p>For the best search experience, please visit the <a href="https://www.mambourinmarketplace.shopping/" target="_blank" rel="noopener">live Mambourin Marketplace site</a>.</p>
</div>
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

function processFile(filePath) {
  const html = fs.readFileSync(filePath, 'utf-8');
  const $ = cheerio.load(html, { decodeEntities: false });

  // 1. Strip Sitecore ExperienceForms scripts
  $('script[src*="/sitecore modules/Web/ExperienceForms/"]').remove();
  $('script[src*="ExperienceForms"]').remove();

  // 2. Strip Sitecore jQuery validation / AJAX scripts that need backend
  $('script[src*="jquery.validate"]').remove();
  $('script[src*="jquery.unobtrusive-ajax"]').remove();
  $('script[src*="MicrosoftAjax"]').remove();
  $('script[src*="MicrosoftMvcAjax"]').remove();

  // 3. Rewrite remaining absolute same-origin links
  $('[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.startsWith('https://www.mambourinmarketplace.shopping')) {
      $(el).attr('href', href.replace('https://www.mambourinmarketplace.shopping', ''));
    }
  });
  $('[src]').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (src.startsWith('https://www.mambourinmarketplace.shopping')) {
      $(el).attr('src', src.replace('https://www.mambourinmarketplace.shopping', ''));
    }
  });
  $('[action]').each((_, el) => {
    const action = $(el).attr('action') || '';
    if (action.startsWith('https://www.mambourinmarketplace.shopping')) {
      $(el).attr('action', action.replace('https://www.mambourinmarketplace.shopping', ''));
    }
  });

  // 4. Fix fpa-carousel frozen states
  $('.fpa-carousel__slide').each((i, el) => {
    if (i > 0) {
      $(el).css('display', 'none');
    }
    // Remove frozen inline transforms
    const style = $(el).attr('style') || '';
    const cleaned = style.replace(/transform:[^;]+;?/g, '').replace(/left:[^;]+;?/g, '').trim();
    if (cleaned) {
      $(el).attr('style', cleaned);
    } else {
      $(el).removeAttr('style');
    }
  });

  // 5. Inject hamburger menu toggle JS
  $('body').append(`<script>${HAMBURGER_JS}</script>`);

  // 6. Replace Handlebars search result templates with static fallback
  $('script[type="text/x-handlebars-template"]').each((_, el) => {
    $(el).replaceWith(SEARCH_FALLBACK_HTML);
  });
  // Also handle search result containers
  $('.search-results-container, .search-results, #search-results').each((_, el) => {
    const inner = $(el).html() || '';
    if (inner.includes('{{') || inner.trim() === '') {
      $(el).html(SEARCH_FALLBACK_HTML);
    }
  });

  // 7. Inject static-fixes.css link if not already present
  if (!$('link[href="/static-fixes.css"]').length) {
    $('head').append('<link rel="stylesheet" href="/static-fixes.css">');
  }

  // 8. Inject static-fixes.js if not already present
  if (!$('script[src="/static-fixes.js"]').length) {
    $('body').append('<script src="/static-fixes.js"></script>');
  }

  fs.writeFileSync(filePath, $.html(), 'utf-8');
}

function main() {
  if (!fs.existsSync(DIST)) {
    console.error('dist/ not found. Run crawl.js first.');
    process.exit(1);
  }
  const files = getAllHtmlFiles(DIST);
  console.log(`Post-processing ${files.length} HTML files...`);
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
