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
	class="nav-link"
	class:nav-link--active={page.url.pathname === '/auth/login'}
	aria-current={page.url.pathname === '/auth/login' ? 'page' : undefined}
	href={returnTo === null ? '/auth/login' : `/auth/login?returnTo=${encodeURIComponent(returnTo)}`}
	>{label}</a
>
