(function () {
  var root = document.documentElement;
  var backdrop = document.querySelector('.backdrop-img');
  var topbar = document.querySelector('.topbar');
  var hero = document.querySelector('.hero');
  var reveals = document.querySelectorAll('.reveal');

  // Play the hero entrance once the photo is ready (or after a short timeout).
  function ready() { root.classList.add('is-ready'); }
  if (backdrop.complete && backdrop.naturalWidth > 0) {
    ready();
  } else {
    backdrop.addEventListener('load', ready, { once: true });
    backdrop.addEventListener('error', ready, { once: true });
    setTimeout(ready, 2500);
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
