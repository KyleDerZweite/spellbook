<script lang="ts">
  import { page } from '$app/state';

  const links = [
    { href: '/', label: 'Home' },
    { href: '/search', label: 'Search' },
    { href: '/collections', label: 'Collections' },
  ];
</script>

<nav class="border-b border-surface-700 bg-surface-800">
  <div class="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4">
    <a href="/" class="text-lg font-bold text-accent-400">Spellbook</a>
    <div class="flex gap-4">
      {#each links as link}
        {@const active = page.url.pathname === link.href ||
          (link.href !== '/' && page.url.pathname.startsWith(link.href))}
        <a
          href={link.href}
          aria-current={active ? 'page' : undefined}
          class="text-sm transition-colors {active
            ? 'text-accent-400'
            : 'text-gray-400 hover:text-gray-200'}"
        >
          {link.label}
        </a>
      {/each}
    </div>
  </div>
</nav>
