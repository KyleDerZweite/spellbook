<script lang="ts">
  let { value = $bindable(''), placeholder = 'Search cards...' }: {
    value: string;
    placeholder?: string;
  } = $props();
</script>

<div class="relative">
  <input
    type="text"
    bind:value
    {placeholder}
    class="w-full rounded-lg border border-surface-600 bg-surface-800 px-4 py-3
           text-gray-100 placeholder-gray-500 outline-none
           focus:border-accent-500 focus:ring-1 focus:ring-accent-500"
  />
  {#if value}
    <button
      onclick={() => (value = '')}
      class="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
    >
      &times;
    </button>
  {/if}
</div>
