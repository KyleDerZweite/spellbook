package dev.spellbook.data

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.buildJsonObject

class FakeConnectivityObserver(initialOnline: Boolean = true) : ConnectivityObserver {
    private val _isOnline = MutableStateFlow(initialOnline)
    override val isOnline: StateFlow<Boolean> = _isOnline.asStateFlow()

    fun setOnline(online: Boolean) {
        _isOnline.value = online
    }
}

class FakeLocalStorageAdapter(
    initialSession: Session? = null,
    override var appearance: String = "system",
) : LocalStorageAdapter {
    private var currentSession: Session? = initialSession
    private val drafts = mutableMapOf<String?, DraftState>()

    override fun session(): Session? = currentSession?.takeIf { it.isLive() }
    override fun saveSession(session: Session?) { currentSession = session }
    override fun draft(accountId: String?): DraftState = drafts[accountId] ?: DraftState()
    override fun saveDraft(accountId: String?, draft: DraftState) { drafts[accountId] = draft }
    override fun clearDraft(accountId: String?) { drafts.remove(accountId) }
}

class FakeAuthRepository(
    var validateHandler: suspend (String) -> SessionInfo = { error("validateSession not stubbed") },
    var authenticateHandler: suspend (Boolean, String, String) -> LoginResult = { _, _, _ -> error("authenticate not stubbed") },
    var logoutHandler: suspend (String) -> Unit = {},
    var profileHandler: suspend (String) -> Profile = { error("readProfile not stubbed") },
    var eventsHandler: suspend (String, suspend (String, String?) -> Unit) -> Unit = { _, _ -> },
) : AuthRepository {
    var validateCalls = 0
    var logoutCalls = 0

    override suspend fun validateSession(token: String): SessionInfo {
        validateCalls++
        return validateHandler(token)
    }

    override suspend fun authenticate(register: Boolean, username: String, password: String): LoginResult =
        authenticateHandler(register, username, password)

    override suspend fun logout(token: String) {
        logoutCalls++
        logoutHandler(token)
    }

    override suspend fun readProfile(token: String): Profile = profileHandler(token)

    override suspend fun observeEvents(token: String, onEvent: suspend (String, String?) -> Unit) =
        eventsHandler(token, onEvent)
}

class FakeCatalogRepository(
    var searchHandler: suspend (String, String, Int, Int) -> SearchResult = { q, _, _, _ -> SearchResult(emptyList(), q, 0) },
    var printingHandler: suspend (String) -> Pair<Printing, SearchResult> = { error("readPrinting not stubbed") },
) : CatalogRepository {
    override suspend fun search(query: String, color: String, offset: Int, limit: Int): SearchResult =
        searchHandler(query, color, offset, limit)

    override suspend fun readPrinting(printingId: String): Pair<Printing, SearchResult> =
        printingHandler(printingId)
}

class FakeInventoryRepository(
    private val cache: InMemoryReadCacheStore = InMemoryReadCacheStore(),
    private val connectivity: FakeConnectivityObserver = FakeConnectivityObserver(true),
    private val clockMs: () -> Long = { 1_700_000_000_000L },
) : InventoryRepository {
    var remoteDashboard: Dashboard? = null
    var remoteInventory: InventoryPage? = null
    var remoteGroups: GroupPage? = null
    var remoteEntry: Pair<EntryDetail, GroupPage>? = null
    var remoteFailure: Exception? = null
    var mutationHandler: suspend (AccountScope, String, MutationAttempt) -> SubmittedMutation = { _, _, attempt ->
        val raw = """{"requestId":"${attempt.requestId}","revision":"2","changes":[],"removedEntryIds":[]}"""
        SubmittedMutation(WireJson.decodeFromString(raw), attempt.copy(confirmedReceipt = raw))
    }
    val submittedMutations = mutableListOf<MutationAttempt>()
    val clearedScopes = mutableListOf<AccountScope>()

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
            """{"requestId":"$requestId","quantity":${intent.quantity}}""", requestId,
        )
        is InventoryMutation.SaveGroups -> MutationAttempt(
            scope.backend, scope.accountId, "PUT", "/api/v1/mtg/inventory/${intent.entryId}/groups",
            """{"requestId":"$requestId","groupIds":[]}""", requestId,
        )
        is InventoryMutation.CreateGroup -> MutationAttempt(
            scope.backend, scope.accountId, "POST", "/api/v1/mtg/inventory/groups",
            """{"requestId":"$requestId","name":"${intent.name}"}""", requestId,
        )
    }

    override fun prepareRemoval(
        scope: AccountScope,
        entry: InventoryEntry,
        requestId: String,
    ): ReviewedRemoval = reviewRemoval(entry, scope, requestId)

    override fun isAddAttempt(attempt: MutationAttempt): Boolean =
        attempt.method == "POST" && attempt.path == "/api/v1/mtg/inventory"

    override suspend fun readDashboard(
        scope: AccountScope,
        token: String,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<Dashboard> = readThrough(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        fromCache = { cache.loadDashboard(scope) },
        fromRemote = {
            remoteFailure?.let { throw it }
            remoteDashboard ?: throw TransportFailure()
        },
        toCache = { value, now -> cache.saveDashboard(scope, value, now) },
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
    ): ReadResult<InventoryPage> = readThrough(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        fromCache = { cache.loadInventoryPage(scope, query, group, offset, limit) },
        fromRemote = {
            remoteFailure?.let { throw it }
            val page = remoteInventory ?: throw TransportFailure()
            if (query.isEmpty() && group.isEmpty() && offset == 0) page
            else buildCachedInventoryPage(
                revision = page.revision,
                totals = page.totals,
                groupCount = page.groupCount,
                entries = page.entries,
                groups = page.groups,
                membershipsByEntry = emptyMap(),
                query = query,
                group = group,
                offset = offset,
                limit = limit,
            )
        },
        toCache = { value, now -> cache.saveInventoryPage(scope, query, group, offset, value, now) },
    )

    override suspend fun readGroups(
        scope: AccountScope,
        token: String,
        offset: Int,
        limit: Int,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<GroupPage> = readThrough(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        fromCache = { cache.loadGroups(scope, offset, limit) },
        fromRemote = {
            remoteFailure?.let { throw it }
            remoteGroups ?: throw TransportFailure()
        },
        toCache = { value, now -> cache.saveGroups(scope, value, now) },
    )

    override suspend fun readEntry(
        scope: AccountScope,
        token: String,
        entryId: String,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<Pair<EntryDetail, GroupPage>> = readThrough(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        fromCache = { cache.loadEntryDetail(scope, entryId) },
        fromRemote = {
            remoteFailure?.let { throw it }
            remoteEntry ?: throw TransportFailure()
        },
        toCache = { (detail, groups), now -> cache.saveEntryDetail(scope, detail, groups, now) },
    )

    override suspend fun submitMutation(scope: AccountScope, token: String, attempt: MutationAttempt): SubmittedMutation {
        if (!connectivity.isOnline.value) throw OfflineWriteUnsupportedException()
        submittedMutations += attempt
        return mutationHandler(scope, token, attempt)
    }

    override suspend fun clearCache(scope: AccountScope) {
        clearedScopes += scope
        cache.clearAccount(scope)
    }

    private suspend fun <T> readThrough(
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
        fromCache: () -> CachedValue<T>?,
        fromRemote: suspend () -> T,
        toCache: (T, Long) -> Unit,
    ): ReadResult<T> {
        if (cacheOnly || (!connectivity.isOnline.value && allowCacheFallback)) {
            val cached = fromCache() ?: throw TransportFailure()
            return ReadResult(cached.value, DataSource.CACHE, cached.cachedAtEpochMs)
        }
        return try {
            val remote = fromRemote()
            toCache(remote, clockMs())
            ReadResult(remote, DataSource.REMOTE)
        } catch (failure: TransportFailure) {
            if (!allowCacheFallback) throw failure
            val cached = fromCache() ?: throw failure
            ReadResult(cached.value, DataSource.CACHE, cached.cachedAtEpochMs)
        }
    }
}

class FakeDeckRepository(
    private val cache: InMemoryReadCacheStore = InMemoryReadCacheStore(),
    private val connectivity: FakeConnectivityObserver = FakeConnectivityObserver(true),
    private val clockMs: () -> Long = { 1_700_000_000_000L },
) : DeckRepository {
    var remoteLibrary: DeckLibrary? = null
    var remoteSelected: SelectedDeck? = null
    var remoteAvailability: DeckAvailability? = null
    var remoteFailure: Exception? = null
    val clearedScopes = mutableListOf<AccountScope>()

    override suspend fun readDeckLibrary(
        scope: AccountScope,
        token: String,
        query: String,
        offset: Int,
        limit: Int,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<DeckLibrary> = readThrough(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        fromCache = { cache.loadDeckLibrary(scope, query, offset, limit) },
        fromRemote = {
            remoteFailure?.let { throw it }
            val library = remoteLibrary ?: throw TransportFailure()
            if (query.isEmpty() && offset == 0) library
            else buildCachedDeckLibrary(library.revision, library.globalTotal, library.items, query, offset, limit)
        },
        toCache = { value, now -> cache.saveDeckLibrary(scope, query, offset, value, now) },
    )

    override suspend fun readSelectedDeck(
        scope: AccountScope,
        token: String,
        deckId: String,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<SelectedDeck> = readThrough(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        fromCache = { cache.loadSelectedDeck(scope, deckId) },
        fromRemote = {
            remoteFailure?.let { throw it }
            remoteSelected ?: throw TransportFailure()
        },
        toCache = { value, now -> cache.saveSelectedDeck(scope, deckId, value, now) },
    )

    override suspend fun readDeckAvailability(
        scope: AccountScope,
        token: String,
        deckId: String,
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
    ): ReadResult<DeckAvailability> = readThrough(
        cacheOnly = cacheOnly,
        allowCacheFallback = allowCacheFallback,
        fromCache = { cache.loadDeckAvailability(scope, deckId) },
        fromRemote = {
            remoteFailure?.let { throw it }
            remoteAvailability ?: throw TransportFailure()
        },
        toCache = { value, now -> cache.saveDeckAvailability(scope, deckId, value, now) },
    )

    override suspend fun clearCache(scope: AccountScope) {
        clearedScopes += scope
        cache.clearAccount(scope)
    }

    private suspend fun <T> readThrough(
        cacheOnly: Boolean,
        allowCacheFallback: Boolean,
        fromCache: () -> CachedValue<T>?,
        fromRemote: suspend () -> T,
        toCache: (T, Long) -> Unit,
    ): ReadResult<T> {
        if (cacheOnly || (!connectivity.isOnline.value && allowCacheFallback)) {
            val cached = fromCache() ?: throw TransportFailure()
            return ReadResult(cached.value, DataSource.CACHE, cached.cachedAtEpochMs)
        }
        return try {
            val remote = fromRemote()
            toCache(remote, clockMs())
            ReadResult(remote, DataSource.REMOTE)
        } catch (failure: TransportFailure) {
            if (!allowCacheFallback) throw failure
            val cached = fromCache() ?: throw failure
            ReadResult(cached.value, DataSource.CACHE, cached.cachedAtEpochMs)
        }
    }
}

class FakeScanRepository(
    private val connectivity: FakeConnectivityObserver = FakeConnectivityObserver(true),
    var status: ScanCaptureStatus = ScanCaptureStatus(
        available = false,
        title = "Camera recognition unavailable",
        detail = "Fake scan adapter: capture unavailable in v1.",
    ),
    var qrHandler: suspend (String, String) -> QrRequest = { _, code ->
        QrRequest(code = code, kind = "device", status = "pending", expiresAt = "2099-01-01T00:00:00Z")
    },
) : ScanRepository {
    val decisions = mutableListOf<Triple<String, String, Boolean>>()

    override fun captureStatus(): ScanCaptureStatus = status

    override suspend fun readQrRequest(token: String, code: String): QrRequest = qrHandler(token, code)

    override suspend fun decideQrRequest(token: String, code: String, decision: String, confirmed: Boolean) {
        if (!connectivity.isOnline.value) throw OfflineWriteUnsupportedException()
        decisions += Triple(code, decision, confirmed)
    }
}

internal fun sampleProfile(user: User) = Profile(user, buildJsonObject { }, null, null)
