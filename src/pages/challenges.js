import { api, loadTokens } from '../api/client.js';
import { router }          from '../router.js';
import '../css/game.css';       // reuse green grid styles
import '../css/challenges.css';

// ─── Constants (mirror PHP) ───────────────────────────────────────────────────

const SCORE_MAP = {
  8: 10, 3: 7, 4: 7, 7: 5, 12: 5, 5: 3, 6: 3, 1: 2, 2: 2,
  20: 0, 21: 0, 22: 0, 23: 0,
};

const END_LENGTH_NAMES = { 9: 'Long End', 10: 'Middle End', 11: 'Short End' };
const DELIVERY_NAMES   = { 13: 'Backhand', 14: 'Forehand' };

// ─────────────────────────────────────────────────────────────────────────────
// Entry point
// ─────────────────────────────────────────────────────────────────────────────

export async function renderChallenges(container, params = {}) {
  if (!loadTokens()) { router.go('login'); return; }

  if (params.result) {
    await showResults(container, parseInt(params.result));
  } else if (params.play) {
    await loadPlay(container, parseInt(params.play), parseInt(params.cid || 0));
  } else {
    await showList(container);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenge list
// ─────────────────────────────────────────────────────────────────────────────

async function showList(container) {
  container.innerHTML = shell('Challenges');

  const data       = await api.get('/challenge.php?action=list');
  const challenges = data.challenges ?? [];

  if (!challenges.length) {
    container.innerHTML = `
      <div class="page page--challenges">
        ${headerHTML('Challenges')}
        <main class="challenges-main">
          <div class="empty-state"><p>No challenges available yet.</p></div>
        </main>
      </div>
    `;
    container.querySelector('#back-btn').addEventListener('click', () => router.go(''));
    return;
  }

  container.innerHTML = `
    <div class="page page--challenges">
      ${headerHTML('Challenges')}
      <main class="challenges-main">
        <div class="challenge-list">
          ${challenges.map(challengeCard).join('')}
        </div>
      </main>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => router.go(''));
  container.querySelectorAll('.challenge-card').forEach(card => {
    card.addEventListener('click', () => beginChallenge(container, parseInt(card.dataset.id)));
  });
}

function challengeCard(c) {
  const maxScore = parseInt(c.max_possible_score) || 0;
  const best     = c.best_score;
  const active   = c.active_attempt;

  let statusHtml = '';
  if (active) {
    statusHtml = `<span class="ch-status ch-status--active">In progress — ${active.roll_count} bowl${active.roll_count == 1 ? '' : 's'}</span>`;
  } else if (best) {
    const pct = maxScore > 0 ? Math.round((best.total_score / maxScore) * 100) : 0;
    statusHtml = `<span class="ch-status ch-status--done">Best: ${best.total_score}/${maxScore} (${pct}%)</span>`;
  }

  return `
    <div class="challenge-card" data-id="${c.id}">
      <div class="ch-card-top">
        <span class="difficulty-badge difficulty-${esc(c.difficulty)}">${esc(c.difficulty)}</span>
        <span class="ch-bowls">${c.total_bowls ?? '?'} bowls · ${c.sequence_count ?? '?'} sequences</span>
      </div>
      <h3 class="ch-name">${esc(c.name)}</h3>
      ${c.description ? `<p class="ch-desc">${esc(c.description)}</p>` : ''}
      ${statusHtml}
    </div>
  `;
}

async function beginChallenge(container, challengeId) {
  // Dim the list while starting
  container.querySelectorAll('.challenge-card').forEach(c => {
    c.style.opacity = '0.5';
    c.style.pointerEvents = 'none';
  });

  try {
    const data = await api.post('/challenge.php', { action: 'start', challenge_id: challengeId });
    router.go(`challenges?play=${data.attempt_id}&cid=${challengeId}`);
  } catch (err) {
    container.querySelectorAll('.challenge-card').forEach(c => {
      c.style.opacity = '';
      c.style.pointerEvents = '';
    });
    showInlineError(container, '.challenges-main', err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenge play
// ─────────────────────────────────────────────────────────────────────────────

async function loadPlay(container, attemptId, challengeId) {
  container.innerHTML = shell('Challenge');

  const [progressData, challengeData] = await Promise.all([
    api.get(`/challenge.php?action=progress&attempt_id=${attemptId}`),
    api.get(`/challenge.php?action=get&id=${challengeId}`),
  ]);

  const challenge = challengeData.challenge;
  const progress  = progressData.progress;

  const state = {
    attemptId,
    challengeId,
    challengeName: challenge.name,
    sequences:     challenge.sequences,
    totalBowls:    challenge.total_bowls,
    maxPossible:   challenge.max_possible_score,
    scoringType:   challenge.scoring_type ?? 'standard',
    rollCount:     progress.roll_count   ?? 0,
    totalScore:    progress.total_score  ?? 0,
    toucher:       false,
    seqModal:      false,
    seqModalData:  null,
    prevSeqIndex:  null,
  };

  renderPlayView(container, state);
}

function getPosition(sequences, rollCount) {
  let processed = 0;
  for (let i = 0; i < sequences.length; i++) {
    const bc = parseInt(sequences[i].bowl_count);
    if (processed + bc > rollCount) {
      return { seqIndex: i, seq: sequences[i], bowlInSeq: rollCount - processed + 1, bowlsInSeq: bc, complete: false };
    }
    processed += bc;
  }
  return { complete: true, seqIndex: sequences.length };
}

function renderPlayView(container, state) {
  const pos = getPosition(state.sequences, state.rollCount);

  if (pos.complete) {
    router.go(`challenges?result=${state.attemptId}`);
    return;
  }

  const pct          = state.totalBowls > 0 ? Math.round((state.rollCount / state.totalBowls) * 100) : 0;
  const deliveryCls  = pos.seq.delivery == 14 ? 'delivery-forehand' : 'delivery-backhand';

  container.innerHTML = `
    <div class="page page--challenges">
      <header class="app-header challenge-header">
        <button class="back-btn" id="back-btn">&#8592;</button>
        <h1>${esc(state.challengeName)}</h1>
        <span class="score-badge">${state.totalScore}</span>
      </header>

      <main class="challenge-play-main">
        <div class="challenge-info">
          <div class="sequence-info">
            <span class="sequence-text">
              Seq <strong>${pos.seqIndex + 1}/${state.sequences.length}</strong>
              <span class="sep">|</span>
              Bowl <strong>${pos.bowlInSeq}/${pos.bowlsInSeq}</strong>
            </span>
            <span class="end-length-indicator">${END_LENGTH_NAMES[pos.seq.end_length] ?? ''}</span>
            <span class="delivery-indicator ${deliveryCls}">${DELIVERY_NAMES[pos.seq.delivery] ?? ''}</span>
          </div>

          <div class="score-display">
            <span class="score-current">${state.totalScore}</span>
            <span class="score-sep"> / </span>
            <span class="score-max">${state.maxPossible}</span>
          </div>

          <div class="progress-track" style="margin-top:0.5rem">
            <div class="progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="progress-detail">
            <span>${state.rollCount}/${state.totalBowls} bowls</span>
            <span>${pct}%</span>
          </div>
        </div>

        ${state.scoringType === 'trail_rest' ? `
        <div class="trail-rest-options">
          <button class="btn-trail-rest btn-trail" data-result="30">
            <span class="trail-pts">3 pts</span>
            <span class="trail-label">Successful Trail</span>
          </button>
          <button class="btn-trail-rest btn-touch" data-result="31">
            <span class="trail-pts">2 pts</span>
            <span class="trail-label">Resting Touch</span>
          </button>
          <button class="btn-trail-rest btn-near" data-result="32">
            <span class="trail-pts">1 pt</span>
            <span class="trail-label">Within Mat Width</span>
          </button>
          <button class="btn-trail-rest btn-none" data-result="33">
            <span class="trail-pts">0 pts</span>
            <span class="trail-label">None</span>
          </button>
        </div>
        ` : `
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
        `}

        <div class="action-bar challenge-action-bar">
          <button class="btn btn--undo" id="undo-btn" ${state.rollCount === 0 ? 'disabled' : ''}>
            Undo Last
          </button>
          <button class="btn btn--secondary" id="quit-btn">Quit</button>
        </div>
      </main>

      <div class="score-popup" id="score-popup"></div>

      ${state.seqModal ? seqModalHTML(state.seqModalData, state.sequences.length) : ''}
    </div>
  `;

  // Back / quit
  container.querySelector('#back-btn').addEventListener('click', () => router.go('challenges'));
  container.querySelector('#quit-btn').addEventListener('click', () => router.go('challenges'));

  // Toucher (standard challenges only)
  const toucherBtn = container.querySelector('#toucher-btn');
  toucherBtn?.addEventListener('click', () => {
    state.toucher = !state.toucher;
    toucherBtn.classList.toggle('active', state.toucher);
    toucherBtn.textContent = state.toucher ? 'Toucher ✓' : 'Toucher';
  });

  // Undo
  container.querySelector('#undo-btn').addEventListener('click', () => undoRoll(container, state));

  // Bowl positions — standard grid or trail_rest buttons
  if (state.scoringType === 'trail_rest') {
    container.querySelectorAll('.btn-trail-rest').forEach(btn => {
      btn.addEventListener('click', () => saveRoll(container, state, parseInt(btn.dataset.result)));
    });
  } else {
    container.querySelectorAll('.btn-pos, .btn-miss').forEach(btn => {
      btn.addEventListener('click', () => saveRoll(container, state, parseInt(btn.dataset.result)));
    });
  }

  // Sequence modal dismiss
  if (state.seqModal) {
    container.querySelector('#seq-modal-ready')?.addEventListener('click', () => {
      state.seqModal    = false;
      state.seqModalData = null;
      renderPlayView(container, state);
    });
  }
}

function seqModalHTML(data, seqCount) {
  if (!data) return '';
  const deliveryCls = data.delivery == 14 ? 'delivery-forehand' : 'delivery-backhand';
  return `
    <div class="sequence-modal-overlay show">
      <div class="sequence-modal">
        <h2>New Sequence</h2>
        <div class="sequence-modal-number">Sequence ${data.seqIndex + 1} / ${seqCount}</div>
        <div class="sequence-modal-details">
          <span class="sequence-modal-length">${END_LENGTH_NAMES[data.endLength] ?? ''}</span>
          <span class="sequence-modal-delivery ${deliveryCls}">${DELIVERY_NAMES[data.delivery] ?? ''}</span>
        </div>
        <div class="sequence-modal-bowls">${data.bowlCount} bowl${data.bowlCount == 1 ? '' : 's'}</div>
        <button class="btn btn--primary sequence-modal-btn" id="seq-modal-ready">Ready</button>
      </div>
    </div>
  `;
}

async function saveRoll(container, state, result) {
  container.querySelectorAll('.btn-pos, .btn-miss, .btn-trail-rest').forEach(b => { b.disabled = true; });

  const pos = getPosition(state.sequences, state.rollCount);

  try {
    const data = await api.post('/challenge.php', {
      action:     'roll',
      attempt_id: state.attemptId,
      end_length: parseInt(pos.seq.end_length),
      delivery:   parseInt(pos.seq.delivery),
      result,
      toucher:    state.toucher ? 1 : 0,
    });

    const score = data.roll?.score ?? 0;
    showScorePopup(container, score);

    const prevSeqIndex = pos.seqIndex;
    state.rollCount  = data.progress.roll_count;
    state.totalScore = data.progress.total_score;
    state.toucher    = false;

    if (data.progress.is_complete) {
      await sleep(600); // let score popup finish
      router.go(`challenges?result=${state.attemptId}`);
      return;
    }

    const nextPos = getPosition(state.sequences, state.rollCount);
    if (!nextPos.complete && nextPos.seqIndex !== prevSeqIndex) {
      state.seqModal    = true;
      state.seqModalData = {
        seqIndex:  nextPos.seqIndex,
        endLength: nextPos.seq.end_length,
        delivery:  nextPos.seq.delivery,
        bowlCount: nextPos.bowlsInSeq,
      };
    }

    await sleep(400); // let score popup show
    renderPlayView(container, state);

  } catch (err) {
    showInlineError(container, '.challenge-play-main', err.message);
    container.querySelectorAll('.btn-pos, .btn-miss').forEach(b => { b.disabled = false; });
  }
}

async function undoRoll(container, state) {
  const undoBtn = container.querySelector('#undo-btn');
  if (undoBtn) undoBtn.disabled = true;

  try {
    const data = await api.delete(`/challenge.php?attempt_id=${state.attemptId}&undo=1`);
    state.rollCount  = data.progress.roll_count;
    state.totalScore = data.progress.total_score;
    state.seqModal   = false;
    renderPlayView(container, state);
  } catch (err) {
    showInlineError(container, '.challenge-play-main', err.message);
    if (undoBtn) undoBtn.disabled = false;
  }
}

function showScorePopup(container, score) {
  const popup = container.querySelector('#score-popup');
  if (!popup) return;
  popup.textContent = score > 0 ? `+${score}` : '0';
  popup.classList.add('show');
  setTimeout(() => popup.classList.remove('show'), 700);
}

// ─────────────────────────────────────────────────────────────────────────────
// Challenge results
// ─────────────────────────────────────────────────────────────────────────────

async function showResults(container, attemptId) {
  container.innerHTML = shell('Results');

  const data      = await api.get(`/challenge.php?action=breakdown&attempt_id=${attemptId}`);
  const attempt   = data.attempt;
  const breakdown = data.breakdown ?? [];

  const maxPossible = parseInt(attempt.max_possible_score) || 1;
  const totalScore  = parseInt(attempt.total_score)        || 0;
  const pct         = Math.round((totalScore / maxPossible) * 100);

  container.innerHTML = `
    <div class="page page--challenges">
      ${headerHTML('Results')}
      <main class="challenges-main">

        <div class="results-card">
          <div class="results-header">
            <h2>${esc(attempt.challenge_name ?? 'Challenge')}</h2>
            <p><span class="difficulty-badge difficulty-${esc(attempt.difficulty)}">${esc(attempt.difficulty)}</span></p>
          </div>
          <div class="score-big">${totalScore}<span class="score-max">/${maxPossible}</span></div>
          <div class="score-percentage">${pct}%</div>
        </div>

        ${breakdown.length ? `
        <div class="breakdown-section">
          <div class="breakdown-title">Score by Sequence</div>
          <div class="breakdown-list">
            ${breakdown.map((b, i) => {
              const bowlCount = parseInt(b.bowl_count) || 0;
              const seqMax    = bowlCount * 15; // max = 10 centre + 5 toucher
              const seqScore  = parseInt(b.score) || 0;
              const seqPct    = seqMax > 0 ? Math.round((seqScore / seqMax) * 100) : 0;
              return `
                <div class="breakdown-item">
                  <div class="breakdown-item-header">
                    <span class="breakdown-item-desc">
                      Seq ${i + 1}: ${END_LENGTH_NAMES[b.end_length] ?? ''} · ${DELIVERY_NAMES[b.delivery] ?? ''} (${bowlCount} bowls)
                    </span>
                    <span class="breakdown-item-score">${seqScore}</span>
                  </div>
                  <div class="breakdown-progress">
                    <div class="breakdown-progress-fill" style="width:${seqPct}%"></div>
                  </div>
                  <div class="breakdown-percentage">${seqPct}%</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
        ` : ''}

        <div class="action-buttons">
          <button class="btn btn--secondary" id="try-again-btn">Try Again</button>
          <button class="btn btn--primary"   id="list-btn">All Challenges</button>
        </div>
      </main>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => router.go('challenges'));
  container.querySelector('#list-btn').addEventListener('click', () => router.go('challenges'));

  container.querySelector('#try-again-btn').addEventListener('click', async () => {
    const btn = container.querySelector('#try-again-btn');
    btn.disabled    = true;
    btn.textContent = 'Starting…';
    try {
      const data = await api.post('/challenge.php', {
        action:       'start',
        challenge_id: parseInt(attempt.challenge_id),
      });
      router.go(`challenges?play=${data.attempt_id}&cid=${attempt.challenge_id}`);
    } catch (err) {
      btn.disabled    = false;
      btn.textContent = 'Try Again';
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Utilities
// ─────────────────────────────────────────────────────────────────────────────

function headerHTML(title) {
  return `
    <header class="app-header challenge-header">
      <button class="back-btn" id="back-btn">&#8592;</button>
      <h1>${esc(title)}</h1>
      <span></span>
    </header>
  `;
}

function shell(title) {
  return `
    <div class="page page--challenges">
      <header class="app-header challenge-header">
        <button class="back-btn" onclick="history.back()">&#8592;</button>
        <h1>${esc(title)}</h1>
        <span></span>
      </header>
      <main class="challenges-main"><p class="loading-text">Loading…</p></main>
    </div>
  `;
}

function showInlineError(container, parentSelector, msg) {
  const parent = container.querySelector(parentSelector);
  if (!parent) return;
  let box = container.querySelector('.game-error');
  if (!box) {
    box = document.createElement('div');
    box.className = 'game-error';
    parent.prepend(box);
  }
  box.textContent = msg;
  box.hidden = false;
  setTimeout(() => { box.hidden = true; }, 4000);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
