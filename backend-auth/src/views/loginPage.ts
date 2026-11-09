import { escapeHtml, layout } from './html.js';

export function renderLoginPage(params: { requestId: string; error?: string; email?: string }): string {
  const error = params.error ? `<div class="error" role="alert">${escapeHtml(params.error)}</div>` : '';
  return layout(
    'Iniciar sesión — UniSabana',
    `<div class="brand">Universidad de La Sabana</div>
<h1>Iniciar sesión</h1>
<p class="muted">La app móvil solicita acceso a tu cuenta. Tus credenciales solo se envían a este servidor, nunca a la app.</p>
${error}
<form method="post" action="/oauth/authorize" autocomplete="on">
  <input type="hidden" name="request_id" value="${escapeHtml(params.requestId)}" />
  <label for="email">Correo institucional</label>
  <input id="email" name="email" type="email" inputmode="email" autocomplete="username" required value="${escapeHtml(params.email ?? '')}" />
  <label for="password">Contraseña</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required />
  <button type="submit" name="action" value="login">Autorizar e ingresar</button>
  <button type="submit" name="action" value="deny" class="secondary" formnovalidate>Cancelar</button>
</form>
<p class="hint">Flujo OAuth 2.0 Authorization Code + PKCE (RFC 7636)</p>`,
  );
}

export function renderErrorPage(title: string, message: string): string {
  return layout(
    title,
    `<div class="brand">Universidad de La Sabana</div>
<h1>${escapeHtml(title)}</h1>
<div class="error" role="alert">${escapeHtml(message)}</div>`,
  );
}
