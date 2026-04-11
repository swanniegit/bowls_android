import { api }       from '../api/client.js';
import { router }    from '../router.js';
import { showToast } from '../ui.js';

export async function renderRegister(container) {
  container.innerHTML = `
    <div class="page page--login">
      <div class="login-box">
        <div class="login-logo">
          <img src="./assets/logo.png" alt="BowlsTracker" />
        </div>
        <h1 class="login-title">Create Account</h1>

        <form id="reg-form" class="login-form" novalidate>
          <div class="form-group" id="error-msg" hidden></div>

          <label class="form-label" for="name">Full Name</label>
          <input class="form-input" type="text" id="name"
                 autocomplete="name" inputmode="text" required />

          <label class="form-label" for="email">Email</label>
          <input class="form-input" type="email" id="email"
                 autocomplete="email" inputmode="email" required />

          <label class="form-label" for="password">Password</label>
          <input class="form-input" type="password" id="password"
                 autocomplete="new-password" required />

          <label class="form-label" for="confirm">Confirm Password</label>
          <input class="form-input" type="password" id="confirm"
                 autocomplete="new-password" required />

          <div class="hand-toggle-wrap">
            <span class="form-label">Bowling Hand</span>
            <div class="hand-toggle">
              <button type="button" class="hand-btn active" data-hand="R">Right</button>
              <button type="button" class="hand-btn"        data-hand="L">Left</button>
            </div>
          </div>

          <button class="btn btn--primary" type="submit" id="submit-btn">
            Register
          </button>
        </form>

        <p class="reg-login-link">
          Already have an account?
          <button class="link-btn" id="go-login">Sign in</button>
        </p>
      </div>
    </div>
  `;

  const form      = container.querySelector('#reg-form');
  const errorMsg  = container.querySelector('#error-msg');
  const submitBtn = container.querySelector('#submit-btn');
  let   hand      = 'R';

  // Hand toggle
  container.querySelectorAll('.hand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      hand = btn.dataset.hand;
      container.querySelectorAll('.hand-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.hand === hand)
      );
    });
  });

  container.querySelector('#go-login').addEventListener('click', () => router.go('login'));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorMsg.hidden = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering…';

    try {
      const data = await api.post('/auth.php?mode=token', {
        action:           'register',
        name:             form.name.value.trim(),
        email:            form.email.value.trim(),
        password:         form.password.value,
        confirm_password: form.confirm.value,
        hand,
      });

      showToast(data.message ?? 'Account created! Check your email to verify.', 'success');
      router.go('login');
    } catch (err) {
      errorMsg.textContent = err.message;
      errorMsg.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register';
    }
  });
}
