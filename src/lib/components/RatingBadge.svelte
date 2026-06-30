<script lang="ts">
  import type { PerfRating } from '$lib/types';

  interface Props {
    rating: PerfRating;
    score?: number | null;
    size?: 'sm' | 'md' | 'lg';
  }
  let { rating, score = null, size = 'md' }: Props = $props();

  const meta: Record<PerfRating, { label: string; color: string; bg: string }> = {
    excellent: { label: 'Excellent', color: '#34d399', bg: 'rgba(52,211,153,0.14)' },
    smooth: { label: 'Smooth', color: '#4ade80', bg: 'rgba(74,222,128,0.14)' },
    playable: { label: 'Playable', color: '#facc15', bg: 'rgba(250,204,21,0.14)' },
    choppy: { label: 'Choppy', color: '#fb923c', bg: 'rgba(251,146,60,0.14)' },
    unplayable: { label: 'Unplayable', color: '#f87171', bg: 'rgba(248,113,113,0.14)' }
  };

  let m = $derived(meta[rating]);
  let pad = $derived(size === 'lg' ? 'px-4 py-2 text-base' : size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm');
</script>

<span
  class="inline-flex items-center gap-2 rounded-full font-semibold {pad}"
  style="color: {m.color}; background: {m.bg}"
>
  <span class="h-2 w-2 rounded-full" style="background: {m.color}"></span>
  {m.label}
  {#if score !== null}
    <span class="opacity-70">· {score}</span>
  {/if}
</span>
