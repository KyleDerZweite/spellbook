<script lang="ts">
	const year = new Date().getFullYear();
</script>

<footer class="mt-auto shrink-0 border-t border-border/70 bg-surface px-4 py-4 sm:px-6">
	<div class="mx-auto flex max-w-[1600px] flex-col items-center gap-2">
		<nav class="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
			<a href="/privacy" class="footer-link">Privacy</a>
			<a href="/terms" class="footer-link">Terms</a>
			<a
				href="https://kylehub.dev/impressum"
				target="_blank"
				rel="noopener noreferrer"
				class="footer-link"
			>
				Impressum
			</a>
		</nav>

		<p class="max-w-3xl text-center font-body text-xs leading-relaxed text-text-muted">
			Magic: The Gathering is a trademark of Wizards of the Coast, Inc. and Hasbro, Inc. Spellbook
			is unaffiliated. Card data provided by
			<a
				href="https://scryfall.com/"
				target="_blank"
				rel="noopener noreferrer"
				class="footer-link footer-link--inline">Scryfall</a
			>. Mana symbols by
			<a
				href="https://github.com/andrewgioia/mana"
				target="_blank"
				rel="noopener noreferrer"
				class="footer-link footer-link--inline">Mana Font</a
			>.
		</p>

		<div
			class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 font-body text-xs text-text-muted"
		>
			<span>
				Licensed under
				<a
					href="https://github.com/KyleDerZweite/spellbook/blob/main/LICENSE"
					target="_blank"
					rel="noopener noreferrer"
					class="footer-link footer-link--inline">AGPLv3</a
				>
			</span>
			<span>
				Created by
				<a
					href="https://kylehub.dev"
					target="_blank"
					rel="noopener noreferrer"
					class="footer-link footer-link--inline">KyleHub</a
				>
			</span>
			<span>&copy; {year} Spellbook</span>
		</div>
	</div>
</footer>
