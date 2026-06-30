<script lang="ts">
  import { instances } from '$lib/stores/instances.svelte';
  import { searchMods, getModVersions, installMod, listInstalledMods, toggleMod, removeMod } from '$lib/api';
  import Icon from '$lib/components/Icon.svelte';
  import type { InstalledMod, ModProject } from '$lib/types';

  let selectedId = $state<string>('');
  let query = $state('');
  let results = $state<ModProject[]>([]);
  let installed = $state<InstalledMod[]>([]);
  let searching = $state(false);
  let installingId = $state<string | null>(null);

  let selected = $derived(instances.list.find((i) => i.id === selectedId) ?? null);

  $effect(() => {
    if (!selectedId && instances.list[0]) selectedId = instances.list[0].id;
  });

  $effect(() => {
    if (selectedId) void refreshInstalled();
  });

  async function refreshInstalled() {
    installed = await listInstalledMods(selectedId);
  }

  async function doSearch() {
    if (!selected) return;
    searching = true;
    try {
      results = await searchMods(query, selected.mcVersion, selected.loader);
    } catch (e) {
      alert(String(e));
    } finally {
      searching = false;
    }
  }

  async function install(p: ModProject) {
    if (!selected) return;
    installingId = p.projectId;
    try {
      const versions = await getModVersions(p.projectId, selected.mcVersion, selected.loader);
      if (versions.length === 0) {
        alert('No compatible version found for this instance.');
        return;
      }
      await installMod(selected.id, p.projectId, versions[0].versionId);
      await refreshInstalled();
    } catch (e) {
      alert(String(e));
    } finally {
      installingId = null;
    }
  }

  async function toggle(m: InstalledMod) {
    await toggleMod(m.id, !m.enabled);
    await refreshInstalled();
  }

  async function remove(m: InstalledMod) {
    await removeMod(m.id);
    await refreshInstalled();
  }

  let isInstalled = $derived((projectId: string) => installed.some((m) => m.projectId === projectId));
</script>

<div class="mx-auto max-w-6xl px-6 py-6">
  <header class="mb-5 flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-bold">Mods</h1>
    <label class="flex items-center gap-2 text-sm">
      <span class="text-[color:var(--color-muted)]">Instance</span>
      <select class="input !w-auto" bind:value={selectedId}>
        {#each instances.list as inst (inst.id)}
          <option value={inst.id}>{inst.name} ({inst.mcVersion}/{inst.loader})</option>
        {/each}
      </select>
    </label>
  </header>

  {#if !selected}
    <div class="card p-10 text-center text-sm text-[color:var(--color-muted)]">
      Create an instance first, then browse mods from Modrinth here.
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_20rem]">
      <!-- Search + results -->
      <div>
        <form
          class="mb-4 flex gap-2"
          onsubmit={(e) => {
            e.preventDefault();
            doSearch();
          }}
        >
          <div class="relative flex-1">
            <span class="absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--color-muted)]">
              <Icon name="search" size={16} />
            </span>
            <input class="input !pl-9" bind:value={query} placeholder="Search Modrinth for mods…" />
          </div>
          <button class="btn btn-primary" type="submit" disabled={searching}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </form>

        <div class="flex flex-col gap-2">
          {#each results as p (p.projectId)}
            <div class="card flex items-center gap-3 p-3">
              {#if p.iconUrl}
                <img src={p.iconUrl} alt="" class="h-11 w-11 rounded-lg bg-[color:var(--color-surface-2)]" />
              {:else}
                <div class="flex h-11 w-11 items-center justify-center rounded-lg bg-[color:var(--color-surface-2)]">
                  <Icon name="package" size={18} />
                </div>
              {/if}
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate font-medium">{p.title}</span>
                  <span class="text-xs text-[color:var(--color-muted)]">by {p.author}</span>
                </div>
                <div class="truncate text-xs text-[color:var(--color-muted)]">{p.description}</div>
                <div class="mt-0.5 text-xs text-[color:var(--color-muted)]">
                  <Icon name="download" size={11} class="inline" /> {p.downloads.toLocaleString()}
                </div>
              </div>
              {#if isInstalled(p.projectId)}
                <span class="rounded-lg bg-emerald-500/15 px-3 py-1.5 text-xs text-emerald-400">Installed</span>
              {:else}
                <button class="btn btn-outline !py-1.5 text-sm" onclick={() => install(p)} disabled={installingId === p.projectId}>
                  {installingId === p.projectId ? '…' : 'Install'}
                </button>
              {/if}
            </div>
          {:else}
            <div class="card p-8 text-center text-sm text-[color:var(--color-muted)]">
              Search for mods to add to <strong>{selected.name}</strong>.
            </div>
          {/each}
        </div>
      </div>

      <!-- Installed -->
      <aside>
        <div class="card p-4">
          <div class="mb-3 flex items-center justify-between">
            <h3 class="text-sm font-semibold">Installed ({installed.length})</h3>
          </div>
          {#if installed.length === 0}
            <div class="text-xs text-[color:var(--color-muted)]">No mods installed yet.</div>
          {:else}
            <div class="flex flex-col gap-2">
              {#each installed as m (m.id)}
                <div class="flex items-center gap-2 rounded-lg bg-[color:var(--color-surface-2)] p-2 text-sm">
                  <button
                    class="h-4 w-4 shrink-0 rounded border"
                    style="background: {m.enabled ? 'var(--color-accent)' : 'transparent'}; border-color: var(--color-border)"
                    aria-label="toggle"
                    onclick={() => toggle(m)}
                  ></button>
                  <span class="min-w-0 flex-1 truncate" class:opacity-50={!m.enabled}>{m.name}</span>
                  <button class="text-[color:var(--color-muted)] hover:text-red-400" aria-label="remove" onclick={() => remove(m)}>
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </aside>
    </div>
  {/if}
</div>
