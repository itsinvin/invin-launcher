<script lang="ts">
  import { progress } from '$lib/stores/progress.svelte';

  function pct(c: number, t: number): number {
    if (t <= 0) return 0;
    return Math.min(100, Math.round((c / t) * 100));
  }
</script>

{#if progress.active.length > 0}
  <div class="pointer-events-none fixed bottom-4 right-4 z-40 flex w-80 flex-col gap-2">
    {#each progress.active as task (task.taskId)}
      <div class="card pointer-events-auto bg-[color:var(--color-surface)] p-3 shadow-xl">
        <div class="mb-1 flex items-center justify-between text-xs">
          <span class="font-medium">{task.stage}</span>
          <span class="text-[color:var(--color-muted)]">{pct(task.current, task.total)}%</span>
        </div>
        <div class="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--color-surface-2)]">
          <div
            class="h-full rounded-full transition-all"
            style="width: {pct(task.current, task.total)}%; background: var(--color-accent)"
          ></div>
        </div>
        {#if task.message}
          <div class="mt-1 truncate text-xs text-[color:var(--color-muted)]">{task.message}</div>
        {/if}
      </div>
    {/each}
  </div>
{/if}
