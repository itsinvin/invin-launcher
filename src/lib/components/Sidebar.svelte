<script lang="ts">
  import { page } from '$app/state';
  import { accounts } from '$lib/stores/accounts.svelte';
  import Icon from './Icon.svelte';

  const links = [
    { href: '/', label: 'Home', icon: 'home' },
    { href: '/instances', label: 'Instances', icon: 'grid' },
    { href: '/mods', label: 'Mods', icon: 'package' },
    { href: '/performance', label: 'Performance', icon: 'activity' },
    { href: '/accounts', label: 'Accounts', icon: 'user' },
    { href: '/settings', label: 'Settings', icon: 'settings' }
  ];

  function isActive(href: string): boolean {
    if (href === '/') return page.url.pathname === '/';
    return page.url.pathname.startsWith(href);
  }
</script>

<aside
  class="flex h-full w-60 shrink-0 flex-col border-r border-[color:var(--color-border)] bg-[color:var(--color-surface)]"
>
  <div class="flex items-center gap-2 px-5 py-5">
    <div
      class="flex h-9 w-9 items-center justify-center rounded-lg text-lg font-black"
      style="background: var(--color-accent); color: var(--color-accent-fg)"
    >
      i
    </div>
    <div class="leading-tight">
      <div class="text-sm font-semibold">invin</div>
      <div class="text-xs text-[color:var(--color-muted)]">launcher</div>
    </div>
  </div>

  <nav class="flex flex-1 flex-col gap-1 px-3">
    {#each links as link (link.href)}
      <a
        href={link.href}
        class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors"
        class:bg-[color:var(--color-surface-2)]={isActive(link.href)}
        class:text-[color:var(--color-accent)]={isActive(link.href)}
        class:text-[color:var(--color-muted)]={!isActive(link.href)}
      >
        <Icon name={link.icon} size={18} />
        {link.label}
      </a>
    {/each}
  </nav>

  <div class="border-t border-[color:var(--color-border)] p-3">
    <a
      href="/accounts"
      class="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-[color:var(--color-surface-2)]"
    >
      {#if accounts.active}
        <img
          src={`https://crafatar.com/avatars/${accounts.active.uuid}?size=32&overlay`}
          alt=""
          class="h-8 w-8 rounded-md bg-[color:var(--color-surface-2)]"
        />
        <div class="min-w-0 leading-tight">
          <div class="truncate text-sm font-medium">{accounts.active.username}</div>
          <div class="text-xs text-[color:var(--color-muted)]">Microsoft</div>
        </div>
      {:else}
        <div class="flex h-8 w-8 items-center justify-center rounded-md bg-[color:var(--color-surface-2)]">
          <Icon name="user" size={16} />
        </div>
        <div class="text-sm text-[color:var(--color-muted)]">No account</div>
      {/if}
    </a>
  </div>
</aside>
