<script lang="ts">
  import { instances } from '$lib/stores/instances.svelte';
  import { hardware } from '$lib/stores/hardware.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import {
    listMcVersions,
    listLoaderVersions,
    analyzeInstanceWorkload,
    launchInstance,
    openInstanceFolder,
    isTauri
  } from '$lib/api';
  import { predictPerformance } from '$lib/prediction';
  import Icon from '$lib/components/Icon.svelte';
  import Modal from '$lib/components/Modal.svelte';
  import RatingBadge from '$lib/components/RatingBadge.svelte';
  import type { Instance, InstanceDraft, LoaderKind, VersionSummary, PerformancePrediction } from '$lib/types';

  const loaders: LoaderKind[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];
  const colors = ['#7c5cff', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6', '#10b981'];

  let showCreate = $state(false);
  let creating = $state(false);
  let versions = $state<VersionSummary[]>([]);
  let includeSnapshots = $state(false);

  let draft = $state<InstanceDraft>({
    name: '',
    mcVersion: '',
    loader: 'fabric',
    loaderVersion: null,
    group: null,
    iconColor: colors[0]
  });

  let editing = $state<Instance | null>(null);
  let editPrediction = $state<PerformancePrediction | null>(null);

  async function openCreate() {
    showCreate = true;
    if (versions.length === 0) {
      versions = await listMcVersions(includeSnapshots);
      if (!draft.mcVersion && versions[0]) draft.mcVersion = versions[0].id;
    }
  }

  async function reloadVersions() {
    versions = await listMcVersions(includeSnapshots);
  }

  async function submitCreate() {
    if (!draft.name.trim() || !draft.mcVersion) return;
    creating = true;
    try {
      await instances.create({ ...draft });
      showCreate = false;
      draft = { name: '', mcVersion: draft.mcVersion, loader: draft.loader, loaderVersion: null, group: null, iconColor: colors[0] };
    } catch (e) {
      alert(String(e));
    } finally {
      creating = false;
    }
  }

  // ---- edit drawer with live prediction ----
  async function openEdit(inst: Instance) {
    editing = { ...inst };
    refreshEditPrediction(editing);
  }

  async function refreshEditPrediction(inst: Instance) {
    if (!hardware.profile) return;
    try {
      const w = await analyzeInstanceWorkload(inst.id);
      w.allocatedRamMb = inst.memoryMb ?? settings.current.defaultMemoryMb;
      editPrediction = predictPerformance(hardware.profile, w);
    } catch {
      editPrediction = null;
    }
  }

  async function saveEdit() {
    if (!editing) return;
    await instances.update(editing);
    editing = null;
  }

  async function play(id: string) {
    try {
      await instances.launch(id);
    } catch (e) {
      alert(String(e));
    }
  }

  async function doClone(inst: Instance) {
    const name = prompt('Name for the cloned instance:', inst.name + ' copy');
    if (name) await instances.clone(inst.id, name);
  }

  async function doDelete(inst: Instance) {
    if (confirm(`Delete "${inst.name}"? This cannot be undone.`)) await instances.remove(inst.id);
  }

  function memForEdit(): number {
    return editing?.memoryMb ?? settings.current.defaultMemoryMb;
  }
</script>

<div class="mx-auto max-w-6xl px-6 py-6">
  <header class="mb-6 flex items-center justify-between">
    <h1 class="text-2xl font-bold">Instances</h1>
    <button class="btn btn-primary" onclick={openCreate}><Icon name="plus" size={16} /> New instance</button>
  </header>

  {#if instances.list.length === 0}
    <div class="card flex flex-col items-center gap-3 p-12 text-center">
      <Icon name="grid" size={28} />
      <div class="font-medium">No instances yet</div>
      <button class="btn btn-primary" onclick={openCreate}><Icon name="plus" size={16} /> Create your first</button>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each instances.list as inst (inst.id)}
        <div class="card flex flex-col gap-3 p-4">
          <div class="flex items-center gap-3">
            <div
              class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-lg font-bold"
              style="background: {inst.iconColor}; color: #fff"
            >
              {inst.name.slice(0, 1).toUpperCase()}
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5">
                <span class="truncate font-medium">{inst.name}</span>
                {#if inst.pinned}<Icon name="pin" size={13} />{/if}
              </div>
              <div class="truncate text-xs text-[color:var(--color-muted)]">{inst.mcVersion} · {inst.loader}</div>
            </div>
          </div>

          <div class="flex items-center gap-1.5">
            {#if instances.isRunning(inst.id)}
              <button class="btn btn-outline flex-1 !py-1.5 text-sm" onclick={() => instances.kill(inst.id)}>
                <Icon name="stop" size={14} /> Stop
              </button>
            {:else}
              <button class="btn btn-primary flex-1 !py-1.5 text-sm" onclick={() => play(inst.id)} disabled={!isTauri()}>
                <Icon name="play" size={14} /> Play
              </button>
            {/if}
            <button class="btn btn-ghost !p-2" title="Settings" aria-label="Settings" onclick={() => openEdit(inst)}>
              <Icon name="settings" size={16} />
            </button>
            <button class="btn btn-ghost !p-2" title="Clone" aria-label="Clone" onclick={() => doClone(inst)}>
              <Icon name="copy" size={16} />
            </button>
            <button class="btn btn-ghost !p-2" title="Delete" aria-label="Delete" onclick={() => doDelete(inst)}>
              <Icon name="trash" size={16} />
            </button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<!-- Create modal -->
<Modal open={showCreate} title="New instance" onclose={() => (showCreate = false)}>
  <div class="flex flex-col gap-3 text-sm">
    <label class="flex flex-col gap-1">
      <span class="text-xs text-[color:var(--color-muted)]">Name</span>
      <input class="input" bind:value={draft.name} placeholder="My modpack" />
    </label>
    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-[color:var(--color-muted)]">Minecraft version</span>
        <select class="input" bind:value={draft.mcVersion}>
          {#each versions as v (v.id)}
            <option value={v.id}>{v.id}</option>
          {/each}
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-[color:var(--color-muted)]">Loader</span>
        <select class="input" bind:value={draft.loader}>
          {#each loaders as l (l)}
            <option value={l}>{l}</option>
          {/each}
        </select>
      </label>
    </div>
    <label class="flex items-center gap-2 text-xs text-[color:var(--color-muted)]">
      <input type="checkbox" bind:checked={includeSnapshots} onchange={reloadVersions} /> Include snapshots
    </label>
    <div class="flex flex-col gap-1">
      <span class="text-xs text-[color:var(--color-muted)]">Icon color</span>
      <div class="flex flex-wrap gap-2">
        {#each colors as c (c)}
          <button
            class="h-7 w-7 rounded-lg"
            style="background: {c}; outline: {draft.iconColor === c ? '2px solid var(--color-text)' : 'none'}; outline-offset: 2px"
            aria-label="color"
            onclick={() => (draft.iconColor = c)}
          ></button>
        {/each}
      </div>
    </div>
  </div>
  {#snippet footer()}
    <button class="btn btn-ghost" onclick={() => (showCreate = false)}>Cancel</button>
    <button class="btn btn-primary" onclick={submitCreate} disabled={creating || !draft.name.trim()}>
      {creating ? 'Creating…' : 'Create'}
    </button>
  {/snippet}
</Modal>

<!-- Edit modal -->
{#if editing}
  <Modal open={!!editing} title={`${editing.name} — settings`} onclose={() => (editing = null)} width="max-w-2xl">
    <div class="grid grid-cols-1 gap-4 text-sm md:grid-cols-2">
      <div class="flex flex-col gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-[color:var(--color-muted)]">Name</span>
          <input class="input" bind:value={editing.name} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="flex justify-between text-xs text-[color:var(--color-muted)]">
            <span>Allocated RAM</span>
            <span class="font-mono">{(memForEdit() / 1024).toFixed(1)} GB</span>
          </span>
          <input
            type="range"
            min="1024"
            max="16384"
            step="512"
            value={memForEdit()}
            oninput={(e) => {
              if (editing) {
                editing.memoryMb = Number((e.target as HTMLInputElement).value);
                refreshEditPrediction(editing);
              }
            }}
          />
          <button
            class="self-start text-xs text-[color:var(--color-accent)]"
            onclick={() => {
              if (editing) {
                editing.memoryMb = null;
                refreshEditPrediction(editing);
              }
            }}
          >
            Use global default ({(settings.current.defaultMemoryMb / 1024).toFixed(1)} GB)
          </button>
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-[color:var(--color-muted)]">Extra JVM args</span>
          <input class="input" bind:value={editing.jvmArgs} placeholder="-XX:+UseG1GC …" />
        </label>
        <label class="flex items-center gap-2">
          <input type="checkbox" bind:checked={editing.pinned} /> Pin to top
        </label>
        {#if isTauri()}
          <button class="btn btn-outline self-start !py-1.5" onclick={() => openInstanceFolder(editing!.id)}>
            <Icon name="folder" size={14} /> Open folder
          </button>
        {/if}
      </div>

      <div class="flex flex-col gap-2">
        <div class="text-xs font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
          Predicted performance
        </div>
        {#if editPrediction}
          <div class="card bg-[color:var(--color-surface-2)] p-4">
            <div class="flex items-end gap-2">
              <span class="text-3xl font-black">{editPrediction.avgFps}</span>
              <span class="mb-1 text-xs text-[color:var(--color-muted)]">fps avg</span>
            </div>
            <div class="mt-1"><RatingBadge rating={editPrediction.rating} size="sm" /></div>
            <div class="mt-2 text-xs text-[color:var(--color-muted)]">
              {editPrediction.ramSufficient ? 'RAM allocation OK' : `Increase RAM to ${(editPrediction.recommendedRamMb / 1024).toFixed(1)} GB`}
              · bottleneck: {editPrediction.bottleneck}
            </div>
            {#if editPrediction.recommendations[0]}
              <div class="mt-2 rounded-md bg-[color:var(--color-surface)] p-2 text-xs">
                <span class="font-medium">{editPrediction.recommendations[0].title}</span>
              </div>
            {/if}
            <a href="/performance" class="mt-2 inline-block text-xs text-[color:var(--color-accent)]">
              Full analysis →
            </a>
          </div>
        {:else}
          <div class="text-xs text-[color:var(--color-muted)]">Detecting hardware…</div>
        {/if}
      </div>
    </div>
    {#snippet footer()}
      <button class="btn btn-ghost" onclick={() => (editing = null)}>Cancel</button>
      <button class="btn btn-primary" onclick={saveEdit}>Save</button>
    {/snippet}
  </Modal>
{/if}
