/**
 * Lightweight UI utilities — replaces browser alert() / confirm()
 *
 * showToast(message, type)  — brief snack-bar notification
 * showConfirm(message)      — bottom-sheet confirm, returns Promise<boolean>
 */

// ─── Toast ────────────────────────────────────────────────────────────────────

export function showToast(message, type = 'error') {
  document.querySelector('.bt-toast')?.remove();

  const toast = document.createElement('div');
  toast.className = `bt-toast bt-toast--${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Next frame so the CSS transition fires
  requestAnimationFrame(() =>
    requestAnimationFrame(() => toast.classList.add('bt-toast--visible'))
  );

  const timer = setTimeout(() => dismiss(toast), 3500);
  toast.addEventListener('click', () => { clearTimeout(timer); dismiss(toast); });
}

function dismiss(toast) {
  toast.classList.remove('bt-toast--visible');
  toast.addEventListener('transitionend', () => toast.remove(), { once: true });
}

// ─── Confirm ──────────────────────────────────────────────────────────────────

export function showConfirm(message, confirmLabel = 'Confirm', danger = false) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'bt-confirm-overlay';
    overlay.innerHTML = `
      <div class="bt-confirm" role="dialog" aria-modal="true">
        <p class="bt-confirm__msg">${esc(message)}</p>
        <div class="bt-confirm__btns">
          <button class="bt-confirm__cancel">Cancel</button>
          <button class="bt-confirm__ok ${danger ? 'bt-confirm__ok--danger' : ''}">${esc(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const done = (result) => { overlay.remove(); resolve(result); };

    overlay.querySelector('.bt-confirm__cancel').addEventListener('click', () => done(false));
    overlay.querySelector('.bt-confirm__ok').addEventListener('click',     () => done(true));
    overlay.addEventListener('click', e => { if (e.target === overlay) done(false); });
  });
}

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
