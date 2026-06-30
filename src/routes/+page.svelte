<script lang="ts">
  import { instances } from '$lib/stores/instances.svelte';
  import { accounts } from '$lib/stores/accounts.svelte';
  import { hardware } from '$lib/stores/hardware.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { predictPerformance } from '$lib/prediction';
  import { analyzeInstanceWorkload, launchInstance, isTauri } from '$lib/api';
  import Icon from '$lib/components/Icon.svelte';
  import RatingBadge from '$lib/components/RatingBadge.svelte';
  import type { PerformancePrediction, WorkloadProfile } from '$lib/types';

  let featured = $derived(
    [...instances.list]
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.lastPlayed ?? 0) - (a.lastPlayed ?? 0);
      })
      .slice(0, 6)
  );

  // Predict the most relevant instance for the at-a-glance card.
  let topInstance = $derived(featured[0] ?? null);
  let topWorkload = $state<WorkloadProfile | null>(null);
  let topPrediction = $derived<PerformancePrediction | null>(
    hardware.profile && topWorkload ? predictPerformance(hardware.profile, topWorkload) : null
  );

  $effect(() => {
    if (topInstance) {
      analyzeInstanceWorkload(topInstance.id)
        .then((w) => (topWorkload = w))
        .catch(() => (topWorkload = null));
    } else {
      topWorkload = null;
    }
  });

  async function play(id: string) {
    try {
      await launchInstance(id);
    } catch (e) {
      alert(String(e));
    }
  }
</script>

<div class="mx-auto max-w-6xl px-6 py-6">
  <header class="mb-6 flex items-end justify-between">
    <div>
      <h1 class="text-2xl font-bold">
        Welcome back{accounts.active ? `, ${accounts.active.username}` : ''}
      </h1>
      <p class="text-sm text-[color:var(--color-muted)]">
        {instances.list.length} instance{instances.list.length === 1 ? '' : 's'} ·
        {hardware.profile ? `${hardware.profile.gpu.model}` : 'detecting hardware…'}
      </p>
    </div>
    <a href="/instances" class="btn btn-primary"><Icon name="plus" size={16} /> New instance</a>
  </header>

  <!-- At-a-glance performance for the top instance -->
  {#if topInstance}
    <div class="card mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div class="flex items-center gap-4">
        <div
          class="flex h-14 w-14 items-center justify-center rounded-xl text-2xl font-black"
          style="background: {topInstance.iconColor}; color: #fff"
        >
          {topInstance.name.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <div class="flex items-center gap-2">
            <span class="text-lg font-semibold">{topInstance.name}</span>
            {#if topInstance.pinned}<Icon name="pin" size={14} />{/if}
          </div>
          <div class="text-sm text-[color:var(--color-muted)]">
            {topInstance.mcVersion} · {topInstance.loader}
          </div>
          {#if topPrediction}
            <div class="mt-1 flex items-center gap-2">
              <RatingBadge rating={topPrediction.rating} size="sm" />
              <span class="text-xs text-[color:var(--color-muted)]">
                ~{topPrediction.avgFps} fps predicted on your hardware
              </span>
            </div>
          {/if}
        </div>
      </div>
      <div class="flex gap-2">
        <a href="/performance" class="btn btn-outline"><Icon name="activity" size={16} /> Predict</a>
        <button class="btn btn-primary" onclick={() => play(topInstance.id)} disabled={!isTauri()}>
          <Icon name="play" size={16} /> Play
        </button>
      </div>
    </div>
  {/if}

  <!-- Feature highlight -->
  <a
    href="/performance"
    class="card mb-6 flex items-center gap-4 border-[color:var(--color-accent)]/30 p-5 transition-colors hover:bg-[color:var(--color-surface-2)]"
    style="background: linear-gradient(135deg, color-mix(in srgb, var(--color-accent) 10%, transparent), transparent)"
  >
    <span style="color: var(--color-accent)"><Icon name="sparkles" size={28} /></span>
    <div class="flex-1">
      <div class="font-semibold">Will it run? Find out before you install.</div>
      <div class="text-sm text-[color:var(--color-muted)]">
        invin's Performance Predictor estimates FPS, RAM, and load times for any modpack on your exact hardware.
      </div>
    </div>
    <Icon name="chevron" size={20} />
  </a>

  <h2 class="mb-3 text-sm font-semibold uppercase tracking-wide text-[color:var(--color-muted)]">
    Your instances
  </h2>
  {#if featured.length === 0}
    <div class="card flex flex-col items-center gap-3 p-10 text-center">
      <Icon name="grid" size={28} />
      <div class="font-medium">No instances yet</div>
      <p class="max-w-sm text-sm text-[color:var(--color-muted)]">
        Create your first instance to start playing. invin will tell you how well it'll run.
      </p>
      <a href="/instances" class="btn btn-primary"><Icon name="plus" size={16} /> Create instance</a>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {#each featured as inst (inst.id)}
        <a
          href="/instances"
          class="card flex items-center gap-3 p-4 transition-colors hover:bg-[color:var(--color-surface-2)]"
        >
          <div
            class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg font-bold"
            style="background: {inst.iconColor}; color: #fff"
          >
            {inst.name.slice(0, 1).toUpperCase()}
          </div>
          <div class="min-w-0">
            <div class="truncate text-sm font-medium">{inst.name}</div>
            <div class="truncate text-xs text-[color:var(--color-muted)]">{inst.mcVersion} · {inst.loader}</div>
          </div>
        </a>
      {/each}
    </div>
  {/if}
</div>
