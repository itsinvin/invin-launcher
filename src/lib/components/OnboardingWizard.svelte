<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte';
  import { hardware } from '$lib/stores/hardware.svelte';
  import { accounts } from '$lib/stores/accounts.svelte';
  import { addOfflineAccount } from '$lib/api';
  import { predictPerformance } from '$lib/prediction';
  import Icon from './Icon.svelte';
  import RatingBadge from './RatingBadge.svelte';
  import type { WorkloadProfile } from '$lib/types';

  let step = $state(0);
  let offlineName = $state('');
  let suggestedRamGb = $state(4);

  // Sample workload (a typical optimized 1.20 pack) for the "first look" prediction.
  const sample: WorkloadProfile = {
    name: 'Optimized pack',
    mcVersion: '1.20.1',
    loader: 'fabric',
    modCount: 80,
    allocatedRamMb: 4096,
    renderDistance: 12,
    shaders: false,
    optimizationMods: true,
    heavyMods: false
  };

  let prediction = $derived(hardware.profile ? predictPerformance(hardware.profile, sample) : null);

  $effect(() => {
    if (prediction) suggestedRamGb = Math.round(prediction.recommendedRamMb / 1024);
  });

  function finish() {
    if (suggestedRamGb > 0) settings.update({ defaultMemoryMb: suggestedRamGb * 1024, onboarded: true });
    else settings.update({ onboarded: true });
  }

  async function addOffline() {
    if (!offlineName.trim()) return;
    await addOfflineAccount(offlineName.trim());
    await accounts.load();
    step = 3;
  }
</script>

<div class="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
  <div class="card w-full max-w-lg overflow-hidden bg-[color:var(--color-surface)] shadow-2xl">
    <div class="flex items-center gap-2 border-b border-[color:var(--color-border)] px-6 py-4">
      <div class="flex h-8 w-8 items-center justify-center rounded-lg font-black" style="background: var(--color-accent); color: #fff">i</div>
      <span class="font-semibold">Welcome to invin</span>
      <span class="ml-auto text-xs text-[color:var(--color-muted)]">Step {step + 1} of 4</span>
    </div>

    <div class="px-6 py-6">
      {#if step === 0}
        <h2 class="mb-2 text-xl font-bold">A launcher that knows your machine</h2>
        <p class="text-sm text-[color:var(--color-muted)]">
          invin predicts how modpacks will run on your exact hardware — FPS, RAM, and load times — so you
          never install a pack that turns into a slideshow. Let's get set up.
        </p>
        <ul class="mt-4 flex flex-col gap-2 text-sm">
          <li class="flex items-center gap-2"><span style="color: var(--color-accent)"><Icon name="activity" size={16} /></span> Per-machine performance prediction</li>
          <li class="flex items-center gap-2"><span style="color: var(--color-accent)"><Icon name="package" size={16} /></span> One-click mods from Modrinth</li>
          <li class="flex items-center gap-2"><span style="color: var(--color-accent)"><Icon name="zap" size={16} /></span> Auto-tuned RAM & JVM flags</li>
        </ul>
      {:else if step === 1}
        <h2 class="mb-2 text-xl font-bold">Your hardware</h2>
        {#if hardware.profile}
          <div class="flex flex-col gap-2 text-sm">
            <div class="flex justify-between rounded-lg bg-[color:var(--color-surface-2)] p-3">
              <span class="text-[color:var(--color-muted)]">GPU</span><span class="font-medium">{hardware.profile.gpu.model}</span>
            </div>
            <div class="flex justify-between rounded-lg bg-[color:var(--color-surface-2)] p-3">
              <span class="text-[color:var(--color-muted)]">CPU</span><span class="font-medium">{hardware.profile.cpu.brand}</span>
            </div>
            <div class="flex justify-between rounded-lg bg-[color:var(--color-surface-2)] p-3">
              <span class="text-[color:var(--color-muted)]">Memory</span><span class="font-medium">{(hardware.profile.totalRamMb / 1024).toFixed(0)} GB</span>
            </div>
          </div>
          <p class="mt-3 text-xs text-[color:var(--color-muted)]">
            You can refine these any time on the Performance page if detection isn't exact.
          </p>
        {:else}
          <p class="text-sm text-[color:var(--color-muted)]">Detecting…</p>
        {/if}
      {:else if step === 2}
        <h2 class="mb-2 text-xl font-bold">Add a profile</h2>
        <p class="mb-3 text-sm text-[color:var(--color-muted)]">
          Sign in with Microsoft from the Accounts page later, or create an offline profile now to get started.
        </p>
        <div class="flex gap-2">
          <input class="input" bind:value={offlineName} placeholder="Username" />
          <button class="btn btn-outline" onclick={addOffline} disabled={!offlineName.trim()}>Add</button>
        </div>
        <button class="mt-3 text-xs text-[color:var(--color-accent)]" onclick={() => (step = 3)}>Skip for now</button>
      {:else}
        <h2 class="mb-2 text-xl font-bold">Your first prediction</h2>
        <p class="mb-3 text-sm text-[color:var(--color-muted)]">
          Here's how a typical optimized 1.20 pack should run on your machine:
        </p>
        {#if prediction}
          <div class="card bg-[color:var(--color-surface-2)] p-4">
            <div class="flex items-center justify-between">
              <div class="flex items-end gap-2">
                <span class="text-4xl font-black">{prediction.avgFps}</span>
                <span class="mb-1 text-xs text-[color:var(--color-muted)]">fps avg</span>
              </div>
              <RatingBadge rating={prediction.rating} />
            </div>
            <p class="mt-2 text-xs text-[color:var(--color-muted)]">
              We've suggested <strong>{suggestedRamGb} GB</strong> default RAM for your system.
            </p>
          </div>
        {/if}
      {/if}
    </div>

    <div class="flex justify-between border-t border-[color:var(--color-border)] px-6 py-4">
      {#if step > 0}
        <button class="btn btn-ghost" onclick={() => (step -= 1)}>Back</button>
      {:else}
        <button class="btn btn-ghost" onclick={finish}>Skip</button>
      {/if}
      {#if step < 3}
        <button class="btn btn-primary" onclick={() => (step += 1)}>Next</button>
      {:else}
        <button class="btn btn-primary" onclick={finish}>Get started</button>
      {/if}
    </div>
  </div>
</div>
