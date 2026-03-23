<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';
  import Nav from '$lib/components/layout/Nav.svelte';
  import { connect } from '$lib/spacetimedb/client';
  import { browser } from '$app/environment';
  import '../app.css';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  $effect(() => {
    if (browser && data.user) {
      connect(data.user);
    }
  });
</script>

<div class="flex min-h-screen flex-col">
  <Nav />
  <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
    {@render children()}
  </main>
</div>
