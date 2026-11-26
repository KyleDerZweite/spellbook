package dev.spellbook.data

import java.security.MessageDigest

data class CachedValue<T>(val value: T, val cachedAtEpochMs: Long)

interface ReadCacheStore {
    fun saveDashboard(scope: AccountScope, dashboard: Dashboard, cachedAtEpochMs: Long)
    fun loadDashboard(scope: AccountScope): CachedValue<Dashboard>?

    fun saveInventoryPage(
        scope: AccountScope,
        query: String,
        group: String,
        offset: Int,
        page: InventoryPage,
        cachedAtEpochMs: Long,
    )
    fun loadInventoryPage(
        scope: AccountScope,
        query: String,
        group: String,
        offset: Int,
        limit: Int,
    ): CachedValue<InventoryPage>?

    fun saveGroups(scope: AccountScope, page: GroupPage, cachedAtEpochMs: Long)
    fun loadGroups(scope: AccountScope, offset: Int, limit: Int): CachedValue<GroupPage>?

    fun saveEntryDetail(
        scope: AccountScope,
        detail: EntryDetail,
        groups: GroupPage,
        cachedAtEpochMs: Long,
    )
    fun loadEntryDetail(scope: AccountScope, entryId: String): CachedValue<Pair<EntryDetail, GroupPage>>?
    fun removeInventoryEntries(scope: AccountScope, entryIds: Collection<String>)

    fun saveDeckLibrary(
        scope: AccountScope,
        query: String,
        offset: Int,
        library: DeckLibrary,
        cachedAtEpochMs: Long,
    )
    fun loadDeckLibrary(
        scope: AccountScope,
        query: String,
        offset: Int,
        limit: Int,
    ): CachedValue<DeckLibrary>?

    fun saveSelectedDeck(scope: AccountScope, deckId: String, deck: SelectedDeck, cachedAtEpochMs: Long)
    fun loadSelectedDeck(scope: AccountScope, deckId: String): CachedValue<SelectedDeck>?

    fun saveDeckAvailability(
        scope: AccountScope,
        deckId: String,
        availability: DeckAvailability,
        cachedAtEpochMs: Long,
    )
    fun loadDeckAvailability(scope: AccountScope, deckId: String): CachedValue<DeckAvailability>?

    fun clearAccount(scope: AccountScope)
}

internal fun scopeCacheKey(scope: AccountScope): String {
    val raw = "${scope.backend}\u0000${scope.accountId}"
    return MessageDigest.getInstance("SHA-256")
        .digest(raw.toByteArray(Charsets.UTF_8))
        .joinToString("") { "%02x".format(it) }
}

internal fun matchesInventoryQuery(entry: InventoryEntry, query: String): Boolean {
    val needle = query.trim()
    if (needle.isEmpty()) return true
    return entry.name.contains(needle, ignoreCase = true) ||
        entry.setCode.contains(needle, ignoreCase = true) ||
        entry.notes.contains(needle, ignoreCase = true) ||
        entry.finish.contains(needle, ignoreCase = true) ||
        entry.condition.contains(needle, ignoreCase = true)
}

internal fun matchesDeckQuery(deck: DeckSummary, query: String): Boolean {
    val needle = query.trim()
    if (needle.isEmpty()) return true
    return deck.name.contains(needle, ignoreCase = true) ||
        deck.format.contains(needle, ignoreCase = true)
}

internal fun buildCachedInventoryPage(
    revision: String,
    totals: InventoryTotals,
    groupCount: Long,
    entries: List<InventoryEntry>,
    groups: List<Group>,
    membershipsByEntry: Map<String, Set<String>>,
    query: String,
    group: String,
    offset: Int,
    limit: Int,
): InventoryPage {
    val filtered = entries
        .asSequence()
        .filter { entry ->
            if (group.isEmpty()) true
            else membershipsByEntry[entry.id]?.contains(group) == true
        }
        .filter { matchesInventoryQuery(it, query) }
        .sortedWith(compareBy<InventoryEntry>({ it.name.lowercase() }, { it.id }))
        .toList()
    val safeOffset = offset.coerceAtLeast(0)
    val safeLimit = limit.coerceAtLeast(1)
    val pageEntries = filtered.drop(safeOffset).take(safeLimit)
    val sortedGroups = groups.sortedWith(compareBy<Group>({ it.name.lowercase() }, { it.id }))
    return InventoryPage(
        revision = revision,
        queryKey = "offline:q=${query.trim()}:g=$group",
        entries = pageEntries,
        groups = sortedGroups,
        groupPage = sortedGroups,
        groupCount = maxOf(groupCount, sortedGroups.size.toLong()),
        matching = Matching(
            entryCount = filtered.size.toLong(),
            copyCount = filtered.sumOf { it.quantity },
        ),
        totals = totals,
    )
}

internal fun buildCachedDeckLibrary(
    revision: String,
    globalTotal: Long,
    decks: List<DeckSummary>,
    query: String,
    offset: Int,
    limit: Int,
): DeckLibrary {
    val filtered = decks
        .asSequence()
        .filter { matchesDeckQuery(it, query) }
        .sortedWith(compareBy<DeckSummary>({ it.name.lowercase() }, { it.id }))
        .toList()
    val safeOffset = offset.coerceAtLeast(0)
    val safeLimit = limit.coerceAtLeast(1)
    val pageItems = filtered.drop(safeOffset).take(safeLimit)
    return DeckLibrary(
        revision = revision,
        offset = safeOffset,
        limit = safeLimit,
        matchingTotal = filtered.size.toLong(),
        globalTotal = maxOf(globalTotal, decks.size.toLong()),
        items = pageItems,
    )
}

/**
 * Pure JVM in-memory [ReadCacheStore] for deterministic unit tests.
 */
class InMemoryReadCacheStore : ReadCacheStore {
    private data class AccountCache(
        var dashboard: CachedValue<Dashboard>? = null,
        var inventoryRevision: String? = null,
        var inventoryTotals: InventoryTotals? = null,
        var groupCount: Long = 0,
        var inventoryCachedAtMs: Long = 0,
        var groupsCachedAtMs: Long? = null,
        val entries: MutableMap<String, InventoryEntry> = linkedMapOf(),
        val groups: MutableMap<String, Group> = linkedMapOf(),
        val memberships: MutableMap<String, MutableSet<String>> = linkedMapOf(),
        val cachedGroupFilters: MutableSet<String> = linkedSetOf(),
        val entryDetailCachedAt: MutableMap<String, Long> = linkedMapOf(),
        var deckRevision: String? = null,
        var deckGlobalTotal: Long = 0,
        var deckCachedAtMs: Long? = null,
        val decks: MutableMap<String, DeckSummary> = linkedMapOf(),
        val selectedDecks: MutableMap<String, CachedValue<SelectedDeck>> = linkedMapOf(),
        val deckAvailability: MutableMap<String, CachedValue<DeckAvailability>> = linkedMapOf(),
    )

    private val accounts = mutableMapOf<AccountScope, AccountCache>()

    private fun bucket(scope: AccountScope): AccountCache =
        accounts.getOrPut(scope) { AccountCache() }

    @Synchronized
    override fun saveDashboard(scope: AccountScope, dashboard: Dashboard, cachedAtEpochMs: Long) {
        bucket(scope).dashboard = CachedValue(dashboard, cachedAtEpochMs)
    }

    @Synchronized
    override fun loadDashboard(scope: AccountScope): CachedValue<Dashboard>? =
        accounts[scope]?.dashboard

    @Synchronized
    override fun saveInventoryPage(
        scope: AccountScope,
        query: String,
        group: String,
        offset: Int,
        page: InventoryPage,
        cachedAtEpochMs: Long,
    ) {
        val state = bucket(scope)
        if (query.isEmpty() && group.isEmpty() && offset == 0 && page.entries.size.toLong() == page.totals.entryCount) {
            state.entries.clear()
        }
        if (group.isNotEmpty() && query.isEmpty()) {
            state.cachedGroupFilters.add(group)
            if (offset == 0 && page.entries.size.toLong() == page.matching.entryCount) {
                state.memberships.values.forEach { it.remove(group) }
            }
        }
        page.entries.forEach { entry ->
            state.entries[entry.id] = entry
            if (group.isNotEmpty()) {
                state.memberships.getOrPut(entry.id) { linkedSetOf() }.add(group)
            }
        }
        (page.groups + page.groupPage).forEach { grp -> state.groups[grp.id] = grp }
        state.inventoryRevision = page.revision
        state.inventoryTotals = page.totals
        state.groupCount = page.groupCount
        state.inventoryCachedAtMs = cachedAtEpochMs
        if (state.groupsCachedAtMs == null) state.groupsCachedAtMs = cachedAtEpochMs
    }

    @Synchronized
    override fun loadInventoryPage(
        scope: AccountScope,
        query: String,
        group: String,
        offset: Int,
        limit: Int,
    ): CachedValue<InventoryPage>? {
        val state = accounts[scope] ?: return null
        val revision = state.inventoryRevision ?: return null
        val totals = state.inventoryTotals ?: return null
        if (group.isNotEmpty() && group !in state.cachedGroupFilters) return null
        val page = buildCachedInventoryPage(
            revision = revision,
            totals = totals,
            groupCount = state.groupCount,
            entries = state.entries.values.toList(),
            groups = state.groups.values.toList(),
            membershipsByEntry = state.memberships.mapValues { it.value.toSet() },
            query = query,
            group = group,
            offset = offset,
            limit = limit,
        )
        return CachedValue(page, state.inventoryCachedAtMs)
    }

    @Synchronized
    override fun saveGroups(scope: AccountScope, page: GroupPage, cachedAtEpochMs: Long) {
        val state = bucket(scope)
        if (page.groups.size.toLong() == page.count) {
            state.groups.clear()
        }
        page.groups.forEach { state.groups[it.id] = it }
        state.groupCount = page.count
        if (state.inventoryRevision == null) state.inventoryRevision = page.revision
        state.groupsCachedAtMs = cachedAtEpochMs
    }

    @Synchronized
    override fun loadGroups(scope: AccountScope, offset: Int, limit: Int): CachedValue<GroupPage>? {
        val state = accounts[scope] ?: return null
        val cachedAt = state.groupsCachedAtMs ?: return null
        val sorted = state.groups.values.sortedWith(compareBy<Group>({ it.name.lowercase() }, { it.id }))
        val pageGroups = sorted.drop(offset.coerceAtLeast(0)).take(limit.coerceAtLeast(1))
        return CachedValue(
            GroupPage(
                revision = state.inventoryRevision ?: "0",
                groups = pageGroups,
                count = sorted.size.toLong(),
            ),
            cachedAt,
        )
    }

    @Synchronized
    override fun saveEntryDetail(
        scope: AccountScope,
        detail: EntryDetail,
        groups: GroupPage,
        cachedAtEpochMs: Long,
    ) {
        val state = bucket(scope)
        state.entries[detail.entry.id] = detail.entry
        state.memberships[detail.entry.id] = detail.memberships.toMutableSet()
        state.entryDetailCachedAt[detail.entry.id] = cachedAtEpochMs
        state.inventoryRevision = detail.revision
        saveGroups(scope, groups, cachedAtEpochMs)
    }

    @Synchronized
    override fun loadEntryDetail(
        scope: AccountScope,
        entryId: String,
    ): CachedValue<Pair<EntryDetail, GroupPage>>? {
        val state = accounts[scope] ?: return null
        val entry = state.entries[entryId] ?: return null
        val cachedAt = state.entryDetailCachedAt[entryId] ?: state.inventoryCachedAtMs
        val memberships = state.memberships[entryId]?.sorted() ?: emptyList()
        val sortedGroups = state.groups.values.sortedWith(compareBy<Group>({ it.name.lowercase() }, { it.id }))
        val revision = state.inventoryRevision ?: "0"
        val detail = EntryDetail(entry = entry, memberships = memberships, revision = revision)
        val groupPage = GroupPage(
            revision = revision,
            groups = sortedGroups,
            count = maxOf(state.groupCount, sortedGroups.size.toLong()),
        )
        return CachedValue(detail to groupPage, cachedAt)
    }

    @Synchronized
    override fun removeInventoryEntries(scope: AccountScope, entryIds: Collection<String>) {
        val state = accounts[scope] ?: return
        entryIds.forEach { id ->
            state.entries.remove(id)
            state.memberships.remove(id)
            state.entryDetailCachedAt.remove(id)
        }
    }

    @Synchronized
    override fun saveDeckLibrary(
        scope: AccountScope,
        query: String,
        offset: Int,
        library: DeckLibrary,
        cachedAtEpochMs: Long,
    ) {
        val state = bucket(scope)
        if (query.isEmpty() && offset == 0 && library.items.size.toLong() == library.globalTotal) {
            state.decks.clear()
        }
        library.items.forEach { state.decks[it.id] = it }
        state.deckRevision = library.revision
        state.deckGlobalTotal = library.globalTotal
        state.deckCachedAtMs = cachedAtEpochMs
    }

    @Synchronized
    override fun loadDeckLibrary(
        scope: AccountScope,
        query: String,
        offset: Int,
        limit: Int,
    ): CachedValue<DeckLibrary>? {
        val state = accounts[scope] ?: return null
        val cachedAt = state.deckCachedAtMs ?: return null
        val revision = state.deckRevision ?: return null
        val library = buildCachedDeckLibrary(
            revision = revision,
            globalTotal = state.deckGlobalTotal,
            decks = state.decks.values.toList(),
            query = query,
            offset = offset,
            limit = limit,
        )
        return CachedValue(library, cachedAt)
    }

    @Synchronized
    override fun saveSelectedDeck(
        scope: AccountScope,
        deckId: String,
        deck: SelectedDeck,
        cachedAtEpochMs: Long,
    ) {
        bucket(scope).selectedDecks[deckId] = CachedValue(deck, cachedAtEpochMs)
    }

    @Synchronized
    override fun loadSelectedDeck(scope: AccountScope, deckId: String): CachedValue<SelectedDeck>? =
        accounts[scope]?.selectedDecks?.get(deckId)

    @Synchronized
    override fun saveDeckAvailability(
        scope: AccountScope,
        deckId: String,
        availability: DeckAvailability,
        cachedAtEpochMs: Long,
    ) {
        bucket(scope).deckAvailability[deckId] = CachedValue(availability, cachedAtEpochMs)
    }

    @Synchronized
    override fun loadDeckAvailability(
        scope: AccountScope,
        deckId: String,
    ): CachedValue<DeckAvailability>? = accounts[scope]?.deckAvailability?.get(deckId)

    @Synchronized
    override fun clearAccount(scope: AccountScope) {
        accounts.remove(scope)
    }
}
