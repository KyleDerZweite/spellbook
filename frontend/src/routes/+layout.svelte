<script lang="ts">
  import type { Snippet } from 'svelte';
  import Shell from '$lib/components/layout/Shell.svelte';
  import '../app.css';

  let { children }: { children: Snippet } = $props();
</script>

<Shell>
  {@render children()}
</Shell>
