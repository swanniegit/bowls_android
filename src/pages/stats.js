import { api, loadTokens } from '../api/client.js';
import { router }          from '../router.js';
import '../css/stats.css';

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function renderStats(container, params = {}) {
  if (!loadTokens()) {
    router.go('login');
    return;
  }

  if (params.id) {
    await renderDetail(container, parseInt(params.id));
  } else {
    await renderList(container);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session list
// ─────────────────────────────────────────────────────────────────────────────

async function renderList(container) {
  container.innerHTML = loadingShell('Statistics');

  const data = await api.get('/session.php?mine=1');
  const sessions = data.sessions ?? [];

  if (sessions.length === 0) {
    container.innerHTML = `
      <div class="page page--stats">
        <header class="app-header stats-header">
          <button class="back-btn" id="back-btn">&#8592;</button>
          <h1>Statistics</h1>
          <span></span>
        </header>
        <main class="stats-main">
          <div class="empty-state">
            <p>No games recorded yet.</p>
            <button class="btn btn--primary" id="new-game-btn">Start New Game</button>
          </div>
        </main>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => router.go(''));
    container.querySelector('#new-game-btn').addEventListener('click', () => router.go('game'));
    return;
  }

  container.innerHTML = `
    <div class="page page--stats">
      <header class="app-header stats-header">
        <button class="back-btn" id="back-btn">&#8592;</button>
        <h1>Statistics</h1>
        <span></span>
      </header>
      <main class="stats-main">
        <h2 class="section-title">Select a Game</h2>
        <div class="session-list">
          ${sessions.map(s => sessionCard(s)).join('')}
        </div>
      </main>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => router.go(''));
  container.querySelectorAll('.session-card').forEach(card => {
    card.addEventListener('click', () => router.go(`stats?id=${card.dataset.id}`));
  });
}

function sessionCard(s) {
  const date = new Date(s.session_date).toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
  const handLabel = s.hand === 'L' ? 'Left' : 'Right';
  return `
    <div class="session-card" data-id="${s.id}">
      <div class="session-card-header">
        <span class="badge">${handLabel}</span>
        <span class="session-date">${date}</span>
      </div>
      ${s.description ? `<p class="session-desc">${esc(s.description)}</p>` : ''}
      <div class="session-meta">
        <span>${s.roll_count} bowls</span>
      </div>
    </div>
  `;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session detail
// ─────────────────────────────────────────────────────────────────────────────

async function renderDetail(container, sessionId) {
  container.innerHTML = loadingShell('Statistics');

  const [sessionData, rollsData] = await Promise.all([
    api.get(`/session.php?id=${sessionId}`),
    api.get(`/roll.php?session_id=${sessionId}`),
  ]);

  const session = sessionData.session;
  const rolls   = rollsData.rolls ?? [];
  const stats   = computeStats(rolls);

  const handLabel = session.hand === 'L' ? 'Left' : 'Right';
  const date = new Date(session.session_date).toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
  });

  const endLengths = [
    { code: 11, label: 'Short' },
    { code: 10, label: 'Middle' },
    { code: 9,  label: 'Long' },
  ];

  const maxEndLengthCount = Math.max(...endLengths.map(e => stats.end_lengths[e.code] ?? 0), 1);

  const zones = [
    { name: 'Short',  count: (stats.results[1] ?? 0) + (stats.results[2] ?? 0)  + (stats.results[12] ?? 0) },
    { name: 'Level',  count: (stats.results[3] ?? 0) + (stats.results[4] ?? 0)  + (stats.results[8]  ?? 0) },
    { name: 'Long',   count: (stats.results[5] ?? 0) + (stats.results[6] ?? 0)  + (stats.results[7]  ?? 0) },
    { name: 'Left',   count: (stats.results[1] ?? 0) + (stats.results[3] ?? 0)  + (stats.results[5]  ?? 0) },
    { name: 'Centre', count: (stats.results[7] ?? 0) + (stats.results[8] ?? 0)  + (stats.results[12] ?? 0) },
    { name: 'Right',  count: (stats.results[2] ?? 0) + (stats.results[4] ?? 0)  + (stats.results[6]  ?? 0) },
  ];

  const positionGroups = [
    { row: 'Long',  cols: [{ code: 5, label: 'Left' }, { code: 7, label: 'Centre' }, { code: 6, label: 'Right' }] },
    { row: 'Level', cols: [{ code: 3, label: 'Left' }, { code: 8, label: 'Centre' }, { code: 4, label: 'Right' }] },
    { row: 'Short', cols: [{ code: 1, label: 'Left' }, { code: 12, label: 'Centre' }, { code: 2, label: 'Right' }] },
  ];

  const toucherRate = stats.total > 0 ? Math.round((stats.touchers / stats.total) * 100) : 0;

  container.innerHTML = `
    <div class="page page--stats">
      <header class="app-header stats-header">
        <button class="back-btn" id="back-btn">&#8592;</button>
        <h1>Statistics</h1>
        <span class="roll-count">${stats.total}</span>
      </header>

      <main class="stats-main">
        <div class="session-info">
          <span class="badge">${handLabel}</span>
          <span>${date}</span>
          ${session.description ? `<span>– ${esc(session.description)}</span>` : ''}
        </div>

        <!-- Summary Cards -->
        <div class="stats-grid">
          <div class="stat-card">
            <span class="stat-value">${stats.total}</span>
            <span class="stat-label">Total Bowls</span>
          </div>
          <div class="stat-card highlight">
            <span class="stat-value">${stats.touchers}</span>
            <span class="stat-label">Touchers</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${stats.results[8] ?? 0}</span>
            <span class="stat-label">Centre</span>
          </div>
          <div class="stat-card">
            <span class="stat-value">${toucherRate}%</span>
            <span class="stat-label">Toucher Rate</span>
          </div>
        </div>

        <!-- Position Breakdown -->
        <div class="stats-section">
          <h2>Position Breakdown</h2>
          <div class="stats-table">
            ${positionGroups.map(g => `
              <div class="stats-row">
                <span class="row-label">${g.row}</span>
                ${g.cols.map(c => {
                  const count = stats.results[c.code] ?? 0;
                  const pct   = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
                  return `
                    <div class="stats-cell ${c.code === 8 ? 'highlight' : ''}">
                      <span class="cell-count">${count}</span>
                      <span class="cell-pct">${pct}%</span>
                    </div>
                  `;
                }).join('')}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- End Length Breakdown -->
        <div class="stats-section">
          <h2>By End Length</h2>
          <div class="bar-chart">
            ${endLengths.map(e => {
              const count    = stats.end_lengths[e.code] ?? 0;
              const pct      = stats.total > 0 ? Math.round((count / stats.total) * 100) : 0;
              const barWidth = Math.round((count / maxEndLengthCount) * 100);
              return `
                <div class="bar-row">
                  <span class="bar-label">${e.label}</span>
                  <div class="bar-track">
                    <div class="bar-fill" style="width:${barWidth}%"></div>
                  </div>
                  <span class="bar-value">${count} (${pct}%)</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- Zone Analysis -->
        <div class="stats-section">
          <h2>Zone Analysis</h2>
          <div class="zone-grid">
            ${zones.map(z => {
              const pct = stats.total > 0 ? Math.round((z.count / stats.total) * 100) : 0;
              return `
                <div class="zone-card">
                  <span class="zone-name">${z.name}</span>
                  <span class="zone-value">${z.count}</span>
                  <span class="zone-pct">${pct}%</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="action-bar">
          <button class="btn btn--secondary" id="history-btn">All Games</button>
          <button class="btn btn--primary" id="new-game-btn">New Game</button>
        </div>
      </main>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => router.back());
  container.querySelector('#history-btn').addEventListener('click', () => router.go('stats'));
  container.querySelector('#new-game-btn').addEventListener('click', () => router.go('game'));
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side stats calculation (mirrors Roll::stats() in PHP)
// ─────────────────────────────────────────────────────────────────────────────

function computeStats(rolls) {
  const stats = { total: rolls.length, touchers: 0, results: {}, end_lengths: {} };

  for (const roll of rolls) {
    if (roll.toucher) stats.touchers++;

    const r = roll.result;
    stats.results[r] = (stats.results[r] ?? 0) + 1;

    const el = roll.end_length;
    if (el != null) {
      stats.end_lengths[el] = (stats.end_lengths[el] ?? 0) + 1;
    }
  }

  return stats;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function loadingShell(title) {
  return `
    <div class="page page--stats">
      <header class="app-header stats-header">
        <button class="back-btn" onclick="history.back()">&#8592;</button>
        <h1>${title}</h1>
        <span></span>
      </header>
      <main class="stats-main"><p class="loading-text">Loading…</p></main>
    </div>
  `;
}

function esc(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
