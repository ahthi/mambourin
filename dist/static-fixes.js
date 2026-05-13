// Static site fixes for Mambourin Marketplace
(function () {
  'use strict';

  // ── Carousel nav ──────────────────────────────────────────────────────────
  function initCarousels() {
    document.querySelectorAll('.fpa-carousel').forEach(function (carousel) {
      var slides = carousel.querySelectorAll('.fpa-carousel__slide');
      if (slides.length < 2) return;

      var current = 0;

      function show(idx) {
        slides.forEach(function (s, i) {
          s.style.display = i === idx ? '' : 'none';
          s.style.transform = '';
          s.style.left = '';
        });
        current = idx;
      }

      // Ensure first slide visible
      show(0);

      function prev() { show((current - 1 + slides.length) % slides.length); }
      function next() { show((current + 1) % slides.length); }

      // Bind existing buttons or create them
      var prevBtn = carousel.querySelector('.fpa-carousel__prev, [data-carousel-prev], .slick-prev');
      var nextBtn = carousel.querySelector('.fpa-carousel__next, [data-carousel-next], .slick-next');

      if (!prevBtn) {
        prevBtn = document.createElement('button');
        prevBtn.className = 'fpa-carousel__prev fpa-static-carousel-btn';
        prevBtn.textContent = '‹';
        carousel.appendChild(prevBtn);
      }
      if (!nextBtn) {
        nextBtn = document.createElement('button');
        nextBtn.className = 'fpa-carousel__next fpa-static-carousel-btn';
        nextBtn.textContent = '›';
        carousel.appendChild(nextBtn);
      }

      prevBtn.addEventListener('click', prev);
      nextBtn.addEventListener('click', next);

      // Keyboard
      carousel.setAttribute('tabindex', '0');
      carousel.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowLeft') prev();
        if (e.key === 'ArrowRight') next();
      });
    });
  }

  // ── Store category filter ─────────────────────────────────────────────────
  function initStoreFilter() {
    var filterBtns = document.querySelectorAll('[data-store-category], .fpa-store-filter__btn, .store-category-btn');
    if (!filterBtns.length) return;

    var storeCards = document.querySelectorAll('.fpa-store-card, .store-card, [data-store]');

    filterBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filterBtns.forEach(function (b) { b.classList.remove('is-active', 'active'); });
        btn.classList.add('is-active', 'active');

        var cat = btn.dataset.storeCategory || btn.dataset.category || btn.getAttribute('data-filter') || 'all';

        storeCards.forEach(function (card) {
          if (cat === 'all' || cat === '') {
            card.style.display = '';
          } else {
            var cardCat = card.dataset.category || card.dataset.storeCategory || '';
            card.style.display = cardCat.toLowerCase() === cat.toLowerCase() ? '' : 'none';
          }
        });
      });
    });
  }

  // ── Mega menu toggle ──────────────────────────────────────────────────────
  function initMegaMenu() {
    document.querySelectorAll('.fpa-retail-header__nav-item--has-children, .has-children, .has-dropdown').forEach(function (item) {
      var trigger = item.querySelector('a, button');
      var dropdown = item.querySelector('.fpa-retail-header__dropdown, .dropdown, .sub-nav');
      if (!trigger || !dropdown) return;
      trigger.addEventListener('click', function (e) {
        var isOpen = item.classList.contains('is-open');
        // Close all
        document.querySelectorAll('.fpa-retail-header__nav-item--has-children.is-open, .has-children.is-open, .has-dropdown.is-open').forEach(function (el) {
          el.classList.remove('is-open');
        });
        if (!isOpen) {
          item.classList.add('is-open');
          e.preventDefault();
        }
      });
    });

    // Close on outside click
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.fpa-retail-header__nav-item--has-children, .has-children, .has-dropdown')) {
        document.querySelectorAll('.is-open').forEach(function (el) {
          el.classList.remove('is-open');
        });
      }
    });
  }

  // ── Hamburger menu ────────────────────────────────────────────────────────
  function initHamburger() {
    var btn = document.querySelector('.fpa-retail-header__burger-menu-button, .hamburger, .mobile-menu-btn');
    var nav = document.querySelector('.fpa-retail-header__navigation, .fpa-retail-header__nav, .mobile-nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', function () {
      nav.classList.toggle('is-open');
      btn.classList.toggle('is-active');
    });
  }

  // ── Contact form fallback ─────────────────────────────────────────────────
  function initFormFeedback() {
    document.querySelectorAll('.fpa-static-form').forEach(function (form) {
      form.addEventListener('submit', function () {
        // Formspree will redirect; show a brief message before redirect
        var msg = document.createElement('p');
        msg.textContent = 'Sending your message...';
        msg.style.cssText = 'color:#2d6a4f;font-weight:600;margin-top:.5rem;';
        form.appendChild(msg);
      });
    });
  }

  // ── Search fallback ───────────────────────────────────────────────────────
  function initSearchFallback() {
    var searchForm = document.querySelector('form[action*="search"], form.search-form, .fpa-search form');
    if (!searchForm) return;
    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = (searchForm.querySelector('input[type="search"], input[name="q"], input[name="query"]') || {}).value || '';
      window.open('https://www.mambourinmarketplace.shopping/search?q=' + encodeURIComponent(q), '_blank');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initCarousels();
    initStoreFilter();
    initMegaMenu();
    initHamburger();
    initFormFeedback();
    initSearchFallback();
  });

  // Also run now in case DOM is already ready
  if (document.readyState !== 'loading') {
    initCarousels();
    initStoreFilter();
    initMegaMenu();
    initHamburger();
    initFormFeedback();
    initSearchFallback();
  }
})();
