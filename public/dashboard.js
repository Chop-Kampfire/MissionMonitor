(function () {
  'use strict';

  var REFRESH_INTERVAL = 30000;
  var STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes

  function formatUptime(seconds) {
    var d = Math.floor(seconds / 86400);
    var h = Math.floor((seconds % 86400) / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var parts = [];
    if (d > 0) parts.push(d + 'd');
    if (h > 0) parts.push(h + 'h');
    parts.push(m + 'm');
    return parts.join(' ');
  }

  function timeAgo(isoString) {
    var diff = Date.now() - new Date(isoString).getTime();
    var sec = Math.floor(diff / 1000);
    if (sec < 60) return sec + 's ago';
    var min = Math.floor(sec / 60);
    if (min < 60) return min + 'm ago';
    var hr = Math.floor(min / 60);
    return hr + 'h ago';
  }

  function render(data) {
    // Overall status
    var badge = document.getElementById('overall-status');
    var allOp = data.services.every(function (s) { return s.status === 'operational' || s.status === 'unconfigured'; });
    var anyDown = data.services.some(function (s) { return s.status === 'down'; });

    if (allOp) {
      badge.textContent = 'All Systems Operational';
      badge.className = 'badge operational';
    } else if (anyDown) {
      badge.textContent = 'Degraded';
      badge.className = 'badge degraded';
    } else {
      badge.textContent = 'Issues Detected';
      badge.className = 'badge down';
    }

    // Meta
    document.getElementById('version').textContent = 'v' + data.version;
    document.getElementById('uptime').textContent = 'Uptime: ' + formatUptime(data.uptime);
    document.getElementById('last-updated').textContent = 'Updated ' + timeAgo(data.lastUpdated);

    // Stale check
    var staleEl = document.getElementById('stale-warning');
    var age = Date.now() - new Date(data.lastUpdated).getTime();
    if (age > STALE_THRESHOLD) {
      staleEl.classList.remove('hidden');
    } else {
      staleEl.classList.add('hidden');
    }

    // Service cards
    var container = document.getElementById('services');
    container.innerHTML = '';
    data.services.forEach(function (svc) {
      var card = document.createElement('div');
      card.className = 'service-card';

      var dot = document.createElement('div');
      dot.className = 'status-dot ' + svc.status;

      var info = document.createElement('div');
      info.className = 'service-info';

      var name = document.createElement('div');
      name.className = 'service-name';
      name.textContent = svc.name;

      var detail = document.createElement('div');
      detail.className = 'service-detail';
      detail.textContent = svc.detail || svc.status;

      info.appendChild(name);
      info.appendChild(detail);
      card.appendChild(dot);
      card.appendChild(info);
      container.appendChild(card);
    });
  }

  function fetchStatus() {
    var url = 'status.json?t=' + Date.now();
    fetch(url)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(render)
      .catch(function (err) {
        console.error('[Dashboard] Failed to fetch status:', err);
        var badge = document.getElementById('overall-status');
        badge.textContent = 'Unavailable';
        badge.className = 'badge down';
      });
  }

  fetchStatus();
  setInterval(fetchStatus, REFRESH_INTERVAL);
})();
