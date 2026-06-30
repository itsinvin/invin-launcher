<script lang="ts">
  import { settings } from '$lib/stores/settings.svelte';
  import { hardware } from '$lib/stores/hardware.svelte';
  import Icon from '$lib/components/Icon.svelte';

  const accents = ['#7c5cff', '#22c55e', '#ef4444', '#f59e0b', '#06b6d4', '#ec4899'];

  let maxRamGb = $derived(hardware.profile ? Math.floor(hardware.profile.totalRamMb / 1024) : 32);
</script>

<div class="mx-auto max-w-2xl px-6 py-6">
  <h1 class="mb-6 text-2xl font-bold">Settings</h1>

  <div class="flex flex-col gap-5">
    <section class="card p-5">
      <h2 class="mb-3 text-sm font-semibold">Appearance</h2>
      <div class="flex flex-col gap-4 text-sm">
        <div class="flex items-center justify-between">
          <span>Theme</span>
          <div class="flex gap-1">
            <button
              class="btn !py-1.5 text-sm"
              class:btn-primary={settings.current.theme === 'dark'}
              class:btn-outline={settings.current.theme !== 'dark'}
              onclick={() => settings.update({ theme: 'dark' })}
            >
              Dark
            </button>
            <button
              class="btn !py-1.5 text-sm"
              class:btn-primary={settings.current.theme === 'light'}
              class:btn-outline={settings.current.theme !== 'light'}
              onclick={() => settings.update({ theme: 'light' })}
            >
              Light
            </button>
          </div>
        </div>
        <div class="flex items-center justify-between">
          <span>Accent</span>
          <div class="flex gap-2">
            {#each accents as c (c)}
              <button
                class="h-7 w-7 rounded-lg"
                style="background: {c}; outline: {settings.current.accent === c ? '2px solid var(--color-text)' : 'none'}; outline-offset: 2px"
                aria-label="accent"
                onclick={() => settings.update({ accent: c })}
              ></button>
            {/each}
          </div>
        </div>
      </div>
    </section>

    <section class="card p-5">
      <h2 class="mb-3 text-sm font-semibold">Java & performance</h2>
      <div class="flex flex-col gap-4 text-sm">
        <label class="flex flex-col gap-1">
          <span class="flex justify-between">
            <span>Default allocated RAM</span>
            <span class="font-mono">{(settings.current.defaultMemoryMb / 1024).toFixed(1)} GB</span>
          </span>
          <input
            type="range"
            min="1024"
            max={maxRamGb * 1024}
            step="512"
            value={settings.current.defaultMemoryMb}
            oninput={(e) => settings.update({ defaultMemoryMb: Number((e.target as HTMLInputElement).value) })}
          />
          <span class="text-xs text-[color:var(--color-muted)]">
            Tip: leave 2–4 GB for the OS. Per-instance overrides take priority.
          </span>
        </label>
        <label class="flex flex-col gap-1">
          <span>Default Java path</span>
          <input
            class="input"
            value={settings.current.defaultJavaPath ?? ''}
            placeholder="Auto-detect"
            onchange={(e) => settings.update({ defaultJavaPath: (e.target as HTMLInputElement).value || null })}
          />
        </label>
        <label class="flex items-center justify-between">
          <span>Concurrent downloads</span>
          <input
            class="input !w-24"
            type="number"
            min="1"
            max="32"
            value={settings.current.concurrentDownloads}
            onchange={(e) => settings.update({ concurrentDownloads: Number((e.target as HTMLInputElement).value) })}
          />
        </label>
      </div>
    </section>

    <section class="card p-5">
      <h2 class="mb-3 text-sm font-semibold">Behaviour & privacy</h2>
      <div class="flex flex-col gap-3 text-sm">
        <label class="flex items-center justify-between">
          <span>Close launcher when game starts</span>
          <input type="checkbox" checked={settings.current.closeOnLaunch} onchange={(e) => settings.update({ closeOnLaunch: (e.target as HTMLInputElement).checked })} />
        </label>
        <label class="flex items-center justify-between">
          <span>Redact tokens & secrets in logs</span>
          <input type="checkbox" checked={settings.current.redactLogs} onchange={(e) => settings.update({ redactLogs: (e.target as HTMLInputElement).checked })} />
        </label>
      </div>
    </section>

    <section class="card p-5">
      <h2 class="mb-1 text-sm font-semibold">About</h2>
      <p class="text-sm text-[color:var(--color-muted)]">
        invin launcher — a next-generation, hardware-aware Minecraft launcher.
      </p>
    </section>
  </div>
</div>
