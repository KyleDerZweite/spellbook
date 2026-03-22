<script lang="ts">
  import type { Snippet } from 'svelte';
  import Nav from './Nav.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<div class="flex min-h-screen flex-col">
  <Nav />
  <main class="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
    {@render children()}
  </main>
</div>
