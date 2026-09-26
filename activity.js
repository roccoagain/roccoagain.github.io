// GitHub contribution graph and recent public activity.
(function () {
  var USER = 'roccoagain';
  var PROFILE = 'https://github.com/' + USER;
  var CACHE_TTL = 10 * 60 * 1000;

  // Fetch JSON, reusing a localStorage copy for CACHE_TTL to spare the rate limit.
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

  function externalLink(href, text) {
    var a = el('a', null, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function parseDay(date) { return new Date(date + 'T00:00:00'); }

  function formatDay(date, month) {
    return date.toLocaleDateString(undefined, { month: month, day: 'numeric' });
  }

  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function timeAgo(iso) {
    var units = [[60, 's'], [60, 'm'], [24, 'h'], [7, 'd'], [4.35, 'w'], [12, 'mo'], [Infinity, 'y']];
    var n = Math.max(1, (Date.now() - new Date(iso)) / 1000);
    var i = 0;
    while (n >= units[i][0]) n /= units[i++][0];
    return Math.floor(n) + units[i][1] + ' ago';
  }

  function showError(id, message) {
    var p = document.getElementById(id);
    p.textContent = message + ' ';
    p.appendChild(externalLink(PROFILE, 'github.com/' + USER));
  }

  function renderContributions(data) {
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = data.contributions.filter(function (d) { return parseDay(d.date) <= today; });
    var graph = document.getElementById('contrib-graph');
    var wrap = graph.parentNode;
    var months = el('div', 'graph-months');
    graph.textContent = '';

    // Pad so the first column starts on Sunday.
    var offset = parseDay(days[0].date).getDay();
    for (var p = 0; p < offset; p++) graph.appendChild(el('i', 'cell pad'));

    var lastMonth = -1;
    days.forEach(function (d, i) {
      var date = parseDay(d.date);
      var cell = el('i', 'cell l' + Math.min(4, d.level));
      cell.title = d.count + (d.count === 1 ? ' contribution' : ' contributions') + ' on ' + formatDay(date, 'short');
      graph.appendChild(cell);

      // Label each month above the first column that starts in it.
      var column = Math.floor((i + offset) / 7);
      if (date.getDate() <= 7 && date.getMonth() !== lastMonth && column > 0) {
        lastMonth = date.getMonth();
        var label = el('span', null, date.toLocaleDateString(undefined, { month: 'short' }));
        label.style.gridColumnStart = column + 1;
        months.appendChild(label);
      }
    });
    wrap.insertBefore(months, graph);
    wrap.scrollLeft = wrap.scrollWidth;

    var total = 0, streak = 0, best = days[0];
    days.forEach(function (d) {
      total += d.count;
      if (d.count > best.count) best = d;
    });
    for (var i = days.length - 1; i >= 0 && days[i].count > 0; i--) streak++;

    document.getElementById('contrib-lede').textContent =
      total.toLocaleString() + ' contributions in the last year'
      + (streak > 1 ? ', ' + streak + ' days running' : '')
      + '. Busiest day was ' + formatDay(parseDay(best.date), 'long')
      + ' with ' + best.count + '.';
  }

  var VERBS = {
    PushEvent: function () { return 'Pushed to'; },
    PullRequestEvent: function (e) {
      var merged = e.payload.action === 'closed' && e.payload.pull_request && e.payload.pull_request.merged;
      return (merged ? 'Merged' : capitalize(e.payload.action)) + ' a pull request in';
    },
    IssuesEvent: function (e) { return capitalize(e.payload.action) + ' an issue in'; },
    IssueCommentEvent: function () { return 'Commented in'; },
    PullRequestReviewEvent: function () { return 'Reviewed a pull request in'; },
    CreateEvent: function (e) {
      return e.payload.ref_type === 'repository' ? 'Created' : 'Created a ' + e.payload.ref_type + ' in';
    },
    DeleteEvent: function (e) { return 'Deleted a ' + e.payload.ref_type + ' in'; },
    WatchEvent: function () { return 'Starred'; },
    ForkEvent: function () { return 'Forked'; },
    ReleaseEvent: function () { return 'Published a release in'; }
  };

  function renderActivity(events) {
    // Collapse runs of pushes to the same repo into one row.
    var rows = [];
    events.forEach(function (e) {
      if (!VERBS[e.type]) return;
      var last = rows[rows.length - 1];
      if (last && e.type === 'PushEvent' && last.type === 'PushEvent' && last.repo === e.repo.name) {
        last.pushes++;
        return;
      }
      rows.push({ type: e.type, repo: e.repo.name, at: e.created_at, pushes: 1, verb: VERBS[e.type](e) });
    });

    var list = document.getElementById('activity-list');
    list.textContent = '';
    rows.slice(0, 8).forEach(function (row) {
      var verb = row.pushes > 1 ? 'Pushed ' + row.pushes + ' times to' : row.verb;
      var name = el('span', 'row-name', verb + ' ');
      name.appendChild(externalLink('https://github.com/' + row.repo, row.repo));
      var li = el('li');
      li.appendChild(name);
      li.appendChild(el('span', 'row-leader'));
      li.appendChild(el('span', 'row-when', timeAgo(row.at)));
      list.appendChild(li);
    });

    var lede = document.getElementById('activity-lede');
    if (!events.length) {
      lede.textContent = 'No public activity recently.';
      return;
    }
    var repos = new Set(events.map(function (e) { return e.repo.name; }));
    lede.textContent = 'Last active ' + timeAgo(events[0].created_at) + ', across ' + repos.size + ' repositories.';
  }

  fetchCached('contrib', 'https://github-contributions-api.jogruber.de/v4/' + USER + '?y=last')
    .then(renderContributions)
    .catch(function () { showError('contrib-lede', "Couldn't load the graph right now. It lives at"); });

  fetchCached('events', 'https://api.github.com/users/' + USER + '/events/public?per_page=100')
    .then(renderActivity)
    .catch(function () { showError('activity-lede', "Couldn't reach GitHub right now. Activity lives at"); });
})();
