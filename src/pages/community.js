import { router } from '../router.js';
import '../css/community.css';

const FB_GROUP = 'https://www.facebook.com/groups/1945948999340245';

const UPDATES = [
  {
    version: '1.0',
    date: 'April 2026',
    notes: [
      'First release — Practice sessions, Stats, Challenges, Live Matches & Competitions',
      'Trail & Rest Drill added with weight control scoring',
      'Android app launched on Google Play',
    ],
  },
];

export function renderCommunity(container) {
  container.innerHTML = `
    <div class="page page--community">
      <header class="app-header community-header">
        <button class="back-btn" id="back-btn">&#8592;</button>
        <h1>The Green</h1>
        <span></span>
      </header>

      <main class="community-main">

        <div class="community-hero">
          <div class="community-icon">⛳</div>
          <h2>The Green Community</h2>
          <p>Connect with bowlers, share your progress, and get the latest updates straight from the developer.</p>
        </div>

        <button class="btn-fb" id="fb-btn">
          <span class="fb-icon">f</span>
          Join us on Facebook
        </button>

        <div class="updates-section">
          <h3 class="updates-title">App Updates</h3>
          ${UPDATES.map(u => `
            <div class="update-card">
              <div class="update-header">
                <span class="update-version">v${u.version}</span>
                <span class="update-date">${u.date}</span>
              </div>
              <ul class="update-notes">
                ${u.notes.map(n => `<li>${n}</li>`).join('')}
              </ul>
            </div>
          `).join('')}
        </div>

      </main>
    </div>
  `;

  container.querySelector('#back-btn').addEventListener('click', () => history.back());
  container.querySelector('#fb-btn').addEventListener('click', () => {
    window.open(FB_GROUP, '_blank', 'noopener');
  });
}
