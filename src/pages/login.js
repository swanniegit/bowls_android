import { api, setTokens } from '../api/client.js';
import { router }         from '../router.js';

export async function renderLogin(container, params = {}) {
  container.innerHTML = `
    <div class="page page--login">
      <div class="login-box">
        <div class="login-logo">
          <img src="./assets/logo.png" alt="BowlsTracker" />
        </div>
        <h1 class="login-title">BowlsTracker</h1>

        <form id="login-form" class="login-form" novalidate>
          <div class="form-group" id="error-msg" hidden></div>

          <label class="form-label" for="email">Email</label>
          <input class="form-input" type="email" id="email"
                 autocomplete="email" inputmode="email" required />

          <label class="form-label" for="password">Password</label>
          <input class="form-input" type="password" id="password"
                 autocomplete="current-password" required />

          <button class="btn btn--primary" type="submit" id="submit-btn">
            Sign In
          </button>
        </form>

        <p class="reg-login-link">
          Don't have an account?
          <button class="link-btn" id="go-register">Register</button>
        </p>
      </div>
    </div>
  `;

  const form      = container.querySelector('#login-form');
  const errorMsg  = container.querySelector('#error-msg');
  const submitBtn = container.querySelector('#submit-btn');

  container.querySelector('#go-register').addEventListener('click', () => router.go('register'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing in…';

    try {
      const data = await api.post('/auth.php?mode=token', {
        action: 'login',
        email: form.email.value.trim(),
        password: form.password.value,
      });

      setTokens(data.access_token, data.refresh_token);
      if (data.player) {
        localStorage.setItem('bt_player', JSON.stringify(data.player));
      }
      router.go('');
    } catch (err) {
      errorMsg.textContent = err.message;
      errorMsg.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }
  });
}
