export async function renderNotFound(container) {
  container.innerHTML = `
    <div class="page page--centered">
      <p class="text-muted">Page not found</p>
      <a href="#/">Go home</a>
    </div>
  `;
}
