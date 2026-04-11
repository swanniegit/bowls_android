import { api, loadTokens, clearTokens } from '../api/client.js';
import { router } from '../router.js';

export async function renderProfile(container) {
  if (!loadTokens()) { router.go('login'); return; }

  // Show cached name immediately while we load fresh data
  const cached = JSON.parse(localStorage.getItem('bt_player') || 'null');

  container.innerHTML = `
    <div class="page page--profile">
      <header class="matches-header">
        <button class="back-btn" id="back-btn">&#8592;</button>
        <h1>Profile</h1>
        <span></span>
      </header>
      <main class="profile-main">
        ${cached ? avatarHTML(cached.name) + '<div class="profile-loading">Loading…</div>' : '<div class="loader">Loading…</div>'}
      </main>
    </div>`;

  container.querySelector('#back-btn').addEventListener('click', () => history.back());

  let player;
  try {
    const data = await api.get('/auth.php?action=me');
    player = data.player;
  } catch (err) {
    container.querySelector('.profile-main').innerHTML =
      `<div class="empty-state"><p>${err.message}</p></div>`;
    return;
  }

  // Refresh cache
  localStorage.setItem('bt_player', JSON.stringify({
    id: player.id, name: player.name, hand: player.hand,
  }));

  const main = container.querySelector('.profile-main');
  main.innerHTML = `
    ${avatarHTML(player.name)}

    <div class="profile-info">
      <div class="info-row">
        <span class="info-label">Name</span>
        <span class="info-value">${esc(player.name)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Email</span>
        <span class="info-value">${esc(player.email)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Preferred hand</span>
        <span class="info-value">${player.hand === 'L' ? 'Left' : 'Right'}</span>
      </div>
    </div>

    <button class="btn-logout" id="logout-btn">Log Out</button>
  `;

  main.querySelector('#logout-btn').addEventListener('click', async () => {
    const refreshToken = localStorage.getItem('bt_refresh');
    if (refreshToken) {
      try {
        await api.post('/auth.php', { action: 'revoke', refresh_token: refreshToken });
      } catch (_) {}
    }
    clearTokens();
    localStorage.removeItem('bt_player');
    router.go('login');
  });
}

function avatarHTML(name) {
  const initials = (name ?? '?')
    .split(' ')
    .map(w => w[0] ?? '')
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return `
    <div class="profile-avatar-wrap">
      <div class="profile-avatar">${initials}</div>
      <div class="profile-name">${esc(name)}</div>
    </div>`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
