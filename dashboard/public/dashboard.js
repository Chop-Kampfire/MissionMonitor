(function () {
  'use strict';

  var REFRESH_INTERVAL = 60000;
  var currentView = 'missions';
  var currentPartnerId = null;

  // Raw data caches for client-side filtering
  var rawMissions = [];
  var rawLeaderboard = [];
  var rawPartners = [];

  // Filter state
  var searchQuery = '';
  var statusFilter = 'all';
  var sortKey = 'engagement-desc';

  // ============================================================================
  // Helpers
  // ============================================================================

  function fmt(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
    return n.toString();
  }

  function pct(n) {
    return (n * 100).toFixed(2) + '%';
  }

  function scoreClass(score) {
    if (score >= 70) return 'score-high';
    if (score >= 40) return 'score-mid';
    return 'score-low';
  }

  function statusClass(status) {
    return 'status-' + status;
  }

  function tweetUrl(tweetId, username) {
    return 'https://x.com/' + (username || 'i') + '/status/' + tweetId;
  }

  function timeAgo(iso) {
    if (!iso) return 'never';
    var diff = Date.now() - new Date(iso).getTime();
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return sec + 's ago';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    if (hr < 24) return hr + 'h ago';
    var d = Math.floor(hr / 24);
    return d + 'd ago';
  }

  function matchesSearch(text) {
    if (!searchQuery) return true;
    return text.toLowerCase().indexOf(searchQuery.toLowerCase()) !== -1;
  }

  // ============================================================================
  // Filter Bar Logic
  // ============================================================================

  var searchInput = document.getElementById('search-input');
  var searchClear = document.getElementById('search-clear');
  var filterPills = document.getElementById('filter-pills');
  var sortControl = document.getElementById('sort-control');
  var sortSelect = document.getElementById('sort-select');
  var resultCount = document.getElementById('result-count');

  searchInput.addEventListener('input', function () {
    searchQuery = searchInput.value.trim();
    searchClear.classList.toggle('hidden', !searchQuery);
    applyFilters();
  });

  searchClear.addEventListener('click', function () {
    searchInput.value = '';
    searchQuery = '';
    searchClear.classList.add('hidden');
    applyFilters();
  });

  document.querySelectorAll('.pill').forEach(function (pill) {
    pill.addEventListener('click', function () {
      document.querySelectorAll('.pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      statusFilter = pill.dataset.status;
      applyFilters();
    });
  });

  sortSelect.addEventListener('change', function () {
    sortKey = sortSelect.value;
    applyFilters();
  });

  function updateFilterBar() {
    // Show/hide filter controls based on view
    filterPills.classList.toggle('hidden', currentView !== 'missions');
    sortControl.classList.toggle('hidden', currentView !== 'leaderboard');

    // Update placeholder
    if (currentView === 'missions') searchInput.placeholder = 'Search missions...';
    else if (currentView === 'leaderboard') searchInput.placeholder = 'Search by author or mission...';
    else if (currentView === 'partners') searchInput.placeholder = 'Search partners...';
    else searchInput.placeholder = 'Search...';

    // Hide filter bar on detail views
    var bar = document.getElementById('filter-bar');
    var isDetail = currentView === 'detail' || currentView === 'partner-detail';
    bar.classList.toggle('hidden', isDetail);
  }

  function applyFilters() {
    if (currentView === 'missions') renderFilteredMissions();
    else if (currentView === 'leaderboard') renderFilteredLeaderboard();
    else if (currentView === 'partners') renderFilteredPartners();
  }

  function setResultCount(shown, total) {
    if (!searchQuery && statusFilter === 'all') {
      resultCount.textContent = total + ' total';
    } else if (shown === total) {
      resultCount.textContent = total + ' total';
    } else {
      resultCount.textContent = shown + ' of ' + total;
    }
  }

  // ============================================================================
  // Navigation
  // ============================================================================

  var allViews = ['missions-view', 'leaderboard-view', 'detail-view', 'partners-view', 'partner-detail-view'];

  function showView(view) {
    currentView = view;
    allViews.forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('hidden');
    });
    var target = document.getElementById(view + '-view');
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    updateFilterBar();
  }

  document.querySelectorAll('.nav-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      showView(btn.dataset.view);
      if (btn.dataset.view === 'missions') loadMissions();
      if (btn.dataset.view === 'leaderboard') loadLeaderboard();
      if (btn.dataset.view === 'partners') loadPartners();
    });
  });

  document.getElementById('back-btn').addEventListener('click', function () {
    showView('missions');
    loadMissions();
  });

  // ============================================================================
  // Missions View
  // ============================================================================

  function renderMissionCard(m) {
    var card = document.createElement('div');
    card.className = 'mission-card';
    card.addEventListener('click', function () { loadMissionDetail(m.missionId); });

    var header = document.createElement('div');
    header.className = 'card-header';

    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = m.title;

    var badge = document.createElement('div');
    badge.className = 'score-badge ' + scoreClass(m.successScore);
    badge.textContent = m.successScore;

    header.appendChild(title);
    header.appendChild(badge);

    var stats = document.createElement('div');
    stats.className = 'card-stats';
    stats.innerHTML =
      '<div class="stat"><div class="stat-value">' + fmt(m.totalImpressions) + '</div><div class="stat-label">Impressions</div></div>' +
      '<div class="stat"><div class="stat-value">' + pct(m.avgEngagementRate) + '</div><div class="stat-label">Eng. Rate</div></div>' +
      '<div class="stat"><div class="stat-value">' + m.submissionCount + '</div><div class="stat-label">Tweets</div></div>';

    var meta = document.createElement('div');
    meta.className = 'card-meta';
    var statusTag = '<span class="status-tag ' + statusClass(m.status) + '">' + m.status + '</span>';
    var deadline = new Date(m.deadline).toLocaleDateString();
    meta.innerHTML = statusTag + '<span>' + deadline + '</span>';

    card.appendChild(header);
    card.appendChild(stats);
    card.appendChild(meta);
    return card;
  }

  function renderFilteredMissions() {
    var grid = document.getElementById('missions-grid');
    grid.innerHTML = '';

    var filtered = rawMissions.filter(function (m) {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (searchQuery) {
        var haystack = (m.title || '') + ' ' + (m.missionId || '');
        if (!matchesSearch(haystack)) return false;
      }
      return true;
    });

    setResultCount(filtered.length, rawMissions.length);

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state"><h3>No Matches</h3><p>' +
        (rawMissions.length === 0 ? 'No missions found. Run some content missions first.' : 'No missions match your filters.') +
        '</p></div>';
      return;
    }

    filtered.forEach(function (m) {
      grid.appendChild(renderMissionCard(m));
    });
  }

  function loadMissions() {
    fetch('/api/missions?t=' + Date.now())
      .then(function (res) { return res.json(); })
      .then(function (missions) {
        rawMissions = missions;
        renderFilteredMissions();
      })
      .catch(function (err) {
        console.error('[Dashboard] Failed to load missions:', err);
      });
  }

  // ============================================================================
  // Mission Detail View
  // ============================================================================

  function loadMissionDetail(missionId) {
    fetch('/api/missions/' + missionId + '?t=' + Date.now())
      .then(function (res) { return res.json(); })
      .then(function (data) {
        showView('detail');

        document.getElementById('detail-title').textContent = data.mission.title;

        var totalImpressions = data.tweets.reduce(function (s, t) { return s + t.impressions; }, 0);
        var totalEng = data.tweets.reduce(function (s, t) { return s + t.totalEngagement; }, 0);
        var avgRate = data.tweets.length > 0
          ? data.tweets.reduce(function (s, t) { return s + t.engagementRate; }, 0) / data.tweets.length
          : 0;

        var statsEl = document.getElementById('detail-stats');
        statsEl.innerHTML =
          '<div class="stat"><div class="stat-value">' + fmt(totalImpressions) + '</div><div class="stat-label">Total Impressions</div></div>' +
          '<div class="stat"><div class="stat-value">' + fmt(totalEng) + '</div><div class="stat-label">Total Engagement</div></div>' +
          '<div class="stat"><div class="stat-value">' + pct(avgRate) + '</div><div class="stat-label">Avg Eng. Rate</div></div>' +
          '<div class="stat"><div class="stat-value">' + data.tweets.length + '</div><div class="stat-label">Tracked Tweets</div></div>';

        var tbody = document.querySelector('#detail-table tbody');
        tbody.innerHTML = '';

        data.tweets.forEach(function (t, i) {
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + (i + 1) + '</td>' +
            '<td>@' + t.authorUsername + '</td>' +
            '<td class="num">' + fmt(t.authorFollowerCount) + '</td>' +
            '<td class="num">' + fmt(t.impressions) + '</td>' +
            '<td class="num">' + fmt(t.likes) + '</td>' +
            '<td class="num">' + fmt(t.retweets) + '</td>' +
            '<td class="num">' + fmt(t.replies) + '</td>' +
            '<td class="num">' + fmt(t.quotes) + '</td>' +
            '<td class="num">' + fmt(t.bookmarks) + '</td>' +
            '<td class="num">' + pct(t.engagementRate) + '</td>' +
            '<td><a href="' + tweetUrl(t.tweetId, t.authorUsername) + '" target="_blank">View</a></td>';
          tbody.appendChild(tr);
        });

        if (data.tweets.length === 0) {
          var tr = document.createElement('tr');
          tr.innerHTML = '<td colspan="11" style="text-align:center;color:#8b949e;padding:2rem">No tweet metrics tracked yet. Click Refresh to poll Twitter API.</td>';
          tbody.appendChild(tr);
        }
      })
      .catch(function (err) {
        console.error('[Dashboard] Failed to load mission detail:', err);
      });
  }

  // ============================================================================
  // Leaderboard View
  // ============================================================================

  function sortLeaderboard(entries) {
    var parts = sortKey.split('-');
    var field = parts[0];
    var dir = parts[1] === 'asc' ? 1 : -1;

    var keyMap = {
      engagement: 'totalEngagement',
      impressions: 'impressions',
      rate: 'engagementRate',
      likes: 'likes',
      retweets: 'retweets'
    };
    var key = keyMap[field] || 'totalEngagement';

    return entries.slice().sort(function (a, b) {
      return (b[key] - a[key]) * dir;
    });
  }

  function renderFilteredLeaderboard() {
    var tbody = document.querySelector('#leaderboard-table tbody');
    tbody.innerHTML = '';

    var filtered = rawLeaderboard.filter(function (e) {
      if (!searchQuery) return true;
      var haystack = '@' + e.authorUsername + ' ' + e.missionTitle;
      return matchesSearch(haystack);
    });

    var sorted = sortLeaderboard(filtered);
    setResultCount(sorted.length, rawLeaderboard.length);

    if (sorted.length === 0) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td colspan="10" style="text-align:center;color:#8b949e;padding:2rem">' +
        (rawLeaderboard.length === 0 ? 'No engagement data yet. Click Refresh to poll Twitter API.' : 'No results match your search.') +
        '</td>';
      tbody.appendChild(tr);
      return;
    }

    sorted.forEach(function (e, i) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + (i + 1) + '</td>' +
        '<td>@' + e.authorUsername + '</td>' +
        '<td>' + e.missionTitle + '</td>' +
        '<td class="num">' + fmt(e.impressions) + '</td>' +
        '<td class="num">' + fmt(e.likes) + '</td>' +
        '<td class="num">' + fmt(e.retweets) + '</td>' +
        '<td class="num">' + fmt(e.replies) + '</td>' +
        '<td class="num">' + fmt(e.totalEngagement) + '</td>' +
        '<td class="num">' + pct(e.engagementRate) + '</td>' +
        '<td><a href="' + tweetUrl(e.tweetId, e.authorUsername) + '" target="_blank">View</a></td>';
      tbody.appendChild(tr);
    });
  }

  function loadLeaderboard() {
    fetch('/api/leaderboard?limit=100&t=' + Date.now())
      .then(function (res) { return res.json(); })
      .then(function (entries) {
        rawLeaderboard = entries;
        renderFilteredLeaderboard();
      })
      .catch(function (err) {
        console.error('[Dashboard] Failed to load leaderboard:', err);
      });
  }

  // ============================================================================
  // Partners View
  // ============================================================================

  function renderPartnerCard(p) {
    var card = document.createElement('div');
    card.className = 'partner-card';
    card.addEventListener('click', function () { loadPartnerDetail(p.id); });

    var header = document.createElement('div');
    header.className = 'card-header';

    var titleWrap = document.createElement('div');
    var title = document.createElement('div');
    title.className = 'card-title';
    title.textContent = p.name;
    titleWrap.appendChild(title);

    if (p.handle) {
      var handle = document.createElement('div');
      handle.className = 'card-handle';
      handle.textContent = '@' + p.handle;
      titleWrap.appendChild(handle);
    }

    var clipBadge = document.createElement('div');
    clipBadge.className = 'score-badge ' + (p.clipCount > 0 ? 'score-high' : 'score-low');
    clipBadge.textContent = p.clipCount + ' clips';

    header.appendChild(titleWrap);
    header.appendChild(clipBadge);

    var stats = document.createElement('div');
    stats.className = 'card-stats';
    stats.innerHTML =
      '<div class="stat"><div class="stat-value">' + fmt(p.totalViews) + '</div><div class="stat-label">Total Views</div></div>' +
      '<div class="stat"><div class="stat-value">' + fmt(p.avgViews) + '</div><div class="stat-label">Avg Views</div></div>' +
      '<div class="stat"><div class="stat-value">' + p.uniqueClippers + '</div><div class="stat-label">Distributors</div></div>';

    card.appendChild(header);
    card.appendChild(stats);
    return card;
  }

  function renderFilteredPartners() {
    var grid = document.getElementById('partners-grid');
    grid.innerHTML = '';

    var filtered = rawPartners.filter(function (p) {
      if (!searchQuery) return true;
      var haystack = p.name + ' ' + (p.handle || '');
      return matchesSearch(haystack);
    });

    setResultCount(filtered.length, rawPartners.length);

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state"><h3>' +
        (rawPartners.length === 0 ? 'No Partners' : 'No Matches') +
        '</h3><p>' +
        (rawPartners.length === 0 ? 'Add a partner to start tracking clip performance.' : 'No partners match your search.') +
        '</p></div>';
      return;
    }

    filtered.forEach(function (p) {
      grid.appendChild(renderPartnerCard(p));
    });
  }

  function loadPartners() {
    fetch('/api/partners?t=' + Date.now())
      .then(function (res) { return res.json(); })
      .then(function (partners) {
        rawPartners = partners;
        renderFilteredPartners();
      })
      .catch(function (err) {
        console.error('[Dashboard] Failed to load partners:', err);
      });
  }

  // Add partner form
  var addPartnerBtn = document.getElementById('add-partner-btn');
  var addPartnerForm = document.getElementById('add-partner-form');
  var cancelPartnerBtn = document.getElementById('cancel-partner-btn');
  var savePartnerBtn = document.getElementById('save-partner-btn');

  addPartnerBtn.addEventListener('click', function () {
    addPartnerForm.classList.remove('hidden');
    document.getElementById('partner-name').focus();
  });

  cancelPartnerBtn.addEventListener('click', function () {
    addPartnerForm.classList.add('hidden');
    document.getElementById('partner-name').value = '';
    document.getElementById('partner-handle').value = '';
  });

  savePartnerBtn.addEventListener('click', function () {
    var name = document.getElementById('partner-name').value.trim();
    var handle = document.getElementById('partner-handle').value.trim().replace(/^@/, '');
    if (!name) return;

    savePartnerBtn.disabled = true;
    fetch('/api/partners', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, handle: handle || undefined })
    })
      .then(function (res) { return res.json(); })
      .then(function () {
        addPartnerForm.classList.add('hidden');
        document.getElementById('partner-name').value = '';
        document.getElementById('partner-handle').value = '';
        savePartnerBtn.disabled = false;
        loadPartners();
      })
      .catch(function () { savePartnerBtn.disabled = false; });
  });

  // ============================================================================
  // Partner Detail View
  // ============================================================================

  document.getElementById('partner-back-btn').addEventListener('click', function () {
    showView('partners');
    loadPartners();
  });

  function loadPartnerDetail(partnerId) {
    currentPartnerId = partnerId;
    fetch('/api/partners/' + partnerId + '?t=' + Date.now())
      .then(function (res) { return res.json(); })
      .then(function (data) {
        showView('partner-detail');

        var titleEl = document.getElementById('partner-detail-title');
        titleEl.textContent = data.partner.name + (data.partner.handle ? ' (@' + data.partner.handle + ')' : '');

        var statsEl = document.getElementById('partner-detail-stats');
        statsEl.innerHTML =
          '<div class="stat"><div class="stat-value">' + fmt(data.stats.totalViews) + '</div><div class="stat-label">Total Views</div></div>' +
          '<div class="stat"><div class="stat-value">' + fmt(data.stats.avgViews) + '</div><div class="stat-label">Avg Views/Clip</div></div>' +
          '<div class="stat"><div class="stat-value">' + fmt(data.stats.totalEngagement) + '</div><div class="stat-label">Total Engagement</div></div>' +
          '<div class="stat"><div class="stat-value">' + pct(data.stats.avgEngagementRate) + '</div><div class="stat-label">Avg Eng. Rate</div></div>' +
          '<div class="stat"><div class="stat-value">' + data.stats.clipCount + '</div><div class="stat-label">Clips</div></div>' +
          '<div class="stat"><div class="stat-value">' + data.stats.uniqueClippers + '</div><div class="stat-label">Distributors</div></div>';

        var tbody = document.querySelector('#partner-clips-table tbody');
        tbody.innerHTML = '';

        if (data.clips.length === 0) {
          var tr = document.createElement('tr');
          tr.innerHTML = '<td colspan="13" style="text-align:center;color:#8b949e;padding:2rem">No clips yet. Add tweet URLs to track clip performance.</td>';
          tbody.appendChild(tr);
          return;
        }

        data.clips.forEach(function (c, i) {
          var tr = document.createElement('tr');
          tr.innerHTML =
            '<td>' + (i + 1) + '</td>' +
            '<td>@' + c.postedBy + '</td>' +
            '<td class="num">' + fmt(c.authorFollowerCount) + '</td>' +
            '<td class="num">' + fmt(c.impressions) + '</td>' +
            '<td class="num">' + fmt(c.likes) + '</td>' +
            '<td class="num">' + fmt(c.retweets) + '</td>' +
            '<td class="num">' + fmt(c.replies) + '</td>' +
            '<td class="num">' + fmt(c.quotes) + '</td>' +
            '<td class="num">' + fmt(c.bookmarks) + '</td>' +
            '<td class="num">' + pct(c.engagementRate) + '</td>' +
            '<td>' + (c.note || '') + '</td>' +
            '<td><a href="' + tweetUrl(c.tweetId, c.postedBy) + '" target="_blank">View</a></td>' +
            '<td><button class="btn-delete" data-clip-id="' + c.id + '">x</button></td>';
          tbody.appendChild(tr);
        });

        // Attach delete handlers
        tbody.querySelectorAll('.btn-delete').forEach(function (btn) {
          btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var clipId = btn.dataset.clipId;
            if (!confirm('Remove this clip?')) return;
            fetch('/api/partners/' + partnerId + '/clips/' + clipId, { method: 'DELETE' })
              .then(function () { loadPartnerDetail(partnerId); });
          });
        });
      })
      .catch(function (err) {
        console.error('[Dashboard] Failed to load partner detail:', err);
      });
  }

  // Delete partner button
  document.getElementById('delete-partner-btn').addEventListener('click', function () {
    if (!currentPartnerId) return;
    if (!confirm('Remove this partner and all their clips?')) return;
    fetch('/api/partners/' + currentPartnerId, { method: 'DELETE' })
      .then(function () {
        showView('partners');
        loadPartners();
      });
  });

  // Add clip form
  var addClipBtn = document.getElementById('add-clip-btn');
  var addClipForm = document.getElementById('add-clip-form');
  var cancelClipBtn = document.getElementById('cancel-clip-btn');
  var saveClipBtn = document.getElementById('save-clip-btn');

  addClipBtn.addEventListener('click', function () {
    addClipForm.classList.remove('hidden');
    document.getElementById('clip-url').focus();
  });

  cancelClipBtn.addEventListener('click', function () {
    addClipForm.classList.add('hidden');
    document.getElementById('clip-url').value = '';
    document.getElementById('clip-note').value = '';
  });

  saveClipBtn.addEventListener('click', function () {
    var url = document.getElementById('clip-url').value.trim();
    var note = document.getElementById('clip-note').value.trim();
    if (!url || !currentPartnerId) return;

    saveClipBtn.disabled = true;
    saveClipBtn.textContent = 'Adding...';
    fetch('/api/partners/' + currentPartnerId + '/clips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url, note: note || undefined })
    })
      .then(function (res) { return res.json(); })
      .then(function () {
        addClipForm.classList.add('hidden');
        document.getElementById('clip-url').value = '';
        document.getElementById('clip-note').value = '';
        saveClipBtn.disabled = false;
        saveClipBtn.textContent = 'Add';
        loadPartnerDetail(currentPartnerId);
      })
      .catch(function () {
        saveClipBtn.disabled = false;
        saveClipBtn.textContent = 'Add';
      });
  });

  // ============================================================================
  // Refresh Button
  // ============================================================================

  var refreshBtn = document.getElementById('refresh-btn');
  refreshBtn.addEventListener('click', function () {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Refreshing...';

    fetch('/api/refresh?t=' + Date.now())
      .then(function (res) { return res.json(); })
      .then(function (result) {
        refreshBtn.textContent = result.success ? 'Done!' : result.message;
        setTimeout(function () {
          refreshBtn.textContent = 'Refresh';
          refreshBtn.disabled = false;
        }, 3000);

        if (result.success) {
          if (currentView === 'missions') loadMissions();
          if (currentView === 'leaderboard') loadLeaderboard();
          if (currentView === 'partners') loadPartners();
          if (currentView === 'partner-detail' && currentPartnerId) loadPartnerDetail(currentPartnerId);
        }
      })
      .catch(function () {
        refreshBtn.textContent = 'Error';
        setTimeout(function () {
          refreshBtn.textContent = 'Refresh';
          refreshBtn.disabled = false;
        }, 3000);
      });
  });

  // ============================================================================
  // Status Info
  // ============================================================================

  function loadStatus() {
    fetch('/api/status?t=' + Date.now())
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var info = document.getElementById('status-info');
        var parts = [data.trackedTweets + ' tweets'];
        if (data.trackedPartners > 0) parts.push(data.trackedPartners + ' partners, ' + data.trackedClips + ' clips');
        info.textContent = parts.join(' | ') + ' | Last poll: ' + timeAgo(data.lastPollAt);
      })
      .catch(function () {});
  }

  // ============================================================================
  // Keyboard shortcut
  // ============================================================================

  document.addEventListener('keydown', function (e) {
    // Ctrl/Cmd+K or / to focus search (when not already in input)
    if ((e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    // Escape to clear search
    if (e.key === 'Escape' && document.activeElement === searchInput) {
      searchInput.value = '';
      searchQuery = '';
      searchClear.classList.add('hidden');
      searchInput.blur();
      applyFilters();
    }
  });

  // ============================================================================
  // Init
  // ============================================================================

  updateFilterBar();
  loadMissions();
  loadStatus();

  setInterval(function () {
    if (currentView === 'missions') loadMissions();
    if (currentView === 'leaderboard') loadLeaderboard();
    if (currentView === 'partners') loadPartners();
    if (currentView === 'partner-detail' && currentPartnerId) loadPartnerDetail(currentPartnerId);
    loadStatus();
  }, REFRESH_INTERVAL);
})();
