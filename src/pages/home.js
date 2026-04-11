import { api, loadTokens } from '../api/client.js';
import { router } from '../router.js';

export async function renderHome(container, params = {}) {
  if (!loadTokens()) {
    router.go('login');
    return;
  }

  const cached = JSON.parse(localStorage.getItem('bt_player') || 'null');
  const greeting = cached?.name ? cached.name.split(' ')[0] : '';

  container.innerHTML = `
    <div class="page page--home">
      <header class="home-header">
        <img src="./assets/logo.png" alt="BowlsTracker" class="home-logo" />
        <div class="home-header__right">
          ${greeting ? `<span class="home-greeting">Hi, ${esc(greeting)}</span>` : ''}
          <button class="app-header__profile" id="profile-btn" title="Profile">&#128100;</button>
        </div>
      </header>
      <main class="home-grid">
        <a class="tile" href="#/game">
          <span class="tile__icon">🎯</span>
          <span class="tile__label">Practice</span>
        </a>
        <a class="tile" href="#/stats">
          <span class="tile__icon">📊</span>
          <span class="tile__label">Stats</span>
        </a>
        <a class="tile" href="#/challenges">
          <span class="tile__icon">🏆</span>
          <span class="tile__label">Challenges</span>
        </a>
        <a class="tile" href="#/matches">
          <span class="tile__icon">⚡</span>
          <span class="tile__label">Live Matches</span>
        </a>
        <a class="tile tile--wide" href="#/competitions">
          <span class="tile__icon">🏅</span>
          <span class="tile__label">Competitions</span>
        </a>
      </main>
    </div>
  `;

  container.querySelector('#profile-btn').addEventListener('click', () => router.go('profile'));
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
