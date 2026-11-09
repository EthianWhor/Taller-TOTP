import { useSyncExternalStore } from 'react';
import { session } from '../services';
import type { SessionState } from './sessionManager';

export function useSession(): SessionState {
  return useSyncExternalStore(session.subscribe, session.getState);
}
