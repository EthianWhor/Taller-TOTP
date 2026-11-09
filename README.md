# Taller — Seguridad Móvil: OAuth 2.0 con PKCE y Step-Up 2FA (TOTP)

**Curso:** Desarrollo Móvil (React Native) — Universidad de La Sabana, Facultad de Ingeniería
**Sesión 14:** Autenticación Móvil, Tokens y Seguridad de Recursos
**Integrante:** Ethian Daniel White Ortiz
**Plataforma de ejecución:** Expo Go (React Native)

Arquitectura de seguridad móvil completa y **sin librerías "caja negra"**:

| # | Punto de trabajo | Dónde está |
|---|------------------|------------|
| 1 | OAuth 2.0 Authorization Code + **PKCE (RFC 7636)** con navegador del sistema, deep link y `state` anti-CSRF | `mobile-app/src/auth/`, `backend-auth/src/routes/oauth.ts` |
| 2 | `access_token` solo en RAM, `refresh_token` en **Keychain / Keystore** y **Silent Refresh Queue** | `mobile-app/src/auth/sessionManager.ts`, `mobile-app/src/api/httpClient.ts` |
| 3 | **Authenticator propio (RFC 6238)**: HMAC-SHA1 + truncamiento dinámico desde cero, 100 % offline | `mobile-app/src/crypto/`, `mobile-app/src/screens/AuthenticatorScreen.tsx` |
| 4 | **Step-Up Authentication** y backend **Anti-Replay** (409) | `backend-auth/src/routes/vault.ts`, `backend-auth/src/routes/mfa.ts` |

```
Taller-TOTP/
├── backend-auth/   Servidor de autorización + API (Node.js · Express 5 · TypeScript)
└── mobile-app/     App móvil (Expo SDK 58 · React Native · TypeScript estricto)
```

---

## 1. Arquitectura y flujo

```
 App móvil (Expo)                       Navegador del sistema              backend-auth (Express)
 ────────────────                       ─────────────────────              ──────────────────────
 code_verifier ← CSPRNG (64 B)
 code_challenge = B64URL(SHA256(v))
 state ← CSPRNG (32 B)
 openAuthSessionAsync ───────────────▶  GET /oauth/authorize?…&code_challenge&state ─▶ página de login
                                        POST /oauth/authorize (usuario + contraseña) ─▶ emite code (60 s, 1 uso)
 ◀──── unisabana-auth://callback?code=…&state=… (deep link) ◀─────────────────────────── 302
 valida state (si no coincide → ABORTA)
 POST /auth/oauth/token {code, code_verifier} ──────────────────────────────────────▶ SHA256(v) == challenge
 ◀──── access_token (5 min, RAM) + refresh_token (30 días, SecureStore) ◀────────────

 GET /api/boveda-critica (access_token) ────────────────────────────────────────────▶ 403 mfa_required + step_up_token
 TOTP local = HOTP(secreto, floor(t/30))   ← sin red / Modo Avión
 POST /auth/mfa/verify {step_up_token, code} ───────────────────────────────────────▶ ventanas C-1, C, C+1
                                                                                       caché Anti-Replay (90 s)
 ◀──── elevated_token (mfa_verified: true, 10 min) ◀────────────────────────────────
 GET /api/boveda-critica (elevated_token) ──────────────────────────────────────────▶ 200 datos sensibles
 Reenvío del mismo código ──────────────────────────────────────────────────────────▶ 409 Replay Attack Detected
```

### Endpoints del backend

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/oauth/authorize` | Inicia el flujo. Valida `client_id`, `redirect_uri` (lista blanca exacta), `state` y `code_challenge_method=S256`. Muestra el login. |
| `POST` | `/oauth/authorize` | Envío del formulario de login; redirige al deep link con `code` y `state`. |
| `POST` | `/auth/oauth/token` | Canje `code` + `code_verifier`. Código de un solo uso; si se reutiliza se revoca la sesión emitida. |
| `POST` | `/auth/refresh` | Rota el `refresh_token`. Reutilizar uno ya rotado revoca toda la sesión. |
| `POST` | `/auth/logout` | Revoca la sesión (familia de refresh tokens). |
| `GET` | `/api/me` | Recurso protegido estándar (Bearer). |
| `GET` | `/api/boveda-critica` (alias `/api/boveda`) | Recurso crítico: `403 mfa_required` + `step_up_token` sin MFA. |
| `POST` | `/auth/mfa/verify` | Verifica TOTP (C-1, C, C+1), Anti-Replay `409`, máx. 5 intentos. Devuelve `elevated_token`. |
| `GET` | `/enroll` | **Solo laboratorio:** QR `otpauth://` del usuario demo. |
| `GET` | `/health` | Estado del servidor. |

---

## 2. Requisitos

- **Node.js 20.12 o superior** (probado con Node 22) y npm.
- Teléfono con **Expo Go** (SDK 58) o un emulador Android / simulador iOS.
- Teléfono y computador en la **misma red Wi-Fi** (si se usa un dispositivo físico).
- Opcional: **Google Authenticator** para la prueba de paridad.

---

## 3. Ejecutar el backend (`/backend-auth`)

```bash
cd backend-auth
npm install
cp .env.example .env        # y edítalo (ver tabla abajo)
npm run dev                 # http://0.0.0.0:4000 con recarga automática
```

Para producción: `npm run build && npm start`.

### Variables de entorno (`backend-auth/.env`)

| Variable | Valor por defecto | Descripción |
|----------|-------------------|-------------|
| `PORT` / `HOST` | `4000` / `0.0.0.0` | Puerto e interfaz de escucha (`0.0.0.0` para que el teléfono lo alcance). |
| `PUBLIC_BASE_URL` | `http://localhost:4000` | URL con la que el teléfono ve el backend. |
| `JWT_SECRET` | aleatorio por arranque | Secreto HS256 (≥ 32 caracteres). Obligatorio con `NODE_ENV=production`. Genera uno con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`. |
| `OAUTH_CLIENT_ID` | `unisabana-mobile` | Cliente público (no existe `client_secret`). |
| `ALLOWED_REDIRECT_URIS` | `unisabana-auth://callback` | Redirect URIs permitidos (separados por coma, comparación exacta). |
| `ALLOW_EXPO_DEV_REDIRECTS` | `true` fuera de producción | Admite `exp://<ip>:<puerto>/--/callback`. **Necesario para Expo Go.** |
| `ACCESS_TOKEN_TTL_SECONDS` | `300` | Vida del `access_token` (5 min). Bájalo a `30` para demostrar el Silent Refresh. |
| `REFRESH_TOKEN_TTL_SECONDS` | `2592000` | Vida del `refresh_token` (30 días). |
| `ELEVATED_TOKEN_TTL_SECONDS` | `600` | Vida del `elevated_token` (10 min). |
| `STEP_UP_TOKEN_TTL_SECONDS` | `300` | Vida del `step_up_token`. |
| `AUTH_CODE_TTL_SECONDS` | `60` | Vida del authorization code. |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | `estudiante@unisabana.edu.co` / `Sabana2026*` | Usuario de demostración. |
| `DEMO_TOTP_SECRET` | `JBSWY3DPEHPK3PXP` | Semilla Base32 del usuario demo. |
| `TOTP_ISSUER` | `UniSabana` | Emisor que aparece en los autenticadores. |
| `ENABLE_ENROLL_PAGE` | `true` fuera de producción | Habilita `GET /enroll` con el QR. |

Pruebas: `npm test` (Vitest + Supertest, 68 casos con vectores de los RFC) y `npm run typecheck`.

---

## 4. Ejecutar la app (`/mobile-app`)

La app se ejecuta con **Expo Go** (SDK 58). Instálalo desde App Store / Google Play.

```bash
cd mobile-app
npm install
cp .env.example .env        # define EXPO_PUBLIC_API_URL
npx expo start              # escanea el QR de la terminal con Expo Go
```

En Android abre Expo Go y usa *Scan QR code*; en iOS escanea el QR con la cámara del iPhone.

`EXPO_PUBLIC_API_URL` según el dispositivo:

| Dispositivo | Valor |
|-------------|-------|
| Teléfono físico | `http://<IP-LAN-del-computador>:4000` (ej. `http://192.168.1.10:4000`) |
| Emulador Android | `http://10.0.2.2:4000` |
| Simulador iOS | `http://localhost:4000` |

### Deep link / redirect URI en Expo Go

Expo Go no puede registrar un esquema propio, así que el navegador regresa a la app por el deep link que asigna Expo:
`exp://<IP-del-computador>:8081/--/callback`.

- La app lo calcula con `Linking.createURL('callback')`.
- El backend lo acepta porque `ALLOW_EXPO_DEV_REDIRECTS=true` (valor por defecto fuera de producción). **No lo desactives** en `backend-auth/.env`.
- El esquema propio `unisabana-auth://callback` ya está configurado en `app.json`. Se usaría automáticamente, sin cambiar código, si algún día se compila un development build.

Pruebas: `npm test` (51 casos: TOTP, HMAC, Base32, PKCE, callback y la cola de Silent Refresh) y `npm run typecheck`.

---

## 5. Guion de la sustentación (5 pruebas de aceptación)

Antes de empezar: backend corriendo y app abierta. En el computador, abre `http://<IP>:4000/enroll`.

| # | Prueba | Cómo demostrarla | Resultado esperado |
|---|--------|------------------|--------------------|
| 1 | **OAuth + PKCE con navegador del sistema** | En la app pulsa **Iniciar sesión**. Se abre ASWebAuthenticationSession / Custom Tabs; ingresa `estudiante@unisabana.edu.co` / `Sabana2026*`. | La app vuelve por el deep link `exp://…/--/callback` y muestra **Inicio**; el `refresh_token` queda en SecureStore (la tarjeta *Sesión* lo indica). |
| 2 | **Paridad con Google Authenticator** | Escanea el QR de `/enroll` con Google Authenticator y con la app (**Autenticador → Agregar → Escanear QR**). En emulador, usa **Ingresar semilla** con `JBSWY3DPEHPK3PXP`. | Ambas muestran los mismos 6 dígitos al mismo tiempo. |
| 3 | **Cálculo offline (Modo Avión)** | Activa el Modo Avión y abre **Autenticador** (también está disponible desde Bienvenida, sin sesión). Espera a que la barra llegue a 0. | El código se regenera sin errores ni peticiones de red. |
| 4 | **Step-Up & Bóveda** | Desde Inicio pulsa **Abrir Bóveda Crítica**. La API responde 403 y se abre el modal 2FA. Escribe el código (o tócalo desde *Usar el código de mi autenticador local*). | La bóveda solo se abre tras verificar el TOTP; muestra la cuenta regresiva del `elevated_token`. |
| 5 | **Anti-Replay** | Dentro de la bóveda pulsa **Reenviar el mismo código** (o cierra la bóveda y vuelve a escribir el mismo código antes de que cambie). | El backend responde **409 Conflict — Replay Attack Detected**. |

**Extra — Silent Refresh:** en Inicio, *Prueba de Silent Refresh → Ejecutar prueba* invalida el `access_token` en memoria y lanza 3 peticiones concurrentes: las 3 reciben 401, se encolan, se hace **una sola** llamada a `/auth/refresh` y las 3 se reintentan con éxito. Si el `refresh_token` también vence o se revoca, la app limpia SecureStore y vuelve a Bienvenida.

---

## 6. Decisiones de seguridad

**Cliente público y PKCE**
- La app no tiene `client_secret`; PKCE S256 lo reemplaza. `code_challenge_method=plain` se rechaza.
- `code_verifier` de 64 bytes de un CSPRNG nativo (86 caracteres URL-safe). El verifier y el `state` solo existen en variables locales durante el flujo.
- Se usa `WebBrowser.openAuthSessionAsync` (ASWebAuthenticationSession / Custom Tabs) con sesión efímera en iOS. **No hay WebView.**
- El `state` del deep link se compara en tiempo constante **antes** de mirar `code` o `error`; si no coincide se aborta.
- El backend compara `redirect_uri` con una lista blanca exacta y, si no es válido, no redirige (evita open redirect). El código dura 60 s, es de un solo uso y queda ligado a `client_id`, `redirect_uri` y `code_challenge`.

**Tokens**
- `access_token` (JWT HS256, 5 min) y `elevated_token` (10 min) viven solo en la memoria del `SessionManager`; mueren con el proceso.
- `refresh_token` opaco en `expo-secure-store` con `WHEN_UNLOCKED_THIS_DEVICE_ONLY` (Keychain `kSecClassGenericPassword` en iOS, cifrado con llave del Android Keystore). Nunca en AsyncStorage.
- El servidor guarda solo el hash SHA-256 del `refresh_token`, lo rota en cada uso y revoca la sesión completa si detecta reutilización.
- Las semillas TOTP de la app también se guardan en SecureStore.

**TOTP y Step-Up**
- Implementación propia en ambos lados: contador de 64 bits Big-Endian, HMAC-SHA1 (en la app, HMAC RFC 2104 construido sobre `expo-crypto.digest(SHA-1)`), truncamiento dinámico y `% 10^6` con ceros a la izquierda. Sin `otplib`, `speakeasy` ni similares.
- El servidor compara las tres ventanas en tiempo constante; caché Anti-Replay por usuario + código con TTL de 90 s; máximo 5 intentos por `step_up_token`, que además es de un solo uso.
- Respuesta 403 con `WWW-Authenticate: Bearer error="insufficient_user_authentication"` (RFC 9470).

**Alcance de laboratorio:** el almacenamiento es en memoria (se pierde al reiniciar el backend) y `/enroll` expone la semilla del usuario demo; ambos deben desactivarse o reemplazarse en producción.

---

## 7. Estructura del código

```
backend-auth/src/
├── crypto/        base32.ts · totp.ts (RFC 6238) · pkce.ts (S256)
├── store/         users (scrypt) · authorizationStore · refreshTokenStore (rotación) · replayCache
├── tokens/        tokenService.ts (JWT access / elevated / step_up)
├── routes/        oauth · session (refresh/logout) · api (/me) · vault (step-up) · mfa (verify + /enroll)
└── middleware/    requireAuth.ts (Bearer → 401)

mobile-app/src/
├── crypto/        bytes · base32 · hmac (RFC 2104) · totp (RFC 6238) · otpauth · nativeHash (expo-crypto)
├── auth/          pkce · oauthCallback (state) · authorize (WebBrowser) · sessionManager · secureStorage
├── api/           httpClient (Silent Refresh Queue) · authApi · errors · types
├── totp/          useTotp · accountsStore (SecureStore)
├── components/    TotpCard · CountdownBar · StepUpModal · Button · Banner · Card
├── screens/       Welcome · Home · Authenticator · AddAccount · Vault
└── navigation/    RootNavigator (pantallas según el estado de sesión)
```
