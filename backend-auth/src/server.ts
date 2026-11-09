import { createApp } from './app.js';
import { loadConfig } from './config.js';

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, config.host, () => {
  console.log(`[backend-auth] escuchando en http://${config.host}:${config.port}`);
  console.log(`[backend-auth] URL pública: ${config.publicBaseUrl}`);
});
