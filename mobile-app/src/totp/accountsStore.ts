import { useSyncExternalStore } from 'react';
import { readSecureJson, writeSecureJson } from '../auth/secureStorage';
import { randomBytes } from '../crypto/nativeHash';
import { base64UrlEncode } from '../crypto/bytes';

export interface TotpAccount {
  id: string;
  issuer: string;
  account: string;
  /** Semilla Base32 normalizada. Se guarda cifrada en SecureStore, nunca en AsyncStorage. */
  secret: string;
  createdAt: number;
}

const STORAGE_KEY = 'totp.accounts';

class TotpAccountsStore {
  private accounts: TotpAccount[] = [];
  private loaded = false;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.accounts;
  isLoaded = () => this.loaded;

  async load(): Promise<void> {
    this.accounts = await readSecureJson<TotpAccount[]>(STORAGE_KEY, []);
    this.loaded = true;
    this.emit();
  }

  async add(input: Omit<TotpAccount, 'id' | 'createdAt'>): Promise<TotpAccount> {
    const duplicate = this.accounts.find((a) => a.secret === input.secret && a.account === input.account);
    if (duplicate) return duplicate;
    const account: TotpAccount = { ...input, id: base64UrlEncode(randomBytes(9)), createdAt: Date.now() };
    await this.persist([...this.accounts, account]);
    return account;
  }

  async remove(id: string): Promise<void> {
    await this.persist(this.accounts.filter((a) => a.id !== id));
  }

  private async persist(next: TotpAccount[]): Promise<void> {
    await writeSecureJson(STORAGE_KEY, next);
    this.accounts = next;
    this.emit();
  }

  private emit() {
    this.listeners.forEach((l) => l());
  }
}

export const totpAccounts = new TotpAccountsStore();

export function useTotpAccounts(): TotpAccount[] {
  return useSyncExternalStore(totpAccounts.subscribe, totpAccounts.getSnapshot);
}
