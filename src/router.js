/**
 * Lightweight hash-based router with query param support.
 * URL format: #/route?key=value
 */

import { showToast }       from './ui.js';
import { renderNotFound }  from './pages/not-found.js';
import { renderLogin }     from './pages/login.js';
import { renderRegister }  from './pages/register.js';
import { renderHome }      from './pages/home.js';
import { renderGame }      from './pages/game.js';
import { renderStats }      from './pages/stats.js';
import { renderChallenges } from './pages/challenges.js';
import { renderMatches }    from './pages/matches.js';
import { renderProfile }      from './pages/profile.js';
import { renderCompetitions } from './pages/competitions.js';

const routes = {
  '':           renderHome,
  'home':       renderHome,
  'login':      renderLogin,
  'register':   renderRegister,
  'game':       renderGame,
  'stats':      renderStats,
  'challenges': renderChallenges,
  'matches':    renderMatches,
  'profile':       renderProfile,
  'competitions':  renderCompetitions,
};

const app = document.getElementById('app');

function parseHash() {
  const hash   = window.location.hash.replace(/^#\/?/, '');
  const [path, query = ''] = hash.split('?');
  const params = query ? Object.fromEntries(new URLSearchParams(query)) : {};
  return { path, params };
}

async function navigate() {
  const { path, params } = parseHash();
  const render = routes[path] ?? renderNotFound;
  app.innerHTML = '';

  try {
    await render(app, params);
  } catch (err) {
    if (err.code === 'AUTH_EXPIRED') {
      window.location.hash = '#/login';
    } else {
      showToast(err.message ?? 'Something went wrong');
      // Replace frozen loader with an error state so the page isn't stuck
      if (!app.querySelector('.page')) {
        app.innerHTML = `<div style="padding:2rem;text-align:center;color:#666">${err.message ?? 'Something went wrong'}</div>`;
      }
    }
  }
}

window.addEventListener('hashchange', navigate);

export const router = {
  init: navigate,
  back: () => window.history.back(),
  go:   (path) => { window.location.hash = `#/${path}`; },
};
