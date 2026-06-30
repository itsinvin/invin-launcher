<script lang="ts">
  import { hardware } from '$lib/stores/hardware.svelte';
  import Icon from './Icon.svelte';

  let editing = $state(false);
  let gpuModel = $state('');
  let cpuBrand = $state('');
  let ramGb = $state(16);
  let storage = $state<'ssd' | 'hdd' | 'unknown'>('unknown');

  let hw = $derived(hardware.profile);

  function startEdit() {
    if (!hw) return;
    gpuModel = hw.gpu.model;
    cpuBrand = hw.cpu.brand;
    ramGb = Math.round(hw.totalRamMb / 1024);
    storage = hw.storage;
    editing = true;
  }

  function applyEdit() {
    hardware.setGpuModel(gpuModel, null);
    hardware.setCpuModel(cpuBrand);
    hardware.setOverride({ totalRamMb: Math.max(1, ramGb) * 1024, storage });
    editing = false;
  }

  const tierColor: Record<string, string> = {
    enthusiast: '#34d399',
    high: '#4ade80',
    mainstream: '#facc15',
    entry: '#fb923c',
    integrated: '#f87171'
  };
</script>

<div class="card p-5">
  <div class="mb-4 flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Icon name="grid" size={16} />
      <h3 class="text-sm font-semibold">Your hardware</h3>
      {#if hw}
        <span class="rounded-full bg-[color:var(--color-surface-2)] px-2 py-0.5 text-xs text-[color:var(--color-muted)]">
          {hw.source}
        </span>
      {/if}
    </div>
    <div class="flex gap-1">
      <button class="btn btn-ghost !px-2 !py-1 text-xs" onclick={() => hardware.detect()} disabled={hardware.detecting}>
        <Icon name="refresh" size={14} /> Re-detect
      </button>
      {#if !editing}
        <button class="btn btn-outline !px-2 !py-1 text-xs" onclick={startEdit}>Edit</button>
      {/if}
    </div>
  </div>

  {#if !hw}
    <div class="text-sm text-[color:var(--color-muted)]">Detecting hardware…</div>
  {:else if editing}
    <div class="flex flex-col gap-3 text-sm">
      <label class="flex flex-col gap-1">
        <span class="text-xs text-[color:var(--color-muted)]">GPU model</span>
        <input class="input" bind:value={gpuModel} placeholder="e.g. NVIDIA GeForce RTX 3060" />
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-xs text-[color:var(--color-muted)]">CPU model</span>
        <input class="input" bind:value={cpuBrand} placeholder="e.g. AMD Ryzen 5 5600X" />
      </label>
      <div class="grid grid-cols-2 gap-3">
        <label class="flex flex-col gap-1">
          <span class="text-xs text-[color:var(--color-muted)]">Total RAM (GB)</span>
          <input class="input" type="number" min="1" bind:value={ramGb} />
        </label>
        <label class="flex flex-col gap-1">
          <span class="text-xs text-[color:var(--color-muted)]">Storage</span>
          <select class="input" bind:value={storage}>
            <option value="ssd">SSD</option>
            <option value="hdd">HDD</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn btn-ghost !py-1.5 text-sm" onclick={() => (editing = false)}>Cancel</button>
        <button class="btn btn-primary !py-1.5 text-sm" onclick={applyEdit}>Apply</button>
      </div>
    </div>
  {:else}
    <div class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
      <div class="rounded-lg bg-[color:var(--color-surface-2)] p-3">
        <div class="text-xs text-[color:var(--color-muted)]">GPU</div>
        <div class="truncate font-medium">{hw.gpu.model}</div>
        <div class="mt-1 flex items-center gap-2 text-xs">
          <span class="capitalize" style="color: {tierColor[hw.gpu.tier]}">{hw.gpu.tier}</span>
          <span class="text-[color:var(--color-muted)]">· score {hw.gpu.score}/100</span>
        </div>
      </div>
      <div class="rounded-lg bg-[color:var(--color-surface-2)] p-3">
        <div class="text-xs text-[color:var(--color-muted)]">CPU</div>
        <div class="truncate font-medium">{hw.cpu.brand}</div>
        <div class="mt-1 text-xs text-[color:var(--color-muted)]">
          {hw.cpu.physicalCores}c/{hw.cpu.logicalCores}t · single-thread {hw.cpu.singleThreadScore}/100
        </div>
      </div>
      <div class="rounded-lg bg-[color:var(--color-surface-2)] p-3">
        <div class="text-xs text-[color:var(--color-muted)]">Memory</div>
        <div class="font-medium">{(hw.totalRamMb / 1024).toFixed(0)} GB</div>
      </div>
      <div class="rounded-lg bg-[color:var(--color-surface-2)] p-3">
        <div class="text-xs text-[color:var(--color-muted)]">System</div>
        <div class="truncate font-medium">{hw.os}</div>
        <div class="text-xs text-[color:var(--color-muted)]">{hw.arch} · {hw.storage} storage</div>
      </div>
    </div>
  {/if}
</div>
