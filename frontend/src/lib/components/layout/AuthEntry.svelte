<script lang="ts">
	import { page } from '$app/state';
	let { label = 'Sign in' }: { label?: string } = $props();
	const returnTo = $derived(
		page.url.searchParams.get('returnTo') ??
			(page.url.pathname === '/' || page.url.pathname.startsWith('/auth/')
				? null
				: `${page.url.pathname}${page.url.search}`)
	);
</script>

<a
	class="btn btn-secondary"
	href={returnTo === null ? '/auth/login' : `/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
	>{label}</a
>
