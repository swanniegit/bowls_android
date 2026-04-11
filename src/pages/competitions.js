import { api, loadTokens }      from '../api/client.js';
import { router }               from '../router.js';
import { showToast }            from '../ui.js';
import '../css/competitions.css';

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function renderCompetitions(container, params = {}) {
  if (!loadTokens()) { router.go('login'); return; }

  if (params.id) {
    await showDetail(container, parseInt(params.id));
  } else if (params.club) {
    await showList(container, parseInt(params.club));
  } else {
    await showClubPicker(container);
  }
}

// ─── Club picker ──────────────────────────────────────────────────────────────

async function showClubPicker(container) {
  setShell(container, 'Competitions');
  wireBack(container, '');

  const data  = await api.get('/club.php?action=my_clubs');
  const clubs = data.clubs ?? [];
  const main  = container.querySelector('.comp-main');

  if (!clubs.length) {
    main.innerHTML = noClubHTML('competitions');
    wireNoClub(main);
    return;
  }

  if (clubs.length === 1) { router.go(`competitions?club=${clubs[0].id}`); return; }

  main.innerHTML = `
    <p class="section-label">Select a club</p>
    <div class="club-list">
      ${clubs.map(c => `
        <button class="club-card" data-id="${c.id}">
          <div class="club-card__name">${esc(c.name)}</div>
          <div class="club-card__role badge-role">${esc(c.role)}</div>
          <span class="club-card__arrow">›</span>
        </button>
      `).join('')}
    </div>`;

  main.querySelectorAll('.club-card').forEach(btn =>
    btn.addEventListener('click', () => router.go(`competitions?club=${btn.dataset.id}`))
  );
}

// ─── Competition list ─────────────────────────────────────────────────────────

async function showList(container, clubId) {
  setShell(container, 'Competitions');
  wireBack(container, 'competitions');

  const data  = await api.get(`/competition.php?action=list&club_id=${clubId}`);
  const comps = data.competitions ?? [];
  const main  = container.querySelector('.comp-main');

  if (!comps.length) {
    main.innerHTML = `<div class="empty-state"><p>No competitions yet.</p></div>`;
    return;
  }

  // Group by status priority
  const order   = ['in_progress', 'registration', 'draft', 'completed', 'cancelled'];
  const grouped = {};
  order.forEach(s => { grouped[s] = []; });
  comps.forEach(c => { (grouped[c.status] ?? (grouped.cancelled ??= [])).push(c); });

  const sectionTitle = {
    in_progress:  'In Progress',
    registration: 'Registration Open',
    draft:        'Draft',
    completed:    'Completed',
    cancelled:    'Cancelled',
  };

  main.innerHTML = order.map(status => {
    const list = grouped[status] ?? [];
    if (!list.length) return '';
    return `
      <div class="comp-section">
        <h3 class="section-label">${sectionTitle[status]}</h3>
        ${list.map(renderCompCard).join('')}
      </div>`;
  }).join('');

  main.querySelectorAll('.comp-card').forEach(card =>
    card.addEventListener('click', () => router.go(`competitions?id=${card.dataset.id}`))
  );
}

function renderCompCard(c) {
  const fmt = formatLabel(c.format);
  return `
    <button class="comp-card" data-id="${c.id}">
      <div class="comp-card__header">
        <span class="comp-card__name">${esc(c.name)}</span>
        <span class="status-badge status-badge--${c.status}">${statusLabel(c.status)}</span>
      </div>
      <div class="comp-card__meta">
        ${fmt} · ${cap(c.game_type)} · ${c.participant_count ?? 0} entries
      </div>
    </button>`;
}

// ─── Competition detail ───────────────────────────────────────────────────────

const TABS = ['overview', 'fixtures', 'standings'];

async function showDetail(container, id) {
  setShell(container, 'Competition');
  wireBack(container, 'competitions');

  // Load competition
  const data = await api.get(`/competition.php?action=get&id=${id}`);
  const comp = data.competition;
  if (!comp) {
    container.querySelector('.comp-main').innerHTML =
      '<div class="empty-state"><p>Competition not found.</p></div>';
    return;
  }

  // Set header title
  container.querySelector('.comp-header h1').textContent = comp.name;

  // Fix back → competitions?club=X
  wireBack(container, `competitions?club=${comp.club_id}`);

  let activeTab = 'overview';
  const cache   = {};

  function renderTabs() {
    const showStandings = ['round_robin', 'combined'].includes(comp.format);
    const tabs = [
      { id: 'overview',  label: 'Info' },
      { id: 'fixtures',  label: 'Fixtures' },
      ...(showStandings ? [{ id: 'standings', label: 'Standings' }] : []),
    ];

    return `
      <div class="tab-bar">
        ${tabs.map(t => `
          <button class="tab-btn ${t.id === activeTab ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>
        `).join('')}
      </div>`;
  }

  async function renderTabContent() {
    const main = container.querySelector('.comp-main');

    if (activeTab === 'overview') {
      main.querySelector('.tab-content').innerHTML = renderOverview(comp);
      wireOverviewActions(main, comp, id, async () => {
        // Refresh competition after admin action
        const refreshed = await api.get(`/competition.php?action=get&id=${id}`);
        Object.assign(comp, refreshed.competition);
        renderPage();
      });

    } else if (activeTab === 'fixtures') {
      if (!cache.fixtures) {
        main.querySelector('.tab-content').innerHTML = '<div class="loader">Loading fixtures…</div>';
        const d = await api.get(`/competition.php?action=fixtures&id=${id}`);
        cache.fixtures = d.fixtures ?? [];
      }
      main.querySelector('.tab-content').innerHTML = renderFixtures(cache.fixtures, comp);

      // Wire "Go to match" buttons
      main.querySelectorAll('.fixture-match-btn').forEach(btn => {
        btn.addEventListener('click', () => router.go(`matches?score=${btn.dataset.mid}`));
      });

    } else if (activeTab === 'standings') {
      if (!cache.standings) {
        main.querySelector('.tab-content').innerHTML = '<div class="loader">Loading standings…</div>';
        const d = await api.get(`/competition.php?action=standings&id=${id}`);
        cache.standings = d.standings ?? [];
      }
      main.querySelector('.tab-content').innerHTML = renderStandings(cache.standings);
    }
  }

  function renderPage() {
    const main = container.querySelector('.comp-main');
    main.innerHTML = `
      ${renderTabs()}
      <div class="tab-content"></div>`;

    main.querySelectorAll('.tab-btn').forEach(btn =>
      btn.addEventListener('click', async () => {
        activeTab = btn.dataset.tab;
        main.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
        await renderTabContent();
      })
    );

    renderTabContent();
  }

  renderPage();
}

// ── Overview tab ──────────────────────────────────────────────────────────────

function renderOverview(comp) {
  const canManage = comp.can_manage ?? false;

  return `
    <div class="overview-card">
      <div class="ov-row">
        <span class="ov-label">Format</span>
        <span class="ov-value">${formatLabel(comp.format)}</span>
      </div>
      <div class="ov-row">
        <span class="ov-label">Game</span>
        <span class="ov-value">${cap(comp.game_type)}</span>
      </div>
      <div class="ov-row">
        <span class="ov-label">Status</span>
        <span class="status-badge status-badge--${comp.status}">${statusLabel(comp.status)}</span>
      </div>
      <div class="ov-row">
        <span class="ov-label">Entries</span>
        <span class="ov-value">${comp.participant_count ?? 0}${comp.max_participants ? ' / ' + comp.max_participants : ''}</span>
      </div>
      ${comp.description ? `
        <div class="ov-desc">${esc(comp.description)}</div>
      ` : ''}
    </div>

    ${renderParticipants(comp.participants ?? [])}

    ${canManage ? renderAdminActions(comp) : ''}
  `;
}

function renderParticipants(participants) {
  if (!participants.length) return '';
  return `
    <div class="participants-card">
      <h4 class="card-title">Entries (${participants.length})</h4>
      ${participants.map(p => `
        <div class="participant-row">
          <span class="participant-name">${esc(p.display_name ?? p.team_name ?? `Entry #${p.id}`)}</span>
        </div>
      `).join('')}
    </div>`;
}

function renderAdminActions(comp) {
  const actions = [];

  if (comp.status === 'draft') {
    actions.push(`<button class="admin-btn" data-action="open_registration">Open Registration</button>`);
    actions.push(`<button class="admin-btn admin-btn--start" data-action="start">Start Now</button>`);
  }
  if (comp.status === 'registration') {
    actions.push(`<button class="admin-btn admin-btn--start" data-action="generate_and_start">Generate Fixtures &amp; Start</button>`);
    actions.push(`<button class="admin-btn" data-action="close_registration">Close Registration</button>`);
  }
  if (comp.status === 'in_progress') {
    actions.push(`<button class="admin-btn admin-btn--complete" data-action="complete">Complete Competition</button>`);
  }
  if (!['completed', 'cancelled'].includes(comp.status)) {
    actions.push(`<button class="admin-btn admin-btn--danger" data-action="cancel">Cancel</button>`);
  }

  if (!actions.length) return '';
  return `<div class="admin-actions">${actions.join('')}</div>`;
}

function wireOverviewActions(main, comp, id, onDone) {
  main.querySelectorAll('.admin-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      btn.disabled = true;

      try {
        if (action === 'generate_and_start') {
          await api.post('/competition.php', { action: 'generate_fixtures', id });
          await api.post('/competition.php', { action: 'start', id });
        } else {
          await api.post('/competition.php', { action, id });
        }
        await onDone();
      } catch (err) {
        showToast(err.message);
        btn.disabled = false;
      }
    });
  });
}

// ── Fixtures tab ──────────────────────────────────────────────────────────────

function renderFixtures(fixtures, comp) {
  if (!fixtures.length) return '<div class="empty-state"><p>No fixtures yet.</p></div>';

  // Group by stage
  const byStage = {};
  fixtures.forEach(f => {
    const stage = f.stage ?? 'group';
    if (!byStage[stage]) byStage[stage] = [];
    byStage[stage].push(f);
  });

  return Object.entries(byStage).map(([stage, list]) => `
    <div class="fixture-group">
      <h4 class="fixture-stage">${stageLabel(stage)}</h4>
      ${list.map(f => renderFixture(f)).join('')}
    </div>
  `).join('');
}

function renderFixture(f) {
  const hasScore  = f.participant1_for !== null && f.participant2_for !== null;
  const isWalkover = f.status === 'walkover';
  const scoreHTML = hasScore
    ? `<span class="fixture-score">${f.participant1_for} – ${f.participant2_for}</span>`
    : isWalkover ? `<span class="fixture-walkover">W/O</span>`
    : `<span class="fixture-score fixture-score--pending">vs</span>`;

  return `
    <div class="fixture-row ${f.status === 'completed' ? 'fixture-row--done' : ''}">
      <span class="fixture-name">${esc(f.participant1_name ?? 'TBD')}</span>
      ${scoreHTML}
      <span class="fixture-name fixture-name--right">${esc(f.participant2_name ?? 'TBD')}</span>
      ${f.match_id ? `<button class="fixture-match-btn" data-mid="${f.match_id}">View</button>` : ''}
    </div>`;
}

// ── Standings tab ─────────────────────────────────────────────────────────────

function renderStandings(standings) {
  if (!standings || !standings.length) {
    return '<div class="empty-state"><p>No standings yet.</p></div>';
  }

  // standings may be grouped (for combined) or flat array
  const isGrouped = standings[0] && typeof standings[0].group_name !== 'undefined' && !standings[0].played;

  if (isGrouped) {
    return standings.map(group => `
      <div class="standings-group">
        <h4 class="fixture-stage">${esc(group.group_name ?? 'Group')}</h4>
        ${renderStandingsTable(group.standings ?? [])}
      </div>`).join('');
  }

  return renderStandingsTable(standings);
}

function renderStandingsTable(rows) {
  if (!rows.length) return '';
  return `
    <div class="standings-wrap">
      <table class="standings-table">
        <thead>
          <tr>
            <th class="col-pos">#</th>
            <th class="col-name">Team</th>
            <th>P</th><th>W</th><th>D</th><th>L</th>
            <th>F</th><th>A</th><th class="col-pts">Pts</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((r, i) => `
            <tr class="${i < 2 ? 'qualifier-row' : ''}">
              <td class="col-pos">${i + 1}</td>
              <td class="col-name">${esc(r.participant_name ?? r.display_name ?? `#${r.participant_id}`)}</td>
              <td>${r.played ?? 0}</td>
              <td>${r.won ?? 0}</td>
              <td>${r.drawn ?? 0}</td>
              <td>${r.lost ?? 0}</td>
              <td>${r.shots_for ?? 0}</td>
              <td>${r.shots_against ?? 0}</td>
              <td class="col-pts">${r.points ?? 0}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function setShell(container, title) {
  container.innerHTML = `
    <div class="page page--comp">
      <header class="comp-header">
        <button class="back-btn" id="header-back">&#8592;</button>
        <h1>${esc(title)}</h1>
        <span></span>
      </header>
      <main class="comp-main">
        <div class="loader">Loading…</div>
      </main>
    </div>`;
}

function wireBack(container, path) {
  const btn   = container.querySelector('#header-back');
  if (!btn) return;
  const clone = btn.cloneNode(true);
  btn.replaceWith(clone);
  clone.addEventListener('click', () => path ? router.go(path) : history.back());
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cap(s) { return String(s ?? '').charAt(0).toUpperCase() + String(s ?? '').slice(1); }

function statusLabel(s) {
  return {
    draft:        'Draft',
    registration: 'Open',
    in_progress:  'Live',
    completed:    'Done',
    cancelled:    'Cancelled',
  }[s] ?? s;
}

function formatLabel(f) {
  return {
    round_robin: 'Round Robin',
    knockout:    'Knockout',
    combined:    'Group + KO',
  }[f] ?? f;
}

// ─── No-club promotional card ─────────────────────────────────────────────────

function noClubHTML(context) {
  const headline = context === 'matches'
    ? 'Score live matches with your club'
    : 'Run tournaments with your club';
  const body = context === 'matches'
    ? 'Record ends in real time, track scores across all game types, and let your whole team follow along on their phones.'
    : 'Organise Round Robin leagues, Knockout draws, and combined competitions — fixtures generated automatically.';

  return `
    <div class="no-club-card">
      <div class="no-club-icon">${context === 'matches' ? '⚡' : '🏅'}</div>
      <h2 class="no-club-title">${headline}</h2>
      <p class="no-club-body">${body}</p>
      <div class="no-club-steps">
        <div class="no-club-step">
          <span class="step-num">1</span>
          <span class="step-text">Create or find your club on <strong>bowlstracker.co.za</strong></span>
        </div>
        <div class="no-club-step">
          <span class="step-num">2</span>
          <span class="step-text">Ask your club admin to add you as a member</span>
        </div>
        <div class="no-club-step">
          <span class="step-num">3</span>
          <span class="step-text">Come back here — your club's ${context} will appear</span>
        </div>
      </div>
      <button class="no-club-btn" data-url="https://bowlstracker.co.za/clubs">
        Go to bowlstracker.co.za
      </button>
      <p class="no-club-hint">Opens in your browser</p>
    </div>`;
}

function wireNoClub(container) {
  const btn = container.querySelector('.no-club-btn');
  if (btn) btn.addEventListener('click', () => window.open(btn.dataset.url, '_system'));
}

function stageLabel(s) {
  return {
    group:        'Group Stage',
    play_in:      'Play-In',
    round_of_64:  'Round of 64',
    round_of_32:  'Round of 32',
    round_of_16:  'Round of 16',
    quarter_final:'Quarter Finals',
    semi_final:   'Semi Finals',
    third_place:  '3rd Place',
    final:        'Final',
  }[s] ?? s;
}
