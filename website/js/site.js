// Mobile menu, and the WhatsApp links.
(function () {
  var btn = document.querySelector('.menu-btn');
  var nav = document.getElementById('mnav');
  if (btn && nav) {
    var set = function (open) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      nav.hidden = !open;
    };
    btn.addEventListener('click', function () { set(btn.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) set(false); });
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
