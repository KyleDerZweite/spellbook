<script lang="ts">
	import { page } from '$app/state';
	let { label = 'Sign in' }: { label?: string } = $props();
	const returnTo = $derived(
		page.url.searchParams.get('returnTo') ??
			(page.url.pathname.startsWith('/auth/') ? '/' : `${page.url.pathname}${page.url.search}`)
	);
</script>

<a class="btn btn-secondary" href={`/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
	>{label}</a
>
