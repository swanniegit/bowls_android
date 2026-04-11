import { api, loadTokens }   from '../api/client.js';
import { router }            from '../router.js';
import { showToast, showConfirm } from '../ui.js';
import '../css/matches.css';

// ─── Module-level cleanup ─────────────────────────────────────────────────────

let _pollTimer = null;
function clearPoll() { if (_pollTimer) { clearInterval(_pollTimer); _pollTimer = null; } }

// ─── Entry point ──────────────────────────────────────────────────────────────

export async function renderMatches(container, params = {}) {
  clearPoll();
  if (!loadTokens()) { router.go('login'); return; }

  if (params.score) {
    await showScorer(container, parseInt(params.score));
  } else if (params.create) {
    await showCreate(container, parseInt(params.create));
  } else if (params.club) {
    await showList(container, parseInt(params.club));
  } else {
    await showClubPicker(container);
  }
}

// ─── Club picker ──────────────────────────────────────────────────────────────

async function showClubPicker(container) {
  setShell(container, 'Matches');
  wireBack(container, '');

  const data  = await api.get('/club.php?action=my_clubs');
  const clubs = data.clubs ?? [];

  const main = container.querySelector('.matches-main');

  if (!clubs.length) {
    main.innerHTML = noClubHTML('matches');
    wireNoClub(main);
    return;
  }

  if (clubs.length === 1) {
    router.go(`matches?club=${clubs[0].id}`);
    return;
  }

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
    btn.addEventListener('click', () => router.go(`matches?club=${btn.dataset.id}`))
  );
}

// ─── Match list ───────────────────────────────────────────────────────────────

async function showList(container, clubId) {
  setShell(container, 'Matches');
  wireBack(container, 'matches');

  const data = await api.get(`/match.php?action=list&club_id=${clubId}`);
  const { live = [], setup = [], completed = [], can_create = false } = data;

  const main = container.querySelector('.matches-main');
  main.innerHTML = `
    ${can_create ? `<button class="btn-create" id="create-btn">+ New Match</button>` : ''}
    ${renderSection('Live', live)}
    ${renderSection('Waiting to Start', setup)}
    ${renderSection('Completed', completed)}
    ${!live.length && !setup.length && !completed.length
      ? `<div class="empty-state"><p>No matches yet.</p></div>`
      : ''}
  `;

  main.querySelector('#create-btn')?.addEventListener('click',
    () => router.go(`matches?create=${clubId}`)
  );

  main.querySelectorAll('.match-card').forEach(card =>
    card.addEventListener('click', () => router.go(`matches?score=${card.dataset.id}`))
  );
}

function renderSection(title, matches) {
  if (!matches.length) return '';
  return `
    <div class="match-section">
      <h3 class="section-label">${title}</h3>
      ${matches.map(renderMatchCard).join('')}
    </div>`;
}

function renderMatchCard(m) {
  const s = m.status ?? 'setup';
  return `
    <button class="match-card" data-id="${m.id}">
      <div class="match-card__header">
        <span class="match-card__type">${cap(m.game_type)}</span>
        <span class="status-badge ${s}">${statusLabel(s)}</span>
      </div>
      <div class="match-card__teams">
        <span class="match-card__team">${esc(m.team1_name ?? 'Team 1')}</span>
        <span class="match-card__score">${m.team1_score ?? 0} – ${m.team2_score ?? 0}</span>
        <span class="match-card__team right">${esc(m.team2_name ?? 'Team 2')}</span>
      </div>
      ${s === 'live' ? `<div class="match-card__end">End ${m.current_end ?? 1}</div>` : ''}
    </button>`;
}

// ─── Scorer / Viewer ──────────────────────────────────────────────────────────

async function showScorer(container, matchId) {
  setShell(container, 'Match');

  const state = {
    matchId,
    match: null,
    ends: [],
    team1Score: 0,
    team2Score: 0,
    currentEnd: 1,
    scoringTeam: null,
    shots: null,
    submitting: false,
  };

  await loadAndRenderScorer(container, state);
}

async function loadAndRenderScorer(container, state) {
  const data  = await api.get(`/match.php?action=get&id=${state.matchId}`);
  const match = data.match;

  if (!match) {
    container.querySelector('.matches-main').innerHTML =
      '<div class="empty-state"><p>Match not found.</p></div>';
    return;
  }

  state.match      = match;
  state.ends       = match.ends ?? [];
  state.team1Score = match.team1_score ?? 0;
  state.team2Score = match.team2_score ?? 0;
  state.currentEnd = match.current_end ?? 1;

  // Wire back → match list for this club (now we know club_id)
  wireBack(container, `matches?club=${match.club_id}`);

  renderScorerUI(container, state);

  // Poll for viewer when match is live
  clearPoll();
  if (!match.can_score && match.status === 'live') {
    _pollTimer = setInterval(async () => {
      try {
        const d = await api.get(`/match.php?action=scores&id=${state.matchId}`);
        state.ends       = d.ends       ?? state.ends;
        state.team1Score = d.team1_score ?? state.team1Score;
        state.team2Score = d.team2_score ?? state.team2Score;
        state.currentEnd = d.current_end ?? state.currentEnd;
        if (d.status === 'completed') {
          clearPoll();
          state.match.status = 'completed';
          renderScorerUI(container, state);
        } else {
          refreshScoreboard(container, state);
        }
      } catch (_) {}
    }, 5000);
  }
}

function renderScorerUI(container, state) {
  const { match, ends, team1Score, team2Score, currentEnd } = state;
  const canScore  = match.can_score;
  const canDelete = match.can_delete;
  const status    = match.status;
  const team1Name = match.teams?.[0]?.team_name ?? 'Team 1';
  const team2Name = match.teams?.[1]?.team_name ?? 'Team 2';

  container.querySelector('.matches-main').innerHTML = `
    <div class="scoreboard" id="scoreboard">
      <div class="scoreboard-header">
        <span class="match-type">${cap(match.game_type)} · ${
          match.scoring_mode === 'first_to'
            ? `First to ${match.target_score}`
            : `${match.target_score} ends`
        }</span>
        <span class="status-badge ${status}">${statusLabel(status)}</span>
      </div>
      <div class="teams-row">
        <div class="team-col left">
          <div class="team-name">${esc(team1Name)}</div>
          <div class="team-score" id="score-t1">${team1Score}</div>
        </div>
        <div class="vs-col">–</div>
        <div class="team-col right">
          <div class="team-name">${esc(team2Name)}</div>
          <div class="team-score" id="score-t2">${team2Score}</div>
        </div>
      </div>
      ${status === 'live' ? `<div class="end-info" id="end-info">End ${currentEnd}</div>` : ''}
    </div>

    ${ends.length ? renderEndsHistory(ends, team1Name, team2Name) : ''}
    ${canScore && status === 'setup' ? `<button class="btn-start" id="start-btn">Start Match</button>` : ''}
    ${canScore && status === 'live'  ? renderScoringSection(state, team1Name, team2Name) : ''}
    ${canScore && status === 'live'  ? `
      <div class="action-buttons">
        <button class="btn-complete" id="complete-btn">Complete Match</button>
        ${canDelete ? `<button class="btn-delete" id="delete-btn">Delete</button>` : ''}
      </div>` : ''}
    ${canDelete && status === 'setup' ? `
      <div class="action-buttons">
        <button class="btn-delete" id="delete-btn">Delete Match</button>
      </div>` : ''}
    ${!canScore && status === 'live' ? `<div class="viewer-note">Live · refreshing every 5 s</div>` : ''}
    ${status === 'completed' ? renderResultCard(team1Score, team2Score, team1Name, team2Name, canDelete) : ''}
  `;

  wireScorerEvents(container, state);
}

function renderEndsHistory(ends, team1Name, team2Name) {
  return `
    <div class="ends-history">
      <h4>Ends played</h4>
      <div class="ends-grid" id="ends-grid">
        ${ends.map(e => `
          <div class="end-cell team-${e.scoring_team}"
               title="${e.scoring_team == 1 ? esc(team1Name) : esc(team2Name)}: ${e.shots} shot${e.shots !== 1 ? 's' : ''}">
            ${e.shots}
          </div>`).join('')}
      </div>
    </div>`;
}

function renderScoringSection(state, team1Name, team2Name) {
  const { scoringTeam, shots } = state;
  return `
    <div class="score-section">
      <h3>Record End ${state.currentEnd}</h3>
      <div class="team-select">
        <button class="team-btn team-1 ${scoringTeam === 1 ? 'active' : ''}" data-team="1">${esc(team1Name)}</button>
        <button class="team-btn team-2 ${scoringTeam === 2 ? 'active' : ''}" data-team="2">${esc(team2Name)}</button>
      </div>
      <div class="shots-grid">
        ${[1,2,3,4,5,6,7,8].map(n =>
          `<button class="shot-btn ${shots === n ? 'active' : ''}" data-shots="${n}">${n}</button>`
        ).join('')}
      </div>
      <div class="submit-row">
        <button class="btn-undo" id="undo-btn" title="Undo last end">↩</button>
        <button class="btn-submit" id="submit-end-btn" ${scoringTeam !== null && shots !== null ? '' : 'disabled'}>
          Submit End
        </button>
      </div>
    </div>`;
}

function renderResultCard(t1, t2, name1, name2, canDelete) {
  const winner = t1 > t2 ? name1 : t2 > t1 ? name2 : null;
  return `
    <div class="result-card">
      <div class="result-trophy">🏆</div>
      <div class="result-winner">${winner ? esc(winner) + ' wins!' : 'Draw!'}</div>
      <div class="result-score">${t1} – ${t2}</div>
      ${canDelete ? `<button class="btn-delete" id="delete-btn" style="margin-top:1rem">Delete Match</button>` : ''}
    </div>`;
}

function wireScorerEvents(container, state) {
  const main      = container.querySelector('.matches-main');
  const team1Name = state.match.teams?.[0]?.team_name ?? 'Team 1';
  const team2Name = state.match.teams?.[1]?.team_name ?? 'Team 2';

  main.querySelectorAll('.team-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      state.scoringTeam = parseInt(btn.dataset.team);
      updateScoringUI(main, state);
    })
  );

  main.querySelectorAll('.shot-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      state.shots = parseInt(btn.dataset.shots);
      updateScoringUI(main, state);
    })
  );

  main.querySelector('#start-btn')?.addEventListener('click', async () => {
    await api.post('/match.php', { action: 'start', match_id: state.matchId });
    await loadAndRenderScorer(container, state);
  });

  main.querySelector('#submit-end-btn')?.addEventListener('click', async () => {
    if (state.submitting || state.scoringTeam === null || state.shots === null) return;
    state.submitting = true;
    try {
      const d = await api.post('/match.php', {
        action:       'end',
        match_id:     state.matchId,
        end_number:   state.currentEnd,
        scoring_team: state.scoringTeam,
        shots:        state.shots,
      });
      state.ends       = d.ends       ?? state.ends;
      state.team1Score = d.team1_score ?? state.team1Score;
      state.team2Score = d.team2_score ?? state.team2Score;
      state.currentEnd = d.current_end ?? state.currentEnd;
      state.scoringTeam = null;
      state.shots       = null;
      if (d.status === 'completed') state.match.status = 'completed';
      renderScorerUI(container, state);
    } finally {
      state.submitting = false;
    }
  });

  main.querySelector('#undo-btn')?.addEventListener('click', async () => {
    const d = await api.post('/match.php', { action: 'undo', match_id: state.matchId });
    state.ends       = d.ends       ?? state.ends;
    state.team1Score = d.team1_score ?? state.team1Score;
    state.team2Score = d.team2_score ?? state.team2Score;
    state.currentEnd = d.current_end ?? state.currentEnd;
    state.scoringTeam = null;
    state.shots       = null;
    renderScorerUI(container, state);
  });

  main.querySelector('#complete-btn')?.addEventListener('click', async () => {
    if (!await showConfirm('Mark this match as complete?', 'Complete')) return;
    await api.post('/match.php', { action: 'complete', match_id: state.matchId });
    clearPoll();
    state.match.status = 'completed';
    renderScorerUI(container, state);
  });

  main.querySelector('#delete-btn')?.addEventListener('click', async () => {
    if (!await showConfirm('Delete this match? This cannot be undone.', 'Delete', true)) return;
    await api.delete(`/match.php?id=${state.matchId}`);
    clearPoll();
    router.go(`matches?club=${state.match.club_id}`);
  });
}

function updateScoringUI(main, state) {
  main.querySelectorAll('.team-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.team) === state.scoringTeam)
  );
  main.querySelectorAll('.shot-btn').forEach(b =>
    b.classList.toggle('active', parseInt(b.dataset.shots) === state.shots)
  );
  const btn = main.querySelector('#submit-end-btn');
  if (btn) btn.disabled = state.scoringTeam === null || state.shots === null;
}

function refreshScoreboard(container, state) {
  const t1El = container.querySelector('#score-t1');
  const t2El = container.querySelector('#score-t2');
  if (t1El) t1El.textContent = state.team1Score;
  if (t2El) t2El.textContent = state.team2Score;
  const endInfo = container.querySelector('#end-info');
  if (endInfo) endInfo.textContent = `End ${state.currentEnd}`;
  const grid = container.querySelector('#ends-grid');
  if (grid && state.ends) {
    const t1 = state.match.teams?.[0]?.team_name ?? 'Team 1';
    const t2 = state.match.teams?.[1]?.team_name ?? 'Team 2';
    grid.innerHTML = state.ends.map(e => `
      <div class="end-cell team-${e.scoring_team}"
           title="${e.scoring_team == 1 ? esc(t1) : esc(t2)}: ${e.shots} shot${e.shots !== 1 ? 's' : ''}">
        ${e.shots}
      </div>`).join('');
  }
}

// ─── Create match ─────────────────────────────────────────────────────────────

async function showCreate(container, clubId) {
  setShell(container, 'New Match');
  wireBack(container, `matches?club=${clubId}`);

  const data      = await api.get('/match.php?action=game_types');
  const gameTypes = data.game_types ?? {};
  const typeKeys  = Object.keys(gameTypes);

  if (!typeKeys.length) {
    container.querySelector('.matches-main').innerHTML =
      '<div class="empty-state"><p>No game types available.</p></div>';
    return;
  }

  let selectedType = typeKeys[0];
  let scoringMode  = 'ends';
  let bowls        = null; // set per type

  const main = container.querySelector('.matches-main');

  function savedValues() {
    const vals = {
      team1: main.querySelector('#team1-name')?.value ?? 'Team 1',
      team2: main.querySelector('#team2-name')?.value ?? 'Team 2',
      target: main.querySelector('#target-input')?.value ?? '21',
      players: {},
    };
    main.querySelectorAll('[data-pos]').forEach(el => { vals.players[el.id] = el.value; });
    return vals;
  }

  function renderForm(saved = null) {
    const cfg       = gameTypes[selectedType] ?? {};
    const positions = cfg.positions    ?? [];
    const bowlOpts  = cfg.allowed_bowls ?? [4];
    if (bowls === null || !bowlOpts.includes(bowls)) bowls = cfg.default_bowls ?? bowlOpts[0];

    const teamLabel  = saved?.team1 ?? 'Team 1';
    const team2Label = saved?.team2 ?? 'Team 2';

    main.innerHTML = `
      <form id="create-form">
        <div class="form-section">
          <label class="form-label">Game Type</label>
          <div class="type-grid">
            ${typeKeys.map(t =>
              `<button type="button" class="type-btn ${t === selectedType ? 'active' : ''}" data-type="${t}">${cap(t)}</button>`
            ).join('')}
          </div>
        </div>

        ${bowlOpts.length > 1 ? `
          <div class="form-section">
            <label class="form-label">Bowls per Player</label>
            <div class="type-grid">
              ${bowlOpts.map(n =>
                `<button type="button" class="type-btn ${n === bowls ? 'active' : ''}" data-bowls="${n}">${n}</button>`
              ).join('')}
            </div>
          </div>
        ` : ''}

        <div class="form-section">
          <label class="form-label">Scoring Mode</label>
          <div class="type-grid">
            <button type="button" class="type-btn ${scoringMode === 'ends' ? 'active' : ''}" data-mode="ends">No. of Ends</button>
            <button type="button" class="type-btn ${scoringMode === 'first_to' ? 'active' : ''}" data-mode="first_to">First To</button>
          </div>
        </div>

        <div class="form-section">
          <label class="form-label">${scoringMode === 'first_to' ? 'First to (shots)' : 'Number of ends'}</label>
          <input type="number" id="target-input" class="form-input" value="${saved?.target ?? 21}" min="1" max="50">
        </div>

        <div class="form-section">
          <label class="form-label">Team Names</label>
          <input type="text" id="team1-name" class="form-input" placeholder="Team 1" value="${esc(teamLabel)}">
          <input type="text" id="team2-name" class="form-input mt" placeholder="Team 2" value="${esc(team2Label)}">
        </div>

        ${positions.length ? `
          <div class="form-section">
            <label class="form-label">Players</label>
            <div class="players-grid">
              <div></div>
              <div class="players-col-header">Team 1</div>
              <div class="players-col-header">Team 2</div>
              ${positions.map(pos => `
                <div class="pos-label">${cap(pos)}</div>
                <input type="text" class="form-input" id="team1_${pos}" data-pos="team1_${pos}" placeholder="${cap(pos)}" value="${esc(saved?.players?.[`team1_${pos}`] ?? '')}">
                <input type="text" class="form-input" id="team2_${pos}" data-pos="team2_${pos}" placeholder="${cap(pos)}" value="${esc(saved?.players?.[`team2_${pos}`] ?? '')}">
              `).join('')}
            </div>
          </div>
        ` : ''}

        <button type="submit" class="btn-submit-form">Create Match</button>
      </form>`;

    main.querySelectorAll('.type-btn[data-type]').forEach(btn =>
      btn.addEventListener('click', () => {
        const sv = savedValues();
        selectedType = btn.dataset.type;
        bowls = null;
        renderForm(sv);
      })
    );

    main.querySelectorAll('.type-btn[data-bowls]').forEach(btn =>
      btn.addEventListener('click', () => {
        bowls = parseInt(btn.dataset.bowls);
        main.querySelectorAll('.type-btn[data-bowls]').forEach(b =>
          b.classList.toggle('active', parseInt(b.dataset.bowls) === bowls)
        );
      })
    );

    main.querySelectorAll('.type-btn[data-mode]').forEach(btn =>
      btn.addEventListener('click', () => {
        const sv = savedValues();
        scoringMode = btn.dataset.mode;
        renderForm(sv);
      })
    );

    main.querySelector('#create-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const submit = main.querySelector('.btn-submit-form');
      submit.disabled = true;
      submit.textContent = 'Creating…';
      try {
        const cfg2      = gameTypes[selectedType] ?? {};
        const positions = cfg2.positions ?? [];
        const body = {
          action:          'create',
          club_id:         clubId,
          game_type:       selectedType,
          bowls_per_player: bowls,
          scoring_mode:    scoringMode,
          target_score:    parseInt(main.querySelector('#target-input').value) || 21,
          team1_name:      main.querySelector('#team1-name').value.trim() || 'Team 1',
          team2_name:      main.querySelector('#team2-name').value.trim() || 'Team 2',
        };
        for (const pos of positions) {
          body[`team1_${pos}`] = main.querySelector(`#team1_${pos}`)?.value.trim() ?? '';
          body[`team2_${pos}`] = main.querySelector(`#team2_${pos}`)?.value.trim() ?? '';
        }
        const result = await api.post('/match.php', body);
        router.go(`matches?score=${result.match_id}`);
      } catch (err) {
        submit.disabled = false;
        submit.textContent = 'Create Match';
        showToast(err.message);
      }
    });
  }

  renderForm();
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function setShell(container, title) {
  container.innerHTML = `
    <div class="page page--matches">
      <header class="matches-header">
        <button class="back-btn" id="header-back">&#8592;</button>
        <h1>${esc(title)}</h1>
        <span></span>
      </header>
      <main class="matches-main">
        <div class="loader">Loading…</div>
      </main>
    </div>`;
}

function wireBack(container, path) {
  const btn = container.querySelector('#header-back');
  if (!btn) return;
  // Remove any previous listener by replacing the element
  const clone = btn.cloneNode(true);
  btn.replaceWith(clone);
  clone.addEventListener('click', () => path ? router.go(path) : history.back());
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function cap(s) {
  return String(s ?? '').charAt(0).toUpperCase() + String(s ?? '').slice(1);
}

function statusLabel(s) {
  return { setup: 'Setup', live: 'LIVE', completed: 'Done' }[s] ?? s;
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
