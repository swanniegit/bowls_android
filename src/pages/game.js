import { api, loadTokens } from '../api/client.js';
import { router }          from '../router.js';
import '../css/game.css';

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function renderGame(container, params = {}) {
  if (!loadTokens()) {
    router.go('login');
    return;
  }

  if (params.id) {
    await renderRecording(container, parseInt(params.id));
  } else {
    renderSetup(container);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Setup form — create a new session
// ─────────────────────────────────────────────────────────────────────────────

function renderSetup(container) {
  const today = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="page page--game">
      <header class="app-header game-header">
        <button class="back-btn" id="setup-back-btn">&#8592;</button>
        <h1>New Game</h1>
        <span></span>
      </header>

      <main class="game-setup">
        <form id="setup-form" class="form-card" novalidate>

          <div class="form-group">
            <label>Hand</label>
            <div class="btn-group">
              <button type="button" class="btn-toggle" data-field="hand" data-value="L">Left</button>
              <button type="button" class="btn-toggle" data-field="hand" data-value="R">Right</button>
            </div>
            <input type="hidden" id="hand" name="hand" required>
          </div>

          <div class="form-group">
            <label>Date</label>
            <input type="date" id="session_date" name="session_date" value="${today}" required>
          </div>

          <div class="form-group">
            <label>Bowls per End</label>
            <div class="btn-group">
              <button type="button" class="btn-toggle" data-field="bowls_per_end" data-value="2">2</button>
              <button type="button" class="btn-toggle" data-field="bowls_per_end" data-value="3">3</button>
              <button type="button" class="btn-toggle active" data-field="bowls_per_end" data-value="4">4</button>
            </div>
            <input type="hidden" id="bowls_per_end" name="bowls_per_end" value="4">
          </div>

          <div class="form-group">
            <label>Number of Ends</label>
            <div class="btn-group">
              <button type="button" class="btn-toggle" data-field="total_ends" data-value="10">10</button>
              <button type="button" class="btn-toggle active" data-field="total_ends" data-value="15">15</button>
              <button type="button" class="btn-toggle" data-field="total_ends" data-value="21">21</button>
            </div>
            <input type="hidden" id="total_ends" name="total_ends" value="15">
          </div>

          <div class="form-group">
            <label>Description <span class="optional">(optional)</span></label>
            <input type="text" id="description" name="description" placeholder="e.g. Practice, League Match">
          </div>

          <div id="setup-error" class="form-group" hidden></div>

          <button type="submit" class="btn btn--primary" id="start-btn">Start Game</button>
        </form>
      </main>
    </div>
  `;

  // Back button
  container.querySelector('#setup-back-btn').addEventListener('click', () => router.go(''));

  // Toggle buttons
  container.querySelectorAll('.btn-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.field;
      container.querySelectorAll(`.btn-toggle[data-field="${field}"]`).forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      container.getElementById
        ? container.getElementById(field).value = btn.dataset.value
        : container.querySelector(`#${field}`).value = btn.dataset.value;
    });
  });

  const form     = container.querySelector('#setup-form');
  const errBox   = container.querySelector('#setup-error');
  const startBtn = container.querySelector('#start-btn');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errBox.hidden = true;

    const hand = form.querySelector('#hand').value;
    if (!hand) {
      errBox.textContent = 'Please select a hand';
      errBox.hidden = false;
      return;
    }

    startBtn.disabled   = true;
    startBtn.textContent = 'Starting…';

    try {
      const data = await api.post('/session.php', {
        hand,
        session_date:  form.querySelector('#session_date').value,
        bowls_per_end: parseInt(form.querySelector('#bowls_per_end').value),
        total_ends:    parseInt(form.querySelector('#total_ends').value),
        description:   form.querySelector('#description').value || null,
      });

      router.go(`game?id=${data.id}`);
    } catch (err) {
      errBox.textContent  = err.message;
      errBox.hidden       = false;
      startBtn.disabled   = false;
      startBtn.textContent = 'Start Game';
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Roll recording — the core game loop
// ─────────────────────────────────────────────────────────────────────────────

async function renderRecording(container, sessionId) {
  // Load session + existing rolls in parallel
  const [sessionData, rollsData] = await Promise.all([
    api.get(`/session.php?id=${sessionId}`),
    api.get(`/roll.php?session_id=${sessionId}`),
  ]);

  const session = sessionData.session;
  const state = {
    sessionId,
    session,
    rolls:            rollsData.rolls,
    currentEndLength: null,
    toucher:          false,
  };

  // Restore end length from existing rolls (handles page reload mid-end)
  restoreEndLength(state);

  mount(container, state);
}

function restoreEndLength(state) {
  const { rolls, session } = state;
  const bpe = session.bowls_per_end;
  if (rolls.length === 0 || rolls.length % bpe === 0) return; // at start of an end
  // Restore from the first roll of the current end (end_length is the same for all rolls in an end)
  const currentEndStart = Math.floor(rolls.length / bpe) * bpe;
  state.currentEndLength = rolls[currentEndStart]?.end_length ?? null;
}

// ─── Derived state helpers ────────────────────────────────────────────────────

function getProgress(state) {
  const { rolls, session, currentEndLength } = state;
  const bpe       = session.bowls_per_end;
  const totalEnds = session.total_ends;
  const total     = rolls.length;
  const maxRolls  = totalEnds * bpe;

  return {
    total,
    maxRolls,
    bpe,
    totalEnds,
    currentEnd:  Math.min(Math.floor(total / bpe) + 1, totalEnds),
    currentBowl: (total % bpe) + 1,
    percent:     Math.min((total / maxRolls) * 100, 100),
    complete:    total >= maxRolls,
    needLength:  total % bpe === 0 && total < maxRolls && currentEndLength === null,
  };
}

// ─── Mount & re-render ────────────────────────────────────────────────────────

function mount(container, state) {
  render(container, state);
}

function render(container, state) {
  const p = getProgress(state);

  if (p.complete) {
    renderComplete(container, state, p);
    return;
  }

  const handLabel = state.session.hand === 'L' ? 'Left' : 'Right';
  const dateStr   = new Date(state.session.session_date).toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric'
  });

  container.innerHTML = `
    <div class="page page--game">
      <header class="app-header game-header">
        <button class="back-btn" id="back-btn">&#8592;</button>
        <h1>Game</h1>
        <span class="roll-count" id="roll-count">${p.total}</span>
      </header>

      <main class="game-main">
        <div class="session-meta">
          <span class="badge">${handLabel}</span>
          <span class="meta-date">${dateStr}</span>
        </div>

        <div class="game-progress">
          <div class="progress-text">
            End <strong id="current-end">${p.currentEnd}</strong> of ${p.totalEnds}
            <span class="sep">|</span>
            Bowl <strong id="current-bowl">${p.needLength ? p.bpe : p.currentBowl}</strong> of ${p.bpe}
          </div>
          <div class="progress-track">
            <div class="progress-fill" id="progress-fill" style="width:${p.percent}%"></div>
          </div>
        </div>

        <!-- Step 1: End length (shown at start of each end) -->
        <div class="roll-step ${p.needLength ? '' : 'hidden'}" id="step-length">
          <h2>End ${p.currentEnd} — Length</h2>
          <div class="btn-group vertical">
            <button class="btn-choice" data-length="11">Short End</button>
            <button class="btn-choice" data-length="10">Middle End</button>
            <button class="btn-choice" data-length="9">Long End</button>
          </div>
        </div>

        <!-- Step 2: Bowl position -->
        <div class="roll-step ${p.needLength ? 'hidden' : ''}" id="step-bowl">
          <h2 id="bowl-heading">Bowl ${p.currentBowl}</h2>
          <div class="result-area">
            <div class="green-container">
              <button class="btn-miss btn-miss-top"    data-result="22">Too Long / Ditch</button>
              <button class="btn-miss btn-miss-left"   data-result="20">Too Far Left</button>
              <div class="green-grid">
                <button class="btn-pos" data-result="5">Long Left</button>
                <button class="btn-pos" data-result="7">Long Centre</button>
                <button class="btn-pos" data-result="6">Long Right</button>
                <button class="btn-pos" data-result="3">Level Left</button>
                <button class="btn-pos target" data-result="8">Centre</button>
                <button class="btn-pos" data-result="4">Level Right</button>
                <button class="btn-pos" data-result="1">Short Left</button>
                <button class="btn-pos" data-result="12">Short Centre</button>
                <button class="btn-pos" data-result="2">Short Right</button>
              </div>
              <button class="btn-miss btn-miss-right"  data-result="21">Too Far Right</button>
              <button class="btn-miss btn-miss-bottom" data-result="23">Too Short</button>
            </div>
            <button class="btn-toucher ${state.toucher ? 'active' : ''}" id="toucher-btn">
              ${state.toucher ? 'Toucher ✓' : 'Toucher'}
            </button>
          </div>
        </div>

        <div class="action-bar">
          <button class="btn btn--undo" id="undo-btn" ${p.total === 0 ? 'disabled' : ''}>
            Undo Last
          </button>
        </div>
      </main>
    </div>
  `;

  attachEvents(container, state);
}

function attachEvents(container, state) {
  const p = getProgress(state);

  // Back button
  container.querySelector('#back-btn').addEventListener('click', () => router.go(''));

  // End length selection
  container.querySelectorAll('.btn-choice[data-length]').forEach(btn => {
    btn.addEventListener('click', async () => {
      state.currentEndLength = parseInt(btn.dataset.length);
      btn.classList.add('selected');
      await sleep(120); // brief visual feedback
      render(container, state);
    });
  });

  // Bowl position / miss selection
  container.querySelectorAll('.btn-pos, .btn-miss').forEach(btn => {
    btn.addEventListener('click', () => saveRoll(container, state, parseInt(btn.dataset.result)));
  });

  // Toucher toggle
  const toucherBtn = container.querySelector('#toucher-btn');
  toucherBtn?.addEventListener('click', () => {
    state.toucher = !state.toucher;
    toucherBtn.classList.toggle('active', state.toucher);
    toucherBtn.textContent = state.toucher ? 'Toucher ✓' : 'Toucher';
  });

  // Undo
  container.querySelector('#undo-btn').addEventListener('click', () => undoRoll(container, state));
}

// ─── Save a roll ──────────────────────────────────────────────────────────────

async function saveRoll(container, state, result) {
  const p         = getProgress(state);
  const endNumber = p.currentEnd;

  // Disable all position buttons while saving
  container.querySelectorAll('.btn-pos, .btn-miss').forEach(b => { b.disabled = true; });

  try {
    await api.post('/roll.php', {
      session_id: state.sessionId,
      end_number: endNumber,
      end_length: state.currentEndLength,
      result,
      toucher:    state.toucher ? 1 : 0,
    });

    // Update local state — push a minimal roll object so getProgress() stays correct
    state.rolls.push({ end_number: endNumber, end_length: state.currentEndLength, result });
    state.toucher = false;

    const next = getProgress(state);
    if (next.complete) {
      render(container, state);
      return;
    }

    if (next.needLength) {
      state.currentEndLength = null; // next end needs a fresh length pick
    }

    // Flash the screen green briefly
    flashSuccess(container);
    render(container, state);

  } catch (err) {
    showError(container, err.message);
    container.querySelectorAll('.btn-pos, .btn-miss').forEach(b => { b.disabled = false; });
  }
}

// ─── Undo last roll ───────────────────────────────────────────────────────────

async function undoRoll(container, state) {
  const undoBtn = container.querySelector('#undo-btn');
  undoBtn.disabled = true;

  try {
    await api.delete(`/roll.php?session_id=${state.sessionId}&undo=1`);

    state.rolls.pop();
    restoreEndLength(state); // re-derive end length from remaining rolls
    render(container, state);
  } catch (err) {
    showError(container, err.message);
    undoBtn.disabled = false;
  }
}

// ─── Game complete screen ─────────────────────────────────────────────────────

function renderComplete(container, state, p) {
  container.innerHTML = `
    <div class="page page--game">
      <header class="app-header game-header">
        <button class="back-btn" onclick="history.back()">&#8592;</button>
        <h1>Game</h1>
        <span></span>
      </header>
      <main class="game-complete">
        <div class="complete-card">
          <div class="complete-icon">🎳</div>
          <h2>Game Complete!</h2>
          <p class="complete-meta">${p.totalEnds} ends &middot; ${p.total} bowls</p>
          <button class="btn btn--primary" id="stats-btn">View Statistics</button>
          <button class="btn btn--secondary" id="home-btn">Back to Home</button>
        </div>
      </main>
    </div>
  `;

  container.querySelector('#home-btn').addEventListener('click', () => router.go(''));
  container.querySelector('#stats-btn').addEventListener('click', () => router.go(`stats?id=${state.sessionId}`));
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function flashSuccess(container) {
  container.querySelector('.page--game')?.classList.add('flash-success');
  setTimeout(() => container.querySelector('.page--game')?.classList.remove('flash-success'), 300);
}

function showError(container, message) {
  let box = container.querySelector('.game-error');
  if (!box) {
    box = document.createElement('div');
    box.className = 'game-error';
    container.querySelector('.game-main')?.prepend(box);
  }
  box.textContent = message;
  box.hidden = false;
  setTimeout(() => { box.hidden = true; }, 4000);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
