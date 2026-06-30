<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    open: boolean;
    title: string;
    onclose: () => void;
    children: Snippet;
    footer?: Snippet;
    width?: string;
  }
  let { open, title, onclose, children, footer, width = 'max-w-lg' }: Props = $props();
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) onclose();
    }}
  >
    <div class="card w-full {width} bg-[color:var(--color-surface)] shadow-2xl" role="dialog">
      <header class="flex items-center justify-between border-b border-[color:var(--color-border)] px-5 py-4">
        <h2 class="text-base font-semibold">{title}</h2>
        <button class="btn btn-ghost !p-1.5" onclick={onclose} aria-label="Close">
          <Icon name="x" size={18} />
        </button>
      </header>
      <div class="max-h-[70vh] overflow-y-auto px-5 py-4">
        {@render children()}
      </div>
      {#if footer}
        <footer class="flex justify-end gap-2 border-t border-[color:var(--color-border)] px-5 py-4">
          {@render footer()}
        </footer>
      {/if}
    </div>
  </div>
{/if}
