<script lang="ts">
  import { instances } from '$lib/stores/instances.svelte';
  import { hardware } from '$lib/stores/hardware.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { predictPerformance } from '$lib/prediction';
  import { analyzeInstanceWorkload } from '$lib/api';
  import HardwarePanel from '$lib/components/HardwarePanel.svelte';
  import PredictionCard from '$lib/components/PredictionCard.svelte';
  import Icon from '$lib/components/Icon.svelte';
  import type { LoaderKind, WorkloadProfile } from '$lib/types';

  // The workload being analysed. Either a hand-tuned profile or one derived from an instance.
  let workload = $state<WorkloadProfile>({
    name: 'Custom modpack',
    mcVersion: '1.20.1',
    loader: 'fabric',
    modCount: 120,
    allocatedRamMb: 4096,
    renderDistance: 12,
    shaders: false,
    optimizationMods: true,
    heavyMods: false
  });

  let source = $state<'custom' | string>('custom');

  // Preset modpack archetypes for quick what-if analysis.
  const presets: { name: string; w: Partial<WorkloadProfile> }[] = [
    { name: 'Vanilla', w: { name: 'Vanilla', loader: 'vanilla', modCount: 0, shaders: false, optimizationMods: false, heavyMods: false } },
    { name: 'Fabulously Optimized', w: { name: 'Fabulously Optimized', loader: 'fabric', modCount: 55, optimizationMods: true, heavyMods: false, shaders: false } },
    { name: 'Shaders + Optimization', w: { name: 'Optimized + Shaders', loader: 'fabric', modCount: 60, optimizationMods: true, shaders: true, heavyMods: false } },
    { name: 'Create-based (~150)', w: { name: 'Create pack', loader: 'forge', modCount: 150, optimizationMods: false, heavyMods: true, shaders: false } },
    { name: 'All the Mods 9 (~400)', w: { name: 'All the Mods 9', loader: 'neoforge', modCount: 400, optimizationMods: false, heavyMods: true, shaders: false } },
    { name: 'RLCraft-style (~200)', w: { name: 'RLCraft-style', loader: 'forge', modCount: 200, optimizationMods: false, heavyMods: true, shaders: false } }
  ];

  const loaders: LoaderKind[] = ['vanilla', 'fabric', 'quilt', 'forge', 'neoforge'];

  function applyPreset(p: { name: string; w: Partial<WorkloadProfile> }) {
    source = 'custom';
    workload = { ...workload, ...p.w };
  }

  async function selectInstance(id: string) {
    source = id;
    try {
      workload = await analyzeInstanceWorkload(id);
    } catch (e) {
      console.error(e);
    }
  }

  // Live prediction — recomputes whenever hardware or workload changes.
  let prediction = $derived(hardware.profile ? predictPerformance(hardware.profile, workload) : null);

  // Helper: prediction with optimization mods toggled on, to show the upside.
  let optimizedPrediction = $derived(
    hardware.profile && !workload.optimizationMods
      ? predictPerformance(hardware.profile, { ...workload, optimizationMods: true })
      : null
  );
</script>

<div class="mx-auto max-w-6xl px-6 py-6">
  <header class="mb-6">
    <div class="flex items-center gap-2">
      <Icon name="activity" size={22} />
      <h1 class="text-2xl font-bold">Performance Predictor</h1>
    </div>
    <p class="mt-1 max-w-2xl text-sm text-[color:var(--color-muted)]">
      See how a modpack will actually run on <em>your</em> machine before you install it — predicted FPS,
      RAM usage, launch time, the limiting bottleneck, and exactly what to change to make it smoother.
    </p>
  </header>

  <div class="grid grid-cols-1 gap-5 lg:grid-cols-[22rem_1fr]">
    <!-- Left: hardware + workload controls -->
    <div class="flex flex-col gap-5">
      <HardwarePanel />

      <div class="card p-5">
        <h3 class="mb-3 text-sm font-semibold">What are we testing?</h3>

        <div class="mb-3 flex flex-col gap-2">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-xs text-[color:var(--color-muted)]">Source</span>
            <select
              class="input"
              value={source}
              onchange={(e) => {
                const v = (e.target as HTMLSelectElement).value;
                if (v === 'custom') source = 'custom';
                else selectInstance(v);
              }}
            >
              <option value="custom">Custom modpack</option>
              {#each instances.list as inst (inst.id)}
                <option value={inst.id}>{inst.name} ({inst.mcVersion})</option>
              {/each}
            </select>
          </label>
        </div>

        <div class="mb-3">
          <div class="mb-1.5 text-xs text-[color:var(--color-muted)]">Quick presets</div>
          <div class="flex flex-wrap gap-1.5">
            {#each presets as p (p.name)}
              <button class="btn btn-outline !px-2.5 !py-1 text-xs" onclick={() => applyPreset(p)}>{p.name}</button>
            {/each}
          </div>
        </div>

        <div class="flex flex-col gap-3 text-sm">
          <div class="grid grid-cols-2 gap-2">
            <label class="flex flex-col gap-1">
              <span class="text-xs text-[color:var(--color-muted)]">MC version</span>
              <input class="input" bind:value={workload.mcVersion} />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-xs text-[color:var(--color-muted)]">Loader</span>
              <select class="input" bind:value={workload.loader}>
                {#each loaders as l (l)}
                  <option value={l}>{l}</option>
                {/each}
              </select>
            </label>
          </div>

          <label class="flex flex-col gap-1">
            <span class="flex justify-between text-xs text-[color:var(--color-muted)]">
              <span>Mod count</span><span class="font-mono">{workload.modCount}</span>
            </span>
            <input type="range" min="0" max="500" step="5" bind:value={workload.modCount} />
          </label>

          <label class="flex flex-col gap-1">
            <span class="flex justify-between text-xs text-[color:var(--color-muted)]">
              <span>Allocated RAM</span><span class="font-mono">{(workload.allocatedRamMb / 1024).toFixed(1)} GB</span>
            </span>
            <input type="range" min="1024" max="16384" step="512" bind:value={workload.allocatedRamMb} />
          </label>

          <label class="flex flex-col gap-1">
            <span class="flex justify-between text-xs text-[color:var(--color-muted)]">
              <span>Render distance</span><span class="font-mono">{workload.renderDistance} chunks</span>
            </span>
            <input type="range" min="2" max="32" step="1" bind:value={workload.renderDistance} />
          </label>

          <div class="flex flex-col gap-2 pt-1">
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={workload.optimizationMods} />
              <span>Optimization mods (Sodium-class)</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={workload.shaders} />
              <span>Shaders enabled</span>
            </label>
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={workload.heavyMods} />
              <span>Heavy tech/worldgen mods</span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <!-- Right: prediction -->
    <div class="flex flex-col gap-4">
      {#if prediction}
        <PredictionCard {prediction} />

        {#if optimizedPrediction && optimizedPrediction.avgFps > prediction.avgFps}
          <div class="card flex items-center gap-3 border-emerald-500/30 bg-emerald-500/5 p-4">
            <span class="text-emerald-400"><Icon name="sparkles" size={20} /></span>
            <div class="text-sm">
              <span class="font-semibold">Adding optimization mods could reach ~{optimizedPrediction.avgFps} FPS</span>
              <span class="text-[color:var(--color-muted)]">
                (from {prediction.avgFps} — about
                {Math.round((optimizedPrediction.avgFps / Math.max(prediction.avgFps, 1) - 1) * 100)}% faster).
              </span>
            </div>
          </div>
        {/if}
      {:else}
        <div class="card flex h-40 items-center justify-center text-[color:var(--color-muted)]">
          Detecting hardware…
        </div>
      {/if}

      <p class="px-1 text-xs text-[color:var(--color-muted)]">
        Predictions are heuristic estimates based on a benchmark model of {workload.loader} on Minecraft
        {workload.mcVersion}. Real performance varies with drivers, OS, background apps, and specific mods.
      </p>
    </div>
  </div>
</div>
