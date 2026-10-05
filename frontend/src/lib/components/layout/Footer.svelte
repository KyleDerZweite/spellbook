<script lang="ts">
	const year = new Date().getFullYear();
</script>

<footer class="site-footer mt-auto shrink-0">
	<nav aria-label="Legal" class="footer-row">
		<a href="/privacy" class="footer-link">Privacy</a>
		<a href="/terms" class="footer-link">Terms</a>
		<a
			href="https://kylehub.dev/impressum"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link">Impressum</a
		>
	</nav>
	<p class="footer-row">
		<span>© {year} Spellbook</span>
		<a href="https://kylehub.dev" target="_blank" rel="noopener noreferrer" class="footer-link"
			>By KyleHub</a
		>
		<a
			href="https://github.com/KyleDerZweite/spellbook/blob/main/LICENSE"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link">AGPLv3</a
		>
	</p>
	<p class="credits">
		Card data: <a
			href="https://scryfall.com/"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link footer-link--inline">Scryfall</a
		>. Mana symbols:
		<a
			href="https://github.com/andrewgioia/mana"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link footer-link--inline">Mana Font</a
		>. Artwork:
		<a
			href="https://tcgdex.dev/"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link footer-link--inline">TCGdex</a
		>
		,
		<a
			href="https://ygoprodeck.com/"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link footer-link--inline">YGOPRODeck</a
		>,
		<a
			href="https://www.bandai-tcg-plus.com/"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link footer-link--inline">Bandai</a
		>
		and
		<a
			href="https://www.ravensburger.com/"
			target="_blank"
			rel="noopener noreferrer"
			class="footer-link footer-link--inline">Ravensburger</a
		>.
	</p>
	<p class="credits">
		Magic: The Gathering © Wizards of the Coast / Hasbro. Pokémon © Nintendo / Creatures / GAME
		FREAK. Yu-Gi-Oh! © Studio Dice / SHUEISHA / TV TOKYO / KONAMI. One Piece © Eiichiro Oda /
		Shueisha / Toei Animation. Disney Lorcana © Disney. Digimon © Akiyoshi Hongo / Toei Animation.
		Spellbook is unaffiliated.
	</p>
</footer>

<style>
	.site-footer {
		padding: 1.5rem 1rem;
		text-align: center;
		font-size: 0.75rem;
		line-height: 1.6;
		color: var(--color-text-muted);
	}
	.footer-row {
		display: flex;
		flex-wrap: wrap;
		justify-content: center;
		align-items: center;
		column-gap: 1.25rem;
		row-gap: 0.25rem;
	}
	nav a {
		padding-block: 0.35rem;
	}
	.credits {
		max-width: 60rem;
		margin: 0.5rem auto 0;
		font-size: 0.6875rem;
	}
</style>
