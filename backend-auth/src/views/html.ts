export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { --brand: #0b3d91; --brand-dark: #072a63; --bg: #f3f5f9; --text: #1b1f29; --muted: #5b6475; --danger: #b42318; }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
         background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 16px; }
  .card { width: 100%; max-width: 380px; background: #fff; border-radius: 16px; padding: 28px 24px;
          box-shadow: 0 10px 30px rgba(11, 61, 145, .12); }
  .brand { font-weight: 700; color: var(--brand); letter-spacing: .5px; font-size: 14px; text-transform: uppercase; }
  h1 { font-size: 22px; margin: 6px 0 4px; }
  p.muted { color: var(--muted); font-size: 14px; margin: 0 0 20px; }
  label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
  input { width: 100%; padding: 12px; border: 1px solid #cfd5e1; border-radius: 10px; font-size: 16px; }
  input:focus { outline: 2px solid var(--brand); border-color: transparent; }
  button { width: 100%; margin-top: 20px; padding: 13px; border: 0; border-radius: 10px; font-size: 16px;
           font-weight: 600; cursor: pointer; background: var(--brand); color: #fff; }
  button:hover { background: var(--brand-dark); }
  button.secondary { background: transparent; color: var(--muted); margin-top: 8px; }
  .error { background: #fef3f2; color: var(--danger); border-radius: 10px; padding: 10px 12px; font-size: 14px; margin-bottom: 8px; }
  .hint { font-size: 12px; color: var(--muted); margin-top: 16px; text-align: center; }
  code { background: #eef1f6; padding: 2px 6px; border-radius: 6px; word-break: break-all; }
  .qr { display: flex; justify-content: center; margin: 12px 0; }
  .qr svg { width: 240px; height: 240px; }
</style>
</head>
<body>
<main class="card">
${body}
</main>
</body>
</html>`;
}
