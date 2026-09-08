(function () {
  var gallery = document.querySelector('.photo-gallery');
  var photos = Array.from(gallery.querySelectorAll('.photo-print'));
  var viewer = document.querySelector('.photo-viewer');
  if (typeof viewer.showModal !== 'function') return;
  var image = viewer.querySelector('.viewer-image');
  var count = viewer.querySelector('.viewer-count');
  var current = 0;

  function show(index) {
    current = (index + photos.length) % photos.length;
    image.src = photos[current].href;
    image.alt = photos[current].querySelector('img').alt;
    count.textContent = (current + 1) + ' / ' + photos.length;
  }

  photos.forEach(function (photo, index) {
    photo.setAttribute('aria-haspopup', 'dialog');
    photo.addEventListener('click', function (event) {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      show(index);
      viewer.showModal();
      document.body.classList.add('viewer-open');
    });
  });
  viewer.querySelector('.viewer-close').addEventListener('click', function () { viewer.close(); });
  viewer.querySelector('.viewer-prev').addEventListener('click', function () { show(current - 1); });
  viewer.querySelector('.viewer-next').addEventListener('click', function () { show(current + 1); });
  viewer.addEventListener('keydown', function (event) {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(current + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  viewer.addEventListener('click', function (event) {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener('close', function () { document.body.classList.remove('viewer-open'); });
})();
