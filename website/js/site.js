// EventScope website: tabs, pricing switch, FAQs, steps, cards row,
// the menu on phones, the current section in the menu, and WhatsApp links.
// Each page sets window.ES_STATE (one value per group). Elements that change
// carry their other states in data attributes (see tools/white_site.py):
//   data-g="tab" data-i="2" data-on-style / data-off-style   (on when tab == 2)
//   data-g="cycle" data-v0-txt / data-v1-txt                  (text per value)
(function () {
  var S = window.ES_STATE || {};

  function setAttr(el, name, val) {
    if (name === 'txt') el.textContent = val;
    else if (name === 'show') el.style.display = val === '1' ? 'contents' : 'none';
    else if (name === 'disabled') el.disabled = val === '1';
    else el.setAttribute(name, val);
  }

  function apply(g) {
    var cur = String(S[g]);
    document.querySelectorAll('[data-g="' + g + '"]').forEach(function (el) {
      var prefix = el.hasAttribute('data-i') ? (el.getAttribute('data-i') === cur ? 'data-on-' : 'data-off-') : 'data-v' + cur + '-';
      Array.prototype.forEach.call(el.attributes, function (a) {
        if (a.name.indexOf(prefix) === 0) setAttr(el, a.name.slice(prefix.length), a.value);
      });
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var kind = b.getAttribute('data-act'), g = b.getAttribute('data-t');
    if (kind === 'slide') {
      var row = document.querySelector('.es-row');
      if (!row) return;
      var card = row.querySelector('.es-snap');
      var step = card ? card.getBoundingClientRect().width + 18 : 320;
      row.scrollBy({ left: Number(b.getAttribute('data-d')) * step, behavior: 'smooth' });
      return;
    }
    var i = Number(b.getAttribute('data-i'));
    if (kind === 'set') S[g] = i;
    else if (kind === 'toggle') S[g] = S[g] === i ? -1 : i;
    else if (kind === 'step') S[g] = Math.max(0, Math.min(Number(b.getAttribute('data-max')), S[g] + Number(b.getAttribute('data-d'))));
    apply(g);
  });

  // Highlight the section you are in (home page menu)
  var chaps = Array.prototype.map.call(document.querySelectorAll('[data-g="chap"]'), function (a) { return a.getAttribute('data-i'); });
  if (chaps.length) {
    var ids = ['overview', 'idea', 'features', 'daysheets', 'owners', 'build', 'coming', 'made-for', 'pricing', 'faq'];
    var map = { idea: '', overview: '', features: 'features', daysheets: 'features', owners: 'owners', build: 'owners', coming: 'owners', 'made-for': 'owners', pricing: 'pricing', faq: 'faq' };
    var onScroll = function () {
      var now = '';
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top < 90) now = map[id];
      });
      if (now !== S.chap) { S.chap = now; apply('chap'); }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Menu on phones
  var btn = document.querySelector('.es-menu-btn');
  var menu = document.getElementById('es-mnav');
  if (btn && menu) {
    var set = function (open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      menu.hidden = !open;
    };
    btn.addEventListener('click', function () { set(btn.getAttribute('aria-expanded') !== 'true'); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') set(false); });
  }

  // The WhatsApp number is filled in when the site is deployed (see deploy.yml).
  // If it was not, the links open the app instead of a broken chat.
  document.querySelectorAll('a[data-wa]').forEach(function (a) {
    if (a.getAttribute('href').indexOf('WHATSAPP_NUMBER') !== -1) {
      a.href = 'https://app.eventscope.in/';
      a.removeAttribute('data-wa');
    }
  });
})();
