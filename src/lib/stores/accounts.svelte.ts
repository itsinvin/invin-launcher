import { listAccounts, removeAccount, setActiveAccount } from '$lib/api';
import type { Account } from '$lib/types';

class AccountsStore {
  list = $state<Account[]>([]);
  loaded = $state(false);

  get active(): Account | null {
    return this.list.find((a) => a.active) ?? null;
  }

  async load() {
    try {
      this.list = await listAccounts();
    } catch (e) {
      console.error('Failed to load accounts', e);
      this.list = [];
    }
    this.loaded = true;
  }

  async setActive(id: string) {
    await setActiveAccount(id);
    await this.load();
  }

  async remove(id: string) {
    await removeAccount(id);
    await this.load();
  }
}

export const accounts = new AccountsStore();
