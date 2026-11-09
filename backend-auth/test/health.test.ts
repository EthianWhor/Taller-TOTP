import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

describe('GET /health', () => {
  it('responde ok y deshabilita caché', async () => {
    const app = createApp({ config: loadConfig() });
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});
