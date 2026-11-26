package dev.spellbook.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.Serializable

/**
 * Android SQLite-backed [ReadCacheStore] scoped strictly by [AccountScope] (backend + accountId).
 *
 * Uses Android's built-in SQLite runtime without extra codegen/ORM dependencies and is excluded
 * from cloud backups via `data_extraction_rules.xml` and `allowBackup="false"`.
 */
class SqliteReadCacheStore(context: Context) :
    SQLiteOpenHelper(context.applicationContext, DB_NAME, null, DB_VERSION),
    ReadCacheStore {

    @Serializable
    private data class InventoryMeta(
        val revision: String,
        val totals: InventoryTotals,
        val groupCount: Long,
    )

    @Serializable
    private data class GroupsMeta(
        val revision: String,
        val count: Long,
    )

    @Serializable
    private data class DeckLibraryMeta(
        val revision: String,
        val globalTotal: Long,
    )

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE cache_blobs (
                scope_key TEXT NOT NULL,
                bucket TEXT NOT NULL,
                item_id TEXT NOT NULL,
                payload TEXT NOT NULL,
                cached_at_ms INTEGER NOT NULL,
                PRIMARY KEY (scope_key, bucket, item_id)
            )
            """.trimIndent(),
        )
        db.execSQL(
            """
            CREATE TABLE entry_memberships (
                scope_key TEXT NOT NULL,
                entry_id TEXT NOT NULL,
                group_id TEXT NOT NULL,
                PRIMARY KEY (scope_key, entry_id, group_id)
            )
            """.trimIndent(),
        )
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        db.execSQL("DROP TABLE IF EXISTS cache_blobs")
        db.execSQL("DROP TABLE IF EXISTS entry_memberships")
        onCreate(db)
    }

    @Synchronized
    override fun saveDashboard(scope: AccountScope, dashboard: Dashboard, cachedAtEpochMs: Long) {
        upsertBlob(scopeCacheKey(scope), BUCKET_DASHBOARD, SINGLETON_ID, WireJson.encodeToString(dashboard), cachedAtEpochMs)
    }

    @Synchronized
    override fun loadDashboard(scope: AccountScope): CachedValue<Dashboard>? =
        loadBlob(scopeCacheKey(scope), BUCKET_DASHBOARD, SINGLETON_ID) { WireJson.decodeFromString(it) }

    @Synchronized
    override fun saveInventoryPage(
        scope: AccountScope,
        query: String,
        group: String,
        offset: Int,
        page: InventoryPage,
        cachedAtEpochMs: Long,
    ) {
        val key = scopeCacheKey(scope)
        val db = writableDatabase
        db.beginTransaction()
        try {
            if (query.isEmpty() && group.isEmpty() && offset == 0 && page.entries.size.toLong() == page.totals.entryCount) {
                db.delete("cache_blobs", "scope_key = ? AND bucket = ?", arrayOf(key, BUCKET_INVENTORY_ENTRY))
            }
            if (group.isNotEmpty() && query.isEmpty()) {
                upsertBlobInTx(db, key, BUCKET_CACHED_GROUP_FILTER, group, "1", cachedAtEpochMs)
                if (offset == 0 && page.entries.size.toLong() == page.matching.entryCount) {
                    db.delete("entry_memberships", "scope_key = ? AND group_id = ?", arrayOf(key, group))
                }
            }
            page.entries.forEach { entry ->
                upsertBlobInTx(db, key, BUCKET_INVENTORY_ENTRY, entry.id, WireJson.encodeToString(entry), cachedAtEpochMs)
                if (group.isNotEmpty()) {
                    val values = ContentValues().apply {
                        put("scope_key", key)
                        put("entry_id", entry.id)
                        put("group_id", group)
                    }
                    db.insertWithOnConflict("entry_memberships", null, values, SQLiteDatabase.CONFLICT_IGNORE)
                }
            }
            (page.groups + page.groupPage).forEach { grp ->
                upsertBlobInTx(db, key, BUCKET_GROUP, grp.id, WireJson.encodeToString(grp), cachedAtEpochMs)
            }
            val meta = InventoryMeta(page.revision, page.totals, page.groupCount)
            upsertBlobInTx(db, key, BUCKET_INVENTORY_META, SINGLETON_ID, WireJson.encodeToString(meta), cachedAtEpochMs)
            if (loadBlobInDb(db, key, BUCKET_GROUPS_META, SINGLETON_ID) == null) {
                val groupsMeta = GroupsMeta(page.revision, page.groupCount)
                upsertBlobInTx(db, key, BUCKET_GROUPS_META, SINGLETON_ID, WireJson.encodeToString(groupsMeta), cachedAtEpochMs)
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    override fun loadInventoryPage(
        scope: AccountScope,
        query: String,
        group: String,
        offset: Int,
        limit: Int,
    ): CachedValue<InventoryPage>? {
        val key = scopeCacheKey(scope)
        val meta = loadBlob(key, BUCKET_INVENTORY_META, SINGLETON_ID) {
            WireJson.decodeFromString<InventoryMeta>(it)
        } ?: return null
        if (group.isNotEmpty() && loadBlobInDb(readableDatabase, key, BUCKET_CACHED_GROUP_FILTER, group) == null) {
            return null
        }
        val entries = loadBucket(key, BUCKET_INVENTORY_ENTRY) { WireJson.decodeFromString<InventoryEntry>(it) }
        val groups = loadBucket(key, BUCKET_GROUP) { WireJson.decodeFromString<Group>(it) }
        val memberships = loadAllMemberships(key)
        val page = buildCachedInventoryPage(
            revision = meta.value.revision,
            totals = meta.value.totals,
            groupCount = meta.value.groupCount,
            entries = entries,
            groups = groups,
            membershipsByEntry = memberships,
            query = query,
            group = group,
            offset = offset,
            limit = limit,
        )
        return CachedValue(page, meta.cachedAtEpochMs)
    }

    @Synchronized
    override fun saveGroups(scope: AccountScope, page: GroupPage, cachedAtEpochMs: Long) {
        val key = scopeCacheKey(scope)
        val db = writableDatabase
        db.beginTransaction()
        try {
            if (page.groups.size.toLong() == page.count) {
                db.delete("cache_blobs", "scope_key = ? AND bucket = ?", arrayOf(key, BUCKET_GROUP))
            }
            page.groups.forEach { grp ->
                upsertBlobInTx(db, key, BUCKET_GROUP, grp.id, WireJson.encodeToString(grp), cachedAtEpochMs)
            }
            val meta = GroupsMeta(page.revision, page.count)
            upsertBlobInTx(db, key, BUCKET_GROUPS_META, SINGLETON_ID, WireJson.encodeToString(meta), cachedAtEpochMs)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    override fun loadGroups(scope: AccountScope, offset: Int, limit: Int): CachedValue<GroupPage>? {
        val key = scopeCacheKey(scope)
        val meta = loadBlob(key, BUCKET_GROUPS_META, SINGLETON_ID) {
            WireJson.decodeFromString<GroupsMeta>(it)
        } ?: return null
        val sorted = loadBucket(key, BUCKET_GROUP) { WireJson.decodeFromString<Group>(it) }
            .sortedWith(compareBy<Group>({ it.name.lowercase() }, { it.id }))
        val pageGroups = sorted.drop(offset.coerceAtLeast(0)).take(limit.coerceAtLeast(1))
        return CachedValue(
            GroupPage(
                revision = meta.value.revision,
                groups = pageGroups,
                count = sorted.size.toLong(),
            ),
            meta.cachedAtEpochMs,
        )
    }

    @Synchronized
    override fun saveEntryDetail(
        scope: AccountScope,
        detail: EntryDetail,
        groups: GroupPage,
        cachedAtEpochMs: Long,
    ) {
        val key = scopeCacheKey(scope)
        val db = writableDatabase
        db.beginTransaction()
        try {
            upsertBlobInTx(db, key, BUCKET_INVENTORY_ENTRY, detail.entry.id, WireJson.encodeToString(detail.entry), cachedAtEpochMs)
            db.delete("entry_memberships", "scope_key = ? AND entry_id = ?", arrayOf(key, detail.entry.id))
            detail.memberships.forEach { groupId ->
                val values = ContentValues().apply {
                    put("scope_key", key)
                    put("entry_id", detail.entry.id)
                    put("group_id", groupId)
                }
                db.insertWithOnConflict("entry_memberships", null, values, SQLiteDatabase.CONFLICT_REPLACE)
            }
            if (groups.groups.size.toLong() == groups.count) {
                db.delete("cache_blobs", "scope_key = ? AND bucket = ?", arrayOf(key, BUCKET_GROUP))
            }
            groups.groups.forEach { grp ->
                upsertBlobInTx(db, key, BUCKET_GROUP, grp.id, WireJson.encodeToString(grp), cachedAtEpochMs)
            }
            val groupsMeta = GroupsMeta(groups.revision, groups.count)
            upsertBlobInTx(db, key, BUCKET_GROUPS_META, SINGLETON_ID, WireJson.encodeToString(groupsMeta), cachedAtEpochMs)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    override fun loadEntryDetail(
        scope: AccountScope,
        entryId: String,
    ): CachedValue<Pair<EntryDetail, GroupPage>>? {
        val key = scopeCacheKey(scope)
        val entry = loadBlob(key, BUCKET_INVENTORY_ENTRY, entryId) {
            WireJson.decodeFromString<InventoryEntry>(it)
        } ?: return null
        val groupsMeta = loadBlob(key, BUCKET_GROUPS_META, SINGLETON_ID) {
            WireJson.decodeFromString<GroupsMeta>(it)
        }
        val sortedGroups = loadBucket(key, BUCKET_GROUP) { WireJson.decodeFromString<Group>(it) }
            .sortedWith(compareBy<Group>({ it.name.lowercase() }, { it.id }))
        val memberships = loadEntryMemberships(key, entryId)
        val revision = groupsMeta?.value?.revision ?: "0"
        val detail = EntryDetail(entry = entry.value, memberships = memberships, revision = revision)
        val groupPage = GroupPage(
            revision = revision,
            groups = sortedGroups,
            count = maxOf(groupsMeta?.value?.count ?: 0L, sortedGroups.size.toLong()),
        )
        return CachedValue(detail to groupPage, entry.cachedAtEpochMs)
    }

    @Synchronized
    override fun removeInventoryEntries(scope: AccountScope, entryIds: Collection<String>) {
        if (entryIds.isEmpty()) return
        val key = scopeCacheKey(scope)
        val db = writableDatabase
        db.beginTransaction()
        try {
            entryIds.forEach { id ->
                db.delete(
                    "cache_blobs",
                    "scope_key = ? AND bucket = ? AND item_id = ?",
                    arrayOf(key, BUCKET_INVENTORY_ENTRY, id),
                )
                db.delete(
                    "entry_memberships",
                    "scope_key = ? AND entry_id = ?",
                    arrayOf(key, id),
                )
            }
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
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
        val key = scopeCacheKey(scope)
        val db = writableDatabase
        db.beginTransaction()
        try {
            if (query.isEmpty() && offset == 0 && library.items.size.toLong() == library.globalTotal) {
                db.delete("cache_blobs", "scope_key = ? AND bucket = ?", arrayOf(key, BUCKET_DECK_SUMMARY))
            }
            library.items.forEach { deck ->
                upsertBlobInTx(db, key, BUCKET_DECK_SUMMARY, deck.id, WireJson.encodeToString(deck), cachedAtEpochMs)
            }
            val meta = DeckLibraryMeta(library.revision, library.globalTotal)
            upsertBlobInTx(db, key, BUCKET_DECK_META, SINGLETON_ID, WireJson.encodeToString(meta), cachedAtEpochMs)
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    @Synchronized
    override fun loadDeckLibrary(
        scope: AccountScope,
        query: String,
        offset: Int,
        limit: Int,
    ): CachedValue<DeckLibrary>? {
        val key = scopeCacheKey(scope)
        val meta = loadBlob(key, BUCKET_DECK_META, SINGLETON_ID) {
            WireJson.decodeFromString<DeckLibraryMeta>(it)
        } ?: return null
        val decks = loadBucket(key, BUCKET_DECK_SUMMARY) { WireJson.decodeFromString<DeckSummary>(it) }
        val library = buildCachedDeckLibrary(
            revision = meta.value.revision,
            globalTotal = meta.value.globalTotal,
            decks = decks,
            query = query,
            offset = offset,
            limit = limit,
        )
        return CachedValue(library, meta.cachedAtEpochMs)
    }

    @Synchronized
    override fun saveSelectedDeck(
        scope: AccountScope,
        deckId: String,
        deck: SelectedDeck,
        cachedAtEpochMs: Long,
    ) {
        upsertBlob(scopeCacheKey(scope), BUCKET_SELECTED_DECK, deckId, WireJson.encodeToString(deck), cachedAtEpochMs)
    }

    @Synchronized
    override fun loadSelectedDeck(scope: AccountScope, deckId: String): CachedValue<SelectedDeck>? =
        loadBlob(scopeCacheKey(scope), BUCKET_SELECTED_DECK, deckId) { WireJson.decodeFromString(it) }

    @Synchronized
    override fun saveDeckAvailability(
        scope: AccountScope,
        deckId: String,
        availability: DeckAvailability,
        cachedAtEpochMs: Long,
    ) {
        upsertBlob(scopeCacheKey(scope), BUCKET_DECK_AVAILABILITY, deckId, WireJson.encodeToString(availability), cachedAtEpochMs)
    }

    @Synchronized
    override fun loadDeckAvailability(
        scope: AccountScope,
        deckId: String,
    ): CachedValue<DeckAvailability>? =
        loadBlob(scopeCacheKey(scope), BUCKET_DECK_AVAILABILITY, deckId) { WireJson.decodeFromString(it) }

    @Synchronized
    override fun clearAccount(scope: AccountScope) {
        val key = scopeCacheKey(scope)
        val db = writableDatabase
        db.beginTransaction()
        try {
            db.delete("cache_blobs", "scope_key = ?", arrayOf(key))
            db.delete("entry_memberships", "scope_key = ?", arrayOf(key))
            db.setTransactionSuccessful()
        } finally {
            db.endTransaction()
        }
    }

    private fun upsertBlob(scopeKey: String, bucket: String, itemId: String, payload: String, cachedAtEpochMs: Long) {
        upsertBlobInTx(writableDatabase, scopeKey, bucket, itemId, payload, cachedAtEpochMs)
    }

    private fun upsertBlobInTx(
        db: SQLiteDatabase,
        scopeKey: String,
        bucket: String,
        itemId: String,
        payload: String,
        cachedAtEpochMs: Long,
    ) {
        val values = ContentValues().apply {
            put("scope_key", scopeKey)
            put("bucket", bucket)
            put("item_id", itemId)
            put("payload", payload)
            put("cached_at_ms", cachedAtEpochMs)
        }
        db.insertWithOnConflict("cache_blobs", null, values, SQLiteDatabase.CONFLICT_REPLACE)
    }

    private fun loadBlobInDb(db: SQLiteDatabase, scopeKey: String, bucket: String, itemId: String): Pair<String, Long>? =
        db.query(
            "cache_blobs",
            arrayOf("payload", "cached_at_ms"),
            "scope_key = ? AND bucket = ? AND item_id = ?",
            arrayOf(scopeKey, bucket, itemId),
            null,
            null,
            null,
        ).use { cursor ->
            if (!cursor.moveToFirst()) null else cursor.getString(0) to cursor.getLong(1)
        }

    private fun <T> loadBlob(scopeKey: String, bucket: String, itemId: String, decode: (String) -> T): CachedValue<T>? {
        val row = loadBlobInDb(readableDatabase, scopeKey, bucket, itemId) ?: return null
        return runCatching { CachedValue(decode(row.first), row.second) }.getOrNull()
    }

    private fun <T> loadBucket(scopeKey: String, bucket: String, decode: (String) -> T): List<T> {
        val items = mutableListOf<T>()
        readableDatabase.query(
            "cache_blobs",
            arrayOf("payload"),
            "scope_key = ? AND bucket = ?",
            arrayOf(scopeKey, bucket),
            null,
            null,
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                runCatching { decode(cursor.getString(0)) }.getOrNull()?.let { items += it }
            }
        }
        return items
    }

    private fun loadEntryMemberships(scopeKey: String, entryId: String): List<String> {
        val result = mutableListOf<String>()
        readableDatabase.query(
            "entry_memberships",
            arrayOf("group_id"),
            "scope_key = ? AND entry_id = ?",
            arrayOf(scopeKey, entryId),
            null,
            null,
            "group_id ASC",
        ).use { cursor ->
            while (cursor.moveToNext()) result += cursor.getString(0)
        }
        return result
    }

    private fun loadAllMemberships(scopeKey: String): Map<String, Set<String>> {
        val result = mutableMapOf<String, MutableSet<String>>()
        readableDatabase.query(
            "entry_memberships",
            arrayOf("entry_id", "group_id"),
            "scope_key = ?",
            arrayOf(scopeKey),
            null,
            null,
            null,
        ).use { cursor ->
            while (cursor.moveToNext()) {
                result.getOrPut(cursor.getString(0)) { linkedSetOf() }.add(cursor.getString(1))
            }
        }
        return result
    }

    private companion object {
        const val DB_NAME = "spellbook_read_cache_v1.db"
        const val DB_VERSION = 1
        const val SINGLETON_ID = "_"
        const val BUCKET_DASHBOARD = "dashboard"
        const val BUCKET_INVENTORY_META = "inventory_meta"
        const val BUCKET_INVENTORY_ENTRY = "inventory_entry"
        const val BUCKET_GROUPS_META = "groups_meta"
        const val BUCKET_GROUP = "group"
        const val BUCKET_CACHED_GROUP_FILTER = "cached_group_filter"
        const val BUCKET_DECK_META = "deck_meta"
        const val BUCKET_DECK_SUMMARY = "deck_summary"
        const val BUCKET_SELECTED_DECK = "selected_deck"
        const val BUCKET_DECK_AVAILABILITY = "deck_availability"
    }
}

class AndroidConnectivityObserver(context: Context) : ConnectivityObserver {
    private val manager = context.applicationContext.getSystemService(ConnectivityManager::class.java)
    private val _isOnline = MutableStateFlow(checkOnline())
    override val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) { _isOnline.value = checkOnline() }
        override fun onLost(network: Network) { _isOnline.value = checkOnline() }
        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            _isOnline.value = checkOnline()
        }
    }

    private val registered: Boolean = runCatching {
        manager?.registerDefaultNetworkCallback(callback)
        manager != null
    }.getOrDefault(false)

    private fun checkOnline(): Boolean {
        val cm = manager ?: return true
        val active = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(active) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    override fun close() {
        if (registered) runCatching { manager?.unregisterNetworkCallback(callback) }
    }
}
