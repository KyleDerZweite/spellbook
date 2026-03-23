<script lang="ts">
  import type { Snippet } from 'svelte';
  import Nav from '$lib/components/layout/Nav.svelte';
  import { connect } from '$lib/spacetimedb/client';
  import { browser } from '$app/environment';
  import '../app.css';

  let { children }: { children: Snippet } = $props();

  function getUserFromCookie(): { accountId: string; username: string; email: string } | null {
    if (!browser) return null;
    const match = document.cookie.match(/spellbook_user=([^;]+)/);
    if (!match) return null;
    try {
      return JSON.parse(decodeURIComponent(match[1]));
    } catch {
      return null;
    }
  }

  $effect(() => {
    const user = getUserFromCookie();
    if (user) {
      connect(user);
    }
  });
</script>

<div class="flex min-h-screen flex-col">
  <Nav />
  <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
    {@render children()}
  </main>
</div>
