<script lang="ts">
	const year = new Date().getFullYear();
</script>

<footer
	class="mt-auto shrink-0 px-6 py-6"
	style="border-top: 1px solid rgba(196, 146, 42, 0.15);"
>
	<div class="mx-auto flex max-w-4xl flex-col items-center gap-4">
		<nav class="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
			<a
				href="/privacy"
				class="font-body text-xs text-text-muted no-underline transition-colors hover:text-text-secondary"
			>
				Privacy Policy
			</a>
			<a
				href="/terms"
				class="font-body text-xs text-text-muted no-underline transition-colors hover:text-text-secondary"
			>
				Terms of Service
			</a>
			<a
				href="https://kylehub.dev/impressum"
				target="_blank"
				rel="noopener noreferrer"
				class="font-body text-xs text-text-muted no-underline transition-colors hover:text-text-secondary"
			>
				Impressum
			</a>
		</nav>

		<p class="max-w-xl text-center font-body text-[11px] leading-relaxed text-text-muted" style="opacity: 0.7;">
			Magic: The Gathering is a trademark of Wizards of the Coast, Inc. and Hasbro, Inc.
			Spellbook is unaffiliated. Card data provided by
			<a
				href="https://scryfall.com/"
				target="_blank"
				rel="noopener noreferrer"
				class="text-text-muted no-underline transition-colors hover:text-text-secondary"
				style="border-bottom: 1px solid rgba(196, 146, 42, 0.2);"
			>Scryfall</a>.
			Mana symbols by
			<a
				href="https://github.com/andrewgioia/mana"
				target="_blank"
				rel="noopener noreferrer"
				class="text-text-muted no-underline transition-colors hover:text-text-secondary"
				style="border-bottom: 1px solid rgba(196, 146, 42, 0.2);"
			>Mana Font</a>.
		</p>

		<div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-body text-xs text-text-muted">
			<span>
				Licensed under
				<a
					href="https://github.com/KyleDerZweite/spellbook/blob/v1/LICENSE"
					target="_blank"
					rel="noopener noreferrer"
					class="text-text-muted no-underline transition-colors hover:text-text-secondary"
					style="border-bottom: 1px solid rgba(196, 146, 42, 0.2);"
				>AGPLv3</a>
			</span>
			<span aria-hidden="true" class="text-text-muted" style="opacity: 0.3;">|</span>
			<span>
				Made with love by Kyle &middot;
				<a
					href="https://kylehub.dev"
					target="_blank"
					rel="noopener noreferrer"
					class="text-text-muted no-underline transition-colors hover:text-text-secondary"
					style="border-bottom: 1px solid rgba(196, 146, 42, 0.2);"
				>KyleHub</a>
			</span>
			<span aria-hidden="true" class="text-text-muted" style="opacity: 0.3;">|</span>
			<span>&copy; {year} Spellbook</span>
		</div>
	</div>
</footer>
