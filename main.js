(function () {
  var root = document.documentElement;
  var topbar = document.querySelector('.topbar');
  var hero = document.querySelector('.hero');
  var reveals = document.querySelectorAll('.reveal');

  // Play the hero entrance.
  root.classList.add('is-ready');

  // In-page links scroll without leaving a #section in the URL, so a reload
  // starts at the top instead of jumping back to the last section clicked.
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href^="#"]');
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    var target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    event.preventDefault();
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth' });
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus({ preventScroll: true });
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  });

  // A section hash left over from before (e.g. /#activity) is dropped on reload.
  var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  if (location.hash && nav && nav.type === 'reload') {
    history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo(0, 0);
  }

  // Local time in Boulder, ticking once a minute.
  var clock = document.getElementById('clock');
  try {
    var format = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
    var tick = function () {
      clock.textContent = format.format(new Date());
      setTimeout(tick, 60000 - Date.now() % 60000);
    };
    tick();
    clock.hidden = false;
  } catch (e) {}

  if (!('IntersectionObserver' in window)) {
    reveals.forEach(function (el) { el.classList.add('is-visible'); });
    return;
  }

  // The top bar switches to its light theme once the hero scrolls away.
  new IntersectionObserver(function (entries) {
    topbar.classList.toggle('is-light', !entries[0].isIntersecting);
  }, { rootMargin: '-56px 0px 0px 0px', threshold: 0 }).observe(hero);

  // Content sections blur in as they enter the viewport.
  var revealer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealer.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
  reveals.forEach(function (el) { revealer.observe(el); });
})();
