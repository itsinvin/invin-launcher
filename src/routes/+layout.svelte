<script lang="ts">
  import { onMount } from 'svelte';
  import '../app.css';
  import Sidebar from '$lib/components/Sidebar.svelte';
  import ProgressToasts from '$lib/components/ProgressToasts.svelte';
  import OnboardingWizard from '$lib/components/OnboardingWizard.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { accounts } from '$lib/stores/accounts.svelte';
  import { instances } from '$lib/stores/instances.svelte';
  import { progress } from '$lib/stores/progress.svelte';
  import { hardware } from '$lib/stores/hardware.svelte';

  let { children } = $props();
  let ready = $state(false);

  onMount(async () => {
    await Promise.all([
      settings.load(),
      accounts.load(),
      instances.init(),
      progress.init(),
      hardware.init()
    ]);
    ready = true;
  });
</script>

<div class="flex h-screen w-screen overflow-hidden">
  <Sidebar />
  <main class="flex-1 overflow-y-auto">
    {#if ready}
      {@render children()}
    {:else}
      <div class="flex h-full items-center justify-center text-[color:var(--color-muted)]">
        Loading invin launcher...
      </div>
    {/if}
  </main>
</div>

<ProgressToasts />

{#if ready && settings.loaded && !settings.current.onboarded}
  <OnboardingWizard />
{/if}
