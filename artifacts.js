// Artifacts: every top-level folder in this repo with an index.html is listed
// automatically. Title and blurb come from the page's own <title> and
// <meta name="description">. Add <meta name="artifact" content="hidden"> to a
// page to keep it off the list.
(function () {
  var REPO = 'roccoagain/roccoagain.github.io';
  var CACHE_TTL = 10 * 60 * 1000;
  var SKIP = /^(\.|_|images$|node_modules$)/;

  // Same localStorage cache as activity.js, to spare the GitHub rate limit.
  function fetchCached(key, url) {
    key = 'gh:' + key;
    try {
      var hit = JSON.parse(localStorage.getItem(key));
      if (hit && Date.now() - hit.t < CACHE_TTL) return Promise.resolve(hit.v);
    } catch (e) {}
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error(res.status);
      return res.json();
    }).then(function (value) {
      try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); } catch (e) {}
      return value;
    });
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // Folders that hold an index.html, from one recursive tree call.
  function findFolders(tree) {
    return tree.tree
      .map(function (node) { return /^([^/]+)\/index\.html$/.exec(node.path); })
      .filter(function (m) { return m && !SKIP.test(m[1]); })
      .map(function (m) { return m[1]; });
  }

  // Read a page's own title and description; null if it opted out or is gone.
  function describe(folder) {
    var href = folder + '/';
    return fetch(href).then(function (res) {
      if (!res.ok) return null;
      return res.text().then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var meta = function (name) {
          var tag = doc.querySelector('meta[name="' + name + '"]');
          return tag ? tag.getAttribute('content').trim() : '';
        };
        if (meta('artifact') === 'hidden') return null;
        return {
          href: href,
          title: (doc.title || folder).trim(),
          blurb: meta('description')
        };
      });
    }).catch(function () { return null; });
  }

  function render(items) {
    var list = document.getElementById('artifact-list');
    list.textContent = '';
    items.forEach(function (item) {
      var link = el('a', null, item.title);
      link.href = item.href;
      var name = el('span', 'row-name');
      name.appendChild(link);
      var li = el('li');
      li.appendChild(name);
      li.appendChild(el('span', 'row-leader'));
      li.appendChild(el('span', 'row-when', '/' + item.href.replace(/\/$/, '')));
      if (item.blurb) {
        li.className = 'has-blurb';
        li.appendChild(el('span', 'row-blurb', item.blurb));
      }
      list.appendChild(li);
    });
  }

  fetchCached('tree', 'https://api.github.com/repos/' + REPO + '/git/trees/HEAD?recursive=1')
    .then(function (tree) { return Promise.all(findFolders(tree).map(describe)); })
    .then(function (items) {
      items = items.filter(Boolean).sort(function (a, b) { return a.title.localeCompare(b.title); });
      if (items.length) render(items);
    })
    .catch(function () {}); // keep the hand-written list from the HTML
})();
