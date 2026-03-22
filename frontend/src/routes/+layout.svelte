<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { LayoutData } from './$types';
  import Shell from '$lib/components/layout/Shell.svelte';
  import { connect, disconnect } from '$lib/spacetimedb/client';
  import { browser } from '$app/environment';
  import '../app.css';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  $effect(() => {
    if (browser && data.user) {
      connect(data.user);
      return () => disconnect();
    }
  });
</script>

<Shell>
  {@render children()}
</Shell>
