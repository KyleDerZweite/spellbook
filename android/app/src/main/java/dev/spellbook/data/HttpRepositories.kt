package dev.spellbook.data

import android.content.Context
import dev.spellbook.BuildConfig
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.add
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlinx.serialization.json.putJsonObject

private fun Api?.orFail(): Api =
    this ?: error("API address is not configured. Set the HTTPS API origin at build time.")

private inline fun <T> mapHttpErrors(block: () -> T): T = try {
    block()
} catch (failure: ApiFailure) {
    if (failure.status == 401) throw RepositoryFailure.Unauthorized(failure.message ?: "Authentication required.")
    throw RepositoryFailure.RequestFailed(failure.message ?: "Request failed.")
}

private fun ApiFailure.toMutationFailure(): RepositoryFailure {
    if (status == 401) return RepositoryFailure.Unauthorized(message ?: "Authentication required.")
    val conflict = if (status == 409) when (kind) {
        "NotesConflict" -> MutationConflict.NotesConflict(detail["notes"]?.jsonPrimitive?.contentOrNull.orEmpty())
        "QuantityChanged" -> MutationConflict.QuantityChanged
        else -> MutationConflict.Other
    } else null
    return RepositoryFailure.MutationRejected(
        message = message ?: "Save not confirmed.",
        definitive = isDefinitiveMutationFailure(),
        conflict = conflict,
    )
}

class HttpAuthRepository(private val api: Api?) : AuthRepository {
    override suspend fun validateSession(token: String): SessionInfo =
        mapHttpErrors { api.orFail().get("/api/v1/auth/session", token) }

    override suspend fun authenticate(register: Boolean, username: String, password: String): LoginResult =
        mapHttpErrors {
            WireJson.decodeFromString(
                api.orFail().request(
                    path = "/api/v1/auth/${if (register) "register" else "login"}",
                    method = "POST",
                    body = jsonBody { put("username", username); put("password", password) },
                ),
            )
        }

    override suspend fun logout(token: String) {
        mapHttpErrors { api.orFail().request("/api/v1/auth/logout", token, "POST") }
    }

    override suspend fun readProfile(token: String): Profile =
        mapHttpErrors { api.orFail().get("/api/v1/account/profile", token) }

    override suspend fun observeEvents(token: String, onEvent: suspend (String, String?) -> Unit) {
        mapHttpErrors { api.orFail().events(token, onEvent) }
    }
}

class HttpCatalogRepository(private val api: Api?) : CatalogRepository {
    override suspend fun search(query: String, color: String, offset: Int, limit: Int): SearchResult =
        mapHttpErrors {
            val body = jsonBody {
                put("query", query)
                put("limit", limit)
                put("offset", offset)
                if (color.isNotEmpty()) putJsonObject("filters") { putJsonArray("colors") { add(color) } }
            }
            WireJson.decodeFromString(api.orFail().request("/api/v1/mtg/catalog/search", method = "POST", body = body))
        }

    override suspend fun readPrinting(printingId: String): Pair<Printing, SearchResult> =
        mapHttpErrors {
            val client = api.orFail()
            val printing = client.get<Printing>("/api/v1/mtg/catalog/printings/$printingId")
            val printings = client.get<SearchResult>("/api/v1/mtg/catalog/cards/${printing.oracle_id}/printings?limit=30&offset=0")
            printing to printings
        }
}

class HttpInventoryRepository(
    private val api: Api?,
    private val cache: ReadCacheStore,
    private val connectivity: ConnectivityObserver,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val clockMs: () -> Long = System::currentTimeMillis,
) : InventoryRepository {

    override suspend fun readDashboard(
        scope: AccountScope,
        token: String,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<Dashboard> = readWithCache(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        readCache = { cache.loadDashboard(scope) },
        readRemote = { api.orFail().get("/api/v1/mtg/dashboard", token) },
        writeCache = { value, now -> cache.saveDashboard(scope, value, now) },
    )

    override suspend fun readInventory(
        scope: AccountScope,
        token: String,
        query: String,
        group: String,
        offset: Int,
        limit: Int,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<InventoryPage> = readWithCache(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        readCache = { cache.loadInventoryPage(scope, query, group, offset, limit) },
        readRemote = {
            val groupParam = if (group.isNotEmpty()) "&group=${query(group)}" else ""
            api.orFail().get("/api/v1/mtg/inventory?limit=$limit&offset=$offset&q=${query(query)}$groupParam", token)
        },
        writeCache = { value, now -> cache.saveInventoryPage(scope, query, group, offset, value, now) },
    )

    override suspend fun readGroups(
        scope: AccountScope,
        token: String,
        offset: Int,
        limit: Int,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<GroupPage> = readWithCache(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        readCache = { cache.loadGroups(scope, offset, limit) },
        readRemote = { api.orFail().get("/api/v1/mtg/inventory/groups?limit=$limit&offset=$offset", token) },
        writeCache = { value, now -> cache.saveGroups(scope, value, now) },
    )

    override suspend fun readEntry(
        scope: AccountScope,
        token: String,
        entryId: String,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<Pair<EntryDetail, GroupPage>> = readWithCache(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        readCache = { cache.loadEntryDetail(scope, entryId) },
        readRemote = {
            val client = api.orFail()
            val detail = client.get<EntryDetail>("/api/v1/mtg/inventory/$entryId", token)
            val groups = client.get<GroupPage>("/api/v1/mtg/inventory/groups?limit=500", token)
            detail to groups
        },
        writeCache = { (detail, groups), now -> cache.saveEntryDetail(scope, detail, groups, now) },
    )

    override fun prepareMutation(
        scope: AccountScope,
        intent: InventoryMutation,
        requestId: String,
    ): MutationAttempt = when (intent) {
        is InventoryMutation.Add -> MutationAttempt(
            scope.backend, scope.accountId, "POST", "/api/v1/mtg/inventory",
            inventoryAddBody(intent.draft, requestId), requestId,
        )
        is InventoryMutation.PatchEntry -> MutationAttempt(
            scope.backend, scope.accountId, "PATCH", "/api/v1/mtg/inventory/${intent.entry.id}",
            jsonBody {
                put("requestId", requestId)
                put("quantity", intent.quantity)
                if (intent.notes != intent.entry.notes) {
                    put("notes", intent.notes)
                    put("notesRevision", intent.entry.notesRevision)
                }
            },
            requestId,
        )
        is InventoryMutation.SaveGroups -> MutationAttempt(
            scope.backend, scope.accountId, "PUT", "/api/v1/mtg/inventory/${intent.entryId}/groups",
            jsonBody {
                put("requestId", requestId)
                putJsonArray("groupIds") { intent.groupIds.sorted().forEach { add(it) } }
            },
            requestId,
        )
        is InventoryMutation.CreateGroup -> MutationAttempt(
            scope.backend, scope.accountId, "POST", "/api/v1/mtg/inventory/groups",
            jsonBody {
                put("requestId", requestId)
                put("name", intent.name)
            },
            requestId,
        )
    }

    override fun prepareRemoval(
        scope: AccountScope,
        entry: InventoryEntry,
        requestId: String,
    ): ReviewedRemoval = reviewRemoval(entry, scope, requestId)

    override fun isAddAttempt(attempt: MutationAttempt): Boolean =
        attempt.method == "POST" && attempt.path == "/api/v1/mtg/inventory"

    override suspend fun submitMutation(scope: AccountScope, token: String, attempt: MutationAttempt): SubmittedMutation {
        if (!connectivity.isOnline.value) throw OfflineWriteUnsupportedException()
        val raw = try {
            api.orFail().request(attempt.path, token, attempt.method, attempt.body)
        } catch (failure: ApiFailure) {
            throw failure.toMutationFailure()
        }
        val receipt = WireJson.decodeFromString<InventoryReceipt>(raw)
        check(receipt.requestId == attempt.requestId) { "The server receipt does not match this request." }
        val confirmed = attempt.copy(confirmedReceipt = raw)
        if (receipt.removedEntryIds.isNotEmpty()) {
            withContext(ioDispatcher) { runCatching { cache.removeInventoryEntries(scope, receipt.removedEntryIds) } }
        }
        return SubmittedMutation(receipt, confirmed)
    }

    override suspend fun clearCache(scope: AccountScope) {
        withContext(ioDispatcher) { cache.clearAccount(scope) }
    }

    private suspend fun <T> readWithCache(
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
        readCache: () -> CachedValue<T>?,
        readRemote: suspend () -> T,
        writeCache: (T, Long) -> Unit,
    ): ReadResult<T> {
        if (cacheOnly || (!connectivity.isOnline.value && allowCacheFallback)) {
            val cached = withContext(ioDispatcher) { readCache() }
                ?: throw TransportFailure()
            return ReadResult(cached.value, DataSource.CACHE, cached.cachedAtEpochMs)
        }
        return try {
            val remote = mapHttpErrors { readRemote() }
            withContext(ioDispatcher) { runCatching { writeCache(remote, clockMs()) } }
            ReadResult(remote, DataSource.REMOTE)
        } catch (failure: TransportFailure) {
            if (!allowCacheFallback) throw failure
            val cached = withContext(ioDispatcher) { readCache() } ?: throw failure
            ReadResult(cached.value, DataSource.CACHE, cached.cachedAtEpochMs)
        }
    }
}

class HttpDeckRepository(
    private val api: Api?,
    private val cache: ReadCacheStore,
    private val connectivity: ConnectivityObserver,
    private val ioDispatcher: CoroutineDispatcher = Dispatchers.IO,
    private val clockMs: () -> Long = System::currentTimeMillis,
) : DeckRepository {

    override suspend fun readDeckLibrary(
        scope: AccountScope,
        token: String,
        query: String,
        offset: Int,
        limit: Int,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<DeckLibrary> = readWithCache(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        readCache = { cache.loadDeckLibrary(scope, query, offset, limit) },
        readRemote = {
            api.orFail().get("/api/v1/mtg/deck-library?limit=$limit&offset=$offset&dirQ=${query(query)}", token)
        },
        writeCache = { value, now -> cache.saveDeckLibrary(scope, query, offset, value, now) },
    )

    override suspend fun readSelectedDeck(
        scope: AccountScope,
        token: String,
        deckId: String,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<SelectedDeck> = readWithCache(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        readCache = { cache.loadSelectedDeck(scope, deckId) },
        readRemote = { api.orFail().get("/api/v1/mtg/decks/$deckId?selectedOnly=true", token) },
        writeCache = { value, now -> cache.saveSelectedDeck(scope, deckId, value, now) },
    )

    override suspend fun readDeckAvailability(
        scope: AccountScope,
        token: String,
        deckId: String,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<DeckAvailability> = readWithCache(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        readCache = { cache.loadDeckAvailability(scope, deckId) },
        readRemote = { api.orFail().get("/api/v1/mtg/decks/$deckId/availability", token) },
        writeCache = { value, now -> cache.saveDeckAvailability(scope, deckId, value, now) },
    )

    override suspend fun clearCache(scope: AccountScope) {
        withContext(ioDispatcher) { cache.clearAccount(scope) }
    }

    private suspend fun <T> readWithCache(
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
        readCache: () -> CachedValue<T>?,
        readRemote: suspend () -> T,
        writeCache: (T, Long) -> Unit,
    ): ReadResult<T> {
        if (cacheOnly || (!connectivity.isOnline.value && allowCacheFallback)) {
            val cached = withContext(ioDispatcher) { readCache() }
                ?: throw TransportFailure()
            return ReadResult(cached.value, DataSource.CACHE, cached.cachedAtEpochMs)
        }
        return try {
            val remote = mapHttpErrors { readRemote() }
            withContext(ioDispatcher) { runCatching { writeCache(remote, clockMs()) } }
            ReadResult(remote, DataSource.REMOTE)
        } catch (failure: TransportFailure) {
            if (!allowCacheFallback) throw failure
            val cached = withContext(ioDispatcher) { readCache() } ?: throw failure
            ReadResult(cached.value, DataSource.CACHE, cached.cachedAtEpochMs)
        }
    }
}

class HttpScanRepository(
    private val api: Api?,
    private val connectivity: ConnectivityObserver,
) : ScanRepository {
    override fun captureStatus(): ScanCaptureStatus = ScanCaptureStatus(
        available = false,
        title = "Camera recognition unavailable",
        detail = "Phone capture and local card recognition do not have an implemented native adapter yet. Choose a Printing with Search and confirm Inventory ownership explicitly.",
    )

    override suspend fun readQrRequest(token: String, code: String): QrRequest =
        mapHttpErrors { api.orFail().get("/api/v1/auth/qr/requests/${query(code)}", token) }

    override suspend fun decideQrRequest(token: String, code: String, decision: String, confirmed: Boolean) {
        if (!connectivity.isOnline.value) throw OfflineWriteUnsupportedException()
        mapHttpErrors {
            api.orFail().request(
                path = "/api/v1/auth/qr/requests/${query(code)}/decision",
                token = token,
                method = "POST",
                body = jsonBody {
                    put("decision", decision)
                    if (confirmed) put("confirmed", true)
                },
            )
        }
    }
}

fun createAndroidRepositories(context: Context): AppRepositories {
    val configured = runCatching { normalizeBackend(BuildConfig.API_BASE_URL, BuildConfig.DEBUG) }
    val backend = configured.getOrDefault("")
    val storage = PrivateStore(context, backend)
    val api = if (backend.isNotEmpty()) Api(backend) else null
    val connectivity = AndroidConnectivityObserver(context)
    val cache = SqliteReadCacheStore(context)
    return AppRepositories(
        backend = backend,
        configurationError = configured.exceptionOrNull()?.message,
        storage = storage,
        connectivity = connectivity,
        auth = HttpAuthRepository(api),
        catalog = HttpCatalogRepository(api),
        inventory = HttpInventoryRepository(api, cache, connectivity),
        decks = HttpDeckRepository(api, cache, connectivity),
        scan = HttpScanRepository(api, connectivity),
        onClose = {
            connectivity.close()
            cache.close()
            api?.close()
        },
    )
}
