<script lang="ts">
  import { accounts } from '$lib/stores/accounts.svelte';
  import { beginLogin, pollLogin, addOfflineAccount, isTauri } from '$lib/api';
  import Icon from '$lib/components/Icon.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import type { AuthDeviceCode } from '$lib/types';

  let showAdd = $state(false);
  let offlineName = $state('');
  let device = $state<AuthDeviceCode | null>(null);
  let loggingIn = $state(false);
  let error = $state('');

  async function startMsLogin() {
    error = '';
    loggingIn = true;
    try {
      device = await beginLogin();
      const acc = await pollLogin(device.deviceCode);
      await accounts.load();
      device = null;
      showAdd = false;
    } catch (e) {
      error = String(e);
    } finally {
      loggingIn = false;
    }
  }

  async function addOffline() {
    if (!offlineName.trim()) return;
    await addOfflineAccount(offlineName.trim());
    await accounts.load();
    offlineName = '';
    showAdd = false;
  }
</script>

<div class="mx-auto max-w-3xl px-6 py-6">
  <header class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl font-bold">Accounts</h1>
    <button class="btn btn-primary" onclick={() => (showAdd = true)}><Icon name="plus" size={16} /> Add account</button>
  </header>

  {#if accounts.list.length === 0}
    <div class="card flex flex-col items-center gap-3 p-12 text-center">
      <Icon name="user" size={28} />
      <div class="font-medium">No accounts</div>
      <p class="max-w-sm text-sm text-[color:var(--color-muted)]">
        Add your Microsoft account to play online, or an offline profile for local play.
      </p>
      <button class="btn btn-primary" onclick={() => (showAdd = true)}>Add account</button>
    </div>
  {:else}
    <div class="flex flex-col gap-2">
      {#each accounts.list as acc (acc.id)}
        <div class="card flex items-center gap-3 p-3">
          <img
            src={`https://crafatar.com/avatars/${acc.uuid}?size=40&overlay`}
            alt=""
            class="h-10 w-10 rounded-lg bg-[color:var(--color-surface-2)]"
          />
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="truncate font-medium">{acc.username}</span>
              {#if acc.active}
                <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">Active</span>
              {/if}
              {#if acc.expiresAt === 0}
                <span class="rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs text-[color:var(--color-muted)]">Offline</span>
              {/if}
            </div>
            <div class="truncate text-xs text-[color:var(--color-muted)]">{acc.uuid}</div>
          </div>
          {#if !acc.active}
            <button class="btn btn-outline !py-1.5 text-sm" onclick={() => accounts.setActive(acc.id)}>Use</button>
          {/if}
          <button class="btn btn-ghost !p-2" aria-label="Remove" onclick={() => accounts.remove(acc.id)}>
            <Icon name="logout" size={16} />
          </button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<Modal open={showAdd} title="Add account" onclose={() => { showAdd = false; device = null; }}>
  <div class="flex flex-col gap-4 text-sm">
    {#if device}
      <div class="rounded-lg bg-[color:var(--color-surface-2)] p-4 text-center">
        <div class="text-xs text-[color:var(--color-muted)]">Go to</div>
        <div class="font-medium">{device.verificationUri}</div>
        <div class="mt-2 text-xs text-[color:var(--color-muted)]">and enter code</div>
        <div class="font-mono text-2xl font-bold tracking-widest">{device.userCode}</div>
        <div class="mt-2 text-xs text-[color:var(--color-muted)]">Waiting for you to sign in…</div>
      </div>
    {:else}
      <div>
        <div class="mb-1 font-medium">Microsoft account</div>
        <p class="mb-2 text-xs text-[color:var(--color-muted)]">
          Sign in with Microsoft to play online (requires the native invin app).
        </p>
        <button class="btn btn-primary w-full" onclick={startMsLogin} disabled={loggingIn || !isTauri()}>
          {loggingIn ? 'Starting…' : 'Sign in with Microsoft'}
        </button>
        {#if !isTauri()}
          <p class="mt-1 text-xs text-[color:var(--color-muted)]">Available in the desktop app.</p>
        {/if}
      </div>

      <div class="border-t border-[color:var(--color-border)] pt-4">
        <div class="mb-1 font-medium">Offline profile</div>
        <p class="mb-2 text-xs text-[color:var(--color-muted)]">For single-player / LAN. No online servers.</p>
        <div class="flex gap-2">
          <input class="input" bind:value={offlineName} placeholder="Username" />
          <button class="btn btn-outline" onclick={addOffline} disabled={!offlineName.trim()}>Add</button>
        </div>
      </div>

      {#if error}<div class="text-xs text-red-400">{error}</div>{/if}
    {/if}
  </div>
</Modal>
