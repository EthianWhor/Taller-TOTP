import { existsSync } from 'node:fs';
import { createApp } from './app.js';
import { loadConfig } from './config.js';

// Carga backend-auth/.env si existe (soporte nativo de Node >= 20.12).
if (existsSync('.env')) process.loadEnvFile('.env');


const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, config.host, () => {
  console.log(`[backend-auth] escuchando en http://${config.host}:${config.port}`);
  console.log(`[backend-auth] URL pública: ${config.publicBaseUrl}`);
});
