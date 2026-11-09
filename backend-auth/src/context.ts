import type { Clock } from './clock.js';
import type { AppConfig } from './config.js';
import { AuthorizationStore } from './store/authorizationStore.js';
import { RefreshTokenStore } from './store/refreshTokenStore.js';
import { ReplayCache, StepUpTracker } from './store/replayCache.js';
import { UserStore } from './store/users.js';
import { TokenService } from './tokens/tokenService.js';

/** Dependencias compartidas por las rutas (almacenamiento en memoria). */
export interface AppContext {
  config: AppConfig;
  clock: Clock;
  users: UserStore;
  authorizations: AuthorizationStore;
  refreshTokens: RefreshTokenStore;
  tokens: TokenService;
  replayCache: ReplayCache;
  stepUps: StepUpTracker;
}

export function createContext(config: AppConfig, clock: Clock): AppContext {
  const users = new UserStore();
  users.add({
    id: 'user-001',
    email: config.demoUser.email,
    name: config.demoUser.name,
    password: config.demoUser.password,
    totpSecret: config.demoUser.totpSecret,
  });

  return {
    config,
    clock,
    users,
    authorizations: new AuthorizationStore(clock, config.authCodeTtl),
    refreshTokens: new RefreshTokenStore(clock, config.refreshTokenTtl),
    tokens: new TokenService(config, clock),
    replayCache: new ReplayCache(clock, config.replayTtl),
    stepUps: new StepUpTracker(clock),
  };
}
