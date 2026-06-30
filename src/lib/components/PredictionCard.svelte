<script lang="ts">
  import type { PerformancePrediction } from '$lib/types';
  import Icon from './Icon.svelte';
  import RatingBadge from './RatingBadge.svelte';

  interface Props {
    prediction: PerformancePrediction;
  }
  let { prediction: p }: Props = $props();

  const fpsColor = (fps: number) =>
    fps >= 90 ? '#34d399' : fps >= 50 ? '#4ade80' : fps >= 28 ? '#facc15' : fps >= 16 ? '#fb923c' : '#f87171';

  const bottleneckLabel: Record<string, string> = {
    cpu: 'CPU (single-thread)',
    gpu: 'GPU',
    ram: 'RAM allocation',
    storage: 'Storage',
    balanced: 'Well balanced'
  };
  const riskColor: Record<string, string> = { low: '#34d399', medium: '#facc15', high: '#f87171' };
  const sevColor: Record<string, string> = {
    info: '#60a5fa',
    tip: '#a78bfa',
    warning: '#fb923c',
    critical: '#f87171'
  };
  const sevIcon: Record<string, string> = {
    info: 'alert',
    tip: 'check',
    warning: 'alert',
    critical: 'alert'
  };

  let fmtRam = (mb: number) => (mb / 1024).toFixed(1) + ' GB';
</script>

<div class="flex flex-col gap-4">
  <!-- Headline FPS + rating -->
  <div class="card grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
    <div class="flex flex-col justify-center">
      <div class="text-xs uppercase tracking-wide text-[color:var(--color-muted)]">Predicted average FPS</div>
      <div class="flex items-end gap-3">
        <span class="text-6xl font-black leading-none" style="color: {fpsColor(p.avgFps)}">{p.avgFps}</span>
        <span class="mb-1 text-sm text-[color:var(--color-muted)]">
          {p.fpsRange[0]}–{p.fpsRange[1]} fps range
        </span>
      </div>
      <div class="mt-2 flex items-center gap-3">
        <RatingBadge rating={p.rating} score={p.ratingScore} size="md" />
        <span class="text-xs text-[color:var(--color-muted)]">
          1% lows ~{p.lowFps} fps · {p.confidence} confidence
        </span>
      </div>
    </div>

    <!-- Quick stats grid -->
    <div class="grid grid-cols-2 gap-2 text-sm">
      <div class="rounded-lg bg-[color:var(--color-surface-2)] p-3">
        <div class="text-xs text-[color:var(--color-muted)]">RAM usage</div>
        <div class="font-semibold" style={p.ramSufficient ? '' : 'color:#f87171'}>
          {fmtRam(p.ramUsageMb)}
        </div>
        <div class="text-xs text-[color:var(--color-muted)]">
          {p.ramSufficient ? 'allocation OK' : `need ${fmtRam(p.recommendedRamMb)}`}
        </div>
      </div>
      <div class="rounded-lg bg-[color:var(--color-surface-2)] p-3">
        <div class="text-xs text-[color:var(--color-muted)]">Launch time</div>
        <div class="font-semibold">~{p.loadTimeSec}s</div>
        <div class="text-xs text-[color:var(--color-muted)]">after first download</div>
      </div>
      <div class="rounded-lg bg-[color:var(--color-surface-2)] p-3">
        <div class="text-xs text-[color:var(--color-muted)]">Bottleneck</div>
        <div class="font-semibold capitalize">{bottleneckLabel[p.bottleneck]}</div>
      </div>
      <div class="rounded-lg bg-[color:var(--color-surface-2)] p-3">
        <div class="text-xs text-[color:var(--color-muted)]">Worldgen lag risk</div>
        <div class="font-semibold capitalize" style="color: {riskColor[p.worldgenLagRisk]}">
          {p.worldgenLagRisk}
        </div>
      </div>
    </div>
  </div>

  <!-- Impact factors -->
  <div class="card p-5">
    <div class="mb-3 text-sm font-semibold">What's driving this result</div>
    <div class="flex flex-col gap-2.5">
      {#each p.factors as f (f.label)}
        <div class="grid grid-cols-[9rem_1fr_auto] items-center gap-3 text-sm">
          <span class="truncate">{f.label}</span>
          <div class="relative h-2 rounded-full bg-[color:var(--color-surface-2)]">
            <div class="absolute left-1/2 top-0 h-full w-px bg-[color:var(--color-border)]"></div>
            {#if f.impact >= 0}
              <div
                class="absolute left-1/2 top-0 h-full rounded-r-full"
                style="width: {Math.min(50, f.impact * 50)}%; background: #34d399"
              ></div>
            {:else}
              <div
                class="absolute top-0 h-full rounded-l-full"
                style="right: 50%; width: {Math.min(50, -f.impact * 50)}%; background: #f87171"
              ></div>
            {/if}
          </div>
          <span class="w-40 truncate text-right text-xs text-[color:var(--color-muted)]">{f.detail}</span>
        </div>
      {/each}
    </div>
  </div>

  <!-- Recommendations -->
  {#if p.recommendations.length > 0}
    <div class="card p-5">
      <div class="mb-3 text-sm font-semibold">Recommendations to run it better</div>
      <div class="flex flex-col gap-2.5">
        {#each p.recommendations as r (r.title)}
          <div class="flex items-start gap-3 rounded-lg bg-[color:var(--color-surface-2)] p-3">
            <span class="mt-0.5 shrink-0" style="color: {sevColor[r.severity]}">
              <Icon name={sevIcon[r.severity]} size={16} />
            </span>
            <div class="min-w-0">
              <div class="flex items-center gap-2 text-sm font-medium">
                {r.title}
                {#if r.estimatedFpsGain}
                  <span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-400">
                    ~{Math.round((r.estimatedFpsGain - 1) * 100)}% FPS
                  </span>
                {/if}
              </div>
              <div class="text-xs text-[color:var(--color-muted)]">{r.detail}</div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
