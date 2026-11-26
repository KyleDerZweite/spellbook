package dev.spellbook.feature

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.viewModelScope
import androidx.navigation3.runtime.NavKey
import dev.spellbook.data.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.Serializable
import java.time.Duration
import java.time.Instant

@Serializable data class Route(val screen: String, val id: String = "", val context: String = "") : NavKey

sealed interface ScreenData {
    data class Home(val value: Dashboard) : ScreenData
    data class Search(val value: SearchResult) : ScreenData
    data class PrintingDetail(val value: Printing, val printings: SearchResult) : ScreenData
    data class Inventory(val value: InventoryPage) : ScreenData
    data class Groups(val value: GroupPage) : ScreenData
    data class Entry(val value: EntryDetail, val groups: GroupPage) : ScreenData
    data class Decks(val value: DeckLibrary) : ScreenData
    data class Selected(val value: SelectedDeck) : ScreenData
    data class Available(val value: DeckAvailability) : ScreenData
    data class Account(val value: Profile) : ScreenData
    data class Qr(val value: QrRequest) : ScreenData
}

data class AppState(
    val session: Session? = null, val verified: Boolean = false, val checkingSession: Boolean = false,
    val sessionRevoked: Boolean = false,
    val data: ScreenData? = null, val dataSource: DataSource? = null, val cachedAtEpochMs: Long? = null,
    val isOffline: Boolean = false,
    val loading: Boolean = false, val error: String? = null,
    val authError: String? = null, val authenticating: Boolean = false,
    val draft: DraftState = DraftState(), val saving: Boolean = false, val writeError: String? = null,
    val notice: String? = null, val live: String = "", val appearance: String = "system",
    val search: String = "", val color: String = "", val offset: Int = 0,
    val browsing: PrivateBrowsingContext = PrivateBrowsingContext(), val formGeneration: Int = 0,
    val identityReady: Boolean = false,
    val scanCaptureStatus: ScanCaptureStatus = ScanCaptureStatus(
        available = false,
        title = "Camera recognition unavailable",
        detail = "Phone capture and local card recognition do not have an implemented native adapter yet. Choose a Printing with Search and confirm Inventory ownership explicitly.",
    ),
) {
    val inventoryQuery get() = browsing.inventoryQuery
    val inventoryGroup get() = browsing.inventoryGroup
    val inventoryOffset get() = browsing.inventoryOffset
    val deckQuery get() = browsing.deckQuery
    val deckOffset get() = browsing.deckOffset
    val canBrowsePrivate: Boolean get() = verified || (isOffline && !sessionRevoked && session?.isLive() == true)
    val canWriteOnline: Boolean get() = verified && !isOffline && !sessionRevoked

    fun authExpired(credentialCleared: Boolean = true): AppState = copy(
        verified = false, sessionRevoked = true, checkingSession = false, data = null, dataSource = null, cachedAtEpochMs = null,
        loading = false, saving = false, authenticating = false, live = "",
        notice = "Session expired. Sign in again to resume your account's draft.",
        error = if (credentialCleared) null else "Local credential removal failed. Private access is disabled; retry removing local sign-in.",
    )
}

class AppModel(
    private val repos: AppRepositories,
    private val baseScope: CoroutineScope? = null,
    private val now: () -> Instant = Instant::now,
) : ViewModel() {
    val backend: String = repos.backend
    private val store: LocalStorageAdapter = repos.storage
    private val _state = MutableStateFlow(
        AppState(
            appearance = store.appearance,
            error = repos.configurationError,
            isOffline = !repos.connectivity.isOnline.value,
            scanCaptureStatus = repos.scan.captureStatus(),
        ),
    )
    val state: StateFlow<AppState> = _state.asStateFlow()
    private var route = Route("home")
    private var foreground: Job? = null
    private var connectivityJob: Job? = null
    private var read: Job? = null
    private var validation: Job? = null
    private var stream: Job? = null
    private var mutation: Job? = null
    private var expiry: Job? = null
    private var qr: Job? = null
    private var epoch = 0
    private var active = false
    private var sessionLoaded = false
    private val sessionRequests = SessionRequests { AuthIntentContext(backend, state.value.session?.user?.accountId, epoch) }

    private fun update(block: (AppState) -> AppState) { _state.update(block) }
    private fun parentScope(): CoroutineScope = baseScope ?: viewModelScope
    private fun scope(): CoroutineScope = CoroutineScope(parentScope().coroutineContext + (foreground ?: Job().also { it.cancel() }))

    fun foreground(value: Boolean) {
        if (active == value) return
        active = value
        if (!value) {
            sessionRequests.cancel()
            cancelPrivateWork()
            connectivityJob?.cancel(); connectivityJob = null
            foreground?.cancel(); foreground = null; read = null; validation = null; stream = null
            update { it.copy(data = null, dataSource = null, cachedAtEpochMs = null, loading = false, saving = false, authenticating = false, checkingSession = false, live = "") }
            return
        }
        foreground = SupervisorJob(parentScope().coroutineContext[Job])
        if (!sessionLoaded) {
            sessionLoaded = true
            val session = store.session()
            update { it.copy(session = session, draft = store.draft(session?.user?.accountId), identityReady = true) }
        }
        observeConnectivity()
        validateSession()
    }

    private fun observeConnectivity() {
        connectivityJob?.cancel()
        connectivityJob = scope().launch {
            var previous = repos.connectivity.isOnline.value
            update { it.copy(isOffline = !previous) }
            repos.connectivity.isOnline.collect { online ->
                if (online == previous) return@collect
                previous = online
                if (!online) {
                    stream?.cancel(); stream = null
                    update { it.copy(isOffline = true, live = "") }
                } else {
                    val currentSession = state.value.session
                    if (currentSession != null && !state.value.sessionRevoked) {
                        // Keep writes disabled until authenticated backend reachability is confirmed.
                        validateSession(forceOnlineCheck = true)
                    } else {
                        update { it.copy(isOffline = false, writeError = null) }
                        refresh()
                    }
                }
            }
        }
    }

    fun retryConnection() {
        if (state.value.session != null) validateSession(forceOnlineCheck = true)
        else {
            update { it.copy(isOffline = !repos.connectivity.isOnline.value) }
            refresh()
        }
    }

    fun cancelAuthentication() {
        sessionRequests.cancel()
        update { it.copy(authenticating = false) }
    }

    fun navigate(next: Route) {
        if (route.screen == "auth" && next != route) cancelAuthentication()
        if (route.screen == "qr" && next != route) qr?.cancel()
        route = next
        update { it.copy(data = null, dataSource = null, cachedAtEpochMs = null, loading = false, error = null, authError = null) }
        refresh()
    }

    fun validateSession(forceOnlineCheck: Boolean = false) {
        sessionRequests.cancel()
        val session = state.value.session
        val online = repos.connectivity.isOnline.value
        if (session == null || state.value.sessionRevoked) {
            update { it.copy(verified = false, isOffline = !online) }
            refresh()
            return
        }
        if (!session.isLive(now())) { expire(); return }
        mutation?.cancel(); stream?.cancel()
        if (!online && !forceOnlineCheck) {
            update { it.copy(checkingSession = false, verified = false, isOffline = true, error = null, live = "") }
            startExpiry()
            refresh()
            return
        }
        update { it.copy(checkingSession = true, verified = false, data = null, dataSource = null, cachedAtEpochMs = null, saving = false) }
        val owner = ++epoch
        read?.cancel()
        validation?.cancel()
        validation = scope().launch {
            try {
                val info = repos.auth.validateSession(session.token)
                if (owner != epoch || !isActive) return@launch
                val validated = session.copy(user = info.user, expiresAt = info.expiresAt)
                check(validated.user.accountId == session.user.accountId && validated.isLive(now()))
                store.saveSession(validated)
                val currentlyOffline = !repos.connectivity.isOnline.value
                update { it.copy(session = validated, verified = true, isOffline = currentlyOffline, checkingSession = false, error = null) }
                refresh()
                if (!currentlyOffline) startEvents()
                startExpiry()
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (cause: Exception) {
                if (owner != epoch || !isActive) return@launch
                when {
                    cause is RepositoryFailure.Unauthorized -> expire()
                    cause is TransportFailure && session.isLive(now()) -> {
                        update { it.copy(checkingSession = false, verified = false, isOffline = true, error = null, live = "") }
                        startExpiry()
                        refresh()
                    }
                    else -> update { it.copy(checkingSession = false, error = cause.message ?: "Session check unavailable.") }
                }
            }
        }
    }

    private fun privateToken(): String {
        val session = state.value.session ?: error("Sign in to continue.")
        if (!session.isLive(now())) { expire(); error("Sign in again to continue.") }
        check(state.value.verified) { "Sign in again to continue." }
        return session.token
    }

    private fun cancelPrivateWork() {
        ++epoch
        read?.cancel(); validation?.cancel(); stream?.cancel(); mutation?.cancel(); expiry?.cancel(); qr?.cancel()
    }

    private fun expire() {
        val expiredScope = state.value.session?.user?.accountId?.let { AccountScope(backend, it) }
        sessionRequests.cancel()
        cancelPrivateWork()
        // Keep this account's unsaved draft under its account key, never under guest.
        val cleared = runCatching { store.saveSession(null) }.isSuccess
        update { it.authExpired(cleared) }
        if (expiredScope != null) {
            parentScope().launch {
                runCatching { repos.inventory.clearCache(expiredScope) }
                runCatching { repos.decks.clearCache(expiredScope) }
            }
        }
    }

    fun refresh() {
        if (!active) return
        read?.cancel()
        val target = route
        val cacheablePrivate = target.screen in CACHEABLE_PRIVATE_SCREENS
        val onlineOnlyPrivate = target.screen in ONLINE_ONLY_PRIVATE_SCREENS
        val privateScreen = cacheablePrivate || onlineOnlyPrivate
        if (privateScreen && !state.value.canBrowsePrivate) {
            update { it.copy(data = null, dataSource = null, cachedAtEpochMs = null, loading = false) }
            return
        }
        if (target.screen !in READABLE_SCREENS) return
        val owner = epoch
        val snapshot = state.value
        update { it.copy(loading = true, error = null) }
        read = scope().launch {
            try {
                val readResult: ReadResult<ScreenData> = when (target.screen) {
                    "search" -> ReadResult(
                        ScreenData.Search(repos.catalog.search(snapshot.search, snapshot.color, snapshot.offset)),
                        DataSource.REMOTE,
                    )
                    "printing" -> {
                        val (printing, printings) = repos.catalog.readPrinting(target.id)
                        ReadResult(ScreenData.PrintingDetail(printing, printings), DataSource.REMOTE)
                    }
                    "profile" -> {
                        if (!snapshot.canWriteOnline) throw OfflineWriteUnsupportedException("Profile is unavailable while offline.")
                        ReadResult(ScreenData.Account(repos.auth.readProfile(privateToken())), DataSource.REMOTE)
                    }
                    "qr" -> {
                        if (!snapshot.canWriteOnline) throw OfflineWriteUnsupportedException("QR sign-in inspection requires an internet connection.")
                        ReadResult(ScreenData.Qr(repos.scan.readQrRequest(privateToken(), target.id)), DataSource.REMOTE)
                    }
                    else -> {
                        val session = snapshot.session ?: error("Sign in to continue.")
                        if (!session.isLive(now())) { expire(); return@launch }
                        val accountScope = AccountScope(backend, session.user.accountId)
                        val cacheOnly = !snapshot.verified || !repos.connectivity.isOnline.value
                        when (target.screen) {
                            "home" -> repos.inventory.readDashboard(accountScope, session.token, cacheOnly = cacheOnly).map(ScreenData::Home)
                            "inventory" -> repos.inventory.readInventory(
                                accountScope, session.token, snapshot.inventoryQuery, snapshot.inventoryGroup, snapshot.inventoryOffset, cacheOnly = cacheOnly,
                            ).map(ScreenData::Inventory)
                            "groups" -> repos.inventory.readGroups(accountScope, session.token, snapshot.inventoryOffset, cacheOnly = cacheOnly).map(ScreenData::Groups)
                            "entry" -> repos.inventory.readEntry(accountScope, session.token, target.id, cacheOnly = cacheOnly).map { ScreenData.Entry(it.first, it.second) }
                            "decks" -> repos.decks.readDeckLibrary(accountScope, session.token, snapshot.deckQuery, snapshot.deckOffset, cacheOnly = cacheOnly).map(ScreenData::Decks)
                            "deck" -> repos.decks.readSelectedDeck(accountScope, session.token, target.id, cacheOnly = cacheOnly).map(ScreenData::Selected)
                            "availability" -> repos.decks.readDeckAvailability(accountScope, session.token, target.id, cacheOnly = cacheOnly).map(ScreenData::Available)
                            else -> error("Unknown screen")
                        }
                    }
                }
                if (owner == epoch && isActive && route == target) {
                    val fromCache = readResult.source == DataSource.CACHE
                    val wasOffline = state.value.isOffline
                    if (fromCache) { stream?.cancel(); stream = null }
                    update {
                        it.copy(
                            data = readResult.value,
                            dataSource = readResult.source,
                            cachedAtEpochMs = readResult.cachedAtEpochMs,
                            isOffline = when {
                                fromCache -> true
                                !privateScreen && it.session != null -> it.isOffline
                                else -> !repos.connectivity.isOnline.value
                            },
                            live = if (fromCache) "" else it.live,
                            loading = false,
                            error = null,
                        )
                    }
                    if (privateScreen && !fromCache && wasOffline && state.value.verified && stream?.isActive != true) {
                        startEvents()
                    }
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (cause: Exception) {
                if (owner != epoch || !isActive || route != target) return@launch
                if (privateScreen && cause is RepositoryFailure.Unauthorized) {
                    expire()
                } else {
                    val offlineError = cause is TransportFailure || cause is OfflineWriteUnsupportedException
                    update {
                        it.copy(
                            loading = false,
                            data = null,
                            dataSource = null,
                            cachedAtEpochMs = null,
                            isOffline = if (offlineError) true else it.isOffline,
                            error = cause.message ?: "Read unavailable.",
                        )
                    }
                }
            }
        }
    }

    fun search(value: String, color: String = state.value.color, offset: Int = 0) {
        update { it.copy(search = value.take(200), color = color, offset = offset) }; refresh()
    }

    fun inventory(value: String = state.value.inventoryQuery, offset: Int = 0, group: String = state.value.inventoryGroup) {
        update { it.copy(browsing = it.browsing.copy(inventoryQuery = value.take(200), inventoryOffset = offset, inventoryGroup = group)) }; refresh()
    }

    fun decks(value: String = state.value.deckQuery, offset: Int = 0) {
        update { it.copy(browsing = it.browsing.copy(deckQuery = value.take(200), deckOffset = offset)) }; refresh()
    }

    fun prepareAdd(printing: Printing) {
        if (state.value.draft.attempt != null) { update { it.copy(writeError = "Resolve the previous save before starting another one.") }; return }
        val finish = if (printing.is_nonfoil_available) "nonfoil" else "foil"
        setDraft(DraftState(add = AddDraft(printing, finish = finish)))
    }

    fun editAdd(draft: AddDraft) {
        if (state.value.draft.attempt != null) return
        setDraft(state.value.draft.copy(add = draft.copy(notes = draft.notes.take(4000), quantity = draft.quantity.take(10))))
    }

    private fun setDraft(draft: DraftState): Boolean {
        return try {
            store.saveDraft(state.value.session?.user?.accountId, draft)
            update { it.copy(draft = draft) }
            true
        } catch (_: Exception) {
            update { it.copy(writeError = "Local draft storage is unavailable. No new save was sent.") }
            false
        }
    }

    fun authenticate(register: Boolean, username: String, password: String, carryGuestDraft: Boolean, onSuccess: () -> Unit) {
        if (state.value.authenticating) return
        if (state.value.isOffline || !repos.connectivity.isOnline.value) {
            update { it.copy(isOffline = true, authError = "Sign in requires an internet connection.") }
            return
        }
        val previousAccount = state.value.session?.user?.accountId
        val previousScope = previousAccount?.let { AccountScope(backend, it) }
        val guest = if (previousAccount == null && carryGuestDraft) state.value.draft.add else null
        update { it.copy(authenticating = true, authError = null) }
        sessionRequests.launch(scope(), request = {
            repos.auth.authenticate(register, username, password)
        }, onSuccess = { result ->
            val session = Session(backend, result.user, result.token, result.expiresAt)
            check(session.isLive(now()))
            val nextScope = AccountScope(backend, session.user.accountId)
            var draft = store.draft(session.user.accountId)
            val adoptGuest = guest != null && draft.attempt == null
            if (adoptGuest) {
                draft = DraftState(add = guest)
                store.saveDraft(session.user.accountId, draft)
            }
            // All fallible preparation precedes switching the accepted session context.
            store.saveSession(session)
            if (adoptGuest) store.clearDraft(null)
            cancelPrivateWork()
            update {
                it.copy(
                    session = session, verified = true, sessionRevoked = false, isOffline = false, checkingSession = false,
                    authenticating = false, authError = null, error = null, data = null,
                    dataSource = null, cachedAtEpochMs = null, loading = false,
                    saving = false, draft = draft, writeError = null, notice = null, live = "",
                    browsing = it.browsing.forAccount(previousScope, nextScope), identityReady = true,
                )
            }
            startEvents(); startExpiry(); onSuccess()
        }, onFailure = { cause ->
            update { it.copy(authenticating = false, isOffline = if (cause is TransportFailure) true else it.isOffline, authError = cause.message ?: "Sign in unavailable.") }
        })
    }

    fun saveAdd() {
        if (!state.value.canWriteOnline) {
            update { it.copy(writeError = OFFLINE_WRITE_MESSAGE) }
            return
        }
        val draft = state.value.draft.add ?: return
        try {
            mutate(InventoryMutation.Add(draft))
        } catch (cause: IllegalArgumentException) { update { it.copy(writeError = cause.message) } }
    }

    fun patchEntry(entry: InventoryEntry, quantity: String, notes: String) {
        if (!state.value.canWriteOnline) {
            update { it.copy(writeError = OFFLINE_WRITE_MESSAGE) }
            return
        }
        val count = quantity.toLongOrNull()
        if (count == null || count !in 1..2_147_483_647) { update { it.copy(writeError = "Enter a positive Quantity.") }; return }
        mutate(InventoryMutation.PatchEntry(entry, count, notes))
    }

    fun prepareRemoval(entry: InventoryEntry): ReviewedRemoval? {
        val account = state.value.session?.user?.accountId ?: return null
        return repos.inventory.prepareRemoval(AccountScope(backend, account), entry)
    }

    fun removeEntry(review: ReviewedRemoval) = submitMutation(review.attempt)

    fun saveGroups(entryId: String, groups: Set<String>) = mutate(InventoryMutation.SaveGroups(entryId, groups))

    fun createGroup(name: String) = mutate(InventoryMutation.CreateGroup(name))

    private fun mutate(intent: InventoryMutation) {
        if (!state.value.canWriteOnline) {
            update { it.copy(writeError = OFFLINE_WRITE_MESSAGE) }
            return
        }
        if (state.value.draft.attempt != null || state.value.saving) return
        val account = state.value.session?.user?.accountId ?: return
        val attempt = repos.inventory.prepareMutation(AccountScope(backend, account), intent)
        submitMutation(attempt)
    }

    private fun submitMutation(attempt: MutationAttempt) {
        if (!state.value.canWriteOnline) {
            update { it.copy(writeError = OFFLINE_WRITE_MESSAGE) }
            return
        }
        if (state.value.draft.attempt != null || state.value.saving) return
        val account = state.value.session?.user?.accountId ?: return
        if (runCatching { attempt.retryFor(backend, account) }.isFailure) {
            update { it.copy(writeError = "This review belongs to another account. Review the entry again.") }
            return
        }
        if (setDraft(state.value.draft.copy(attempt = attempt))) retryMutation()
    }

    fun retryMutation() {
        val pending = state.value.draft.attempt ?: return
        val account = state.value.session?.user?.accountId ?: ""
        val attempt = runCatching { pending.retryFor(backend, account) }.getOrNull() ?: return
        if (!state.value.canWriteOnline) {
            update { it.copy(writeError = OFFLINE_WRITE_MESSAGE) }
            return
        }
        if (state.value.saving) return
        val owner = epoch
        val accountScope = AccountScope(backend, account)
        update { it.copy(saving = true, writeError = null) }
        mutation = scope().launch {
            try {
                val submitted = repos.inventory.submitMutation(accountScope, privateToken(), attempt)
                val receipt = submitted.receipt
                check(receipt.requestId == attempt.requestId)
                if (owner != epoch || !isActive) return@launch
                val confirmed = state.value.draft.copy(attempt = submitted.confirmedAttempt)
                val persisted = setDraft(confirmed)
                if (!persisted) update { it.copy(draft = confirmed, writeError = "Saved on the server. Local receipt storage is unavailable; keep the original request ID if you restart.") }
                update { it.copy(saving = false, notice = "Saved. Receipt ${receipt.requestId.take(8)} · revision ${receipt.revision}.") }
                refresh() // This is a read. Its failure never replays the successful write.
            } catch (cancelled: CancellationException) { if (owner == epoch) update { it.copy(saving = false) }; throw cancelled }
            catch (cause: Exception) {
                if (owner != epoch || !isActive) return@launch
                if (cause is RepositoryFailure.Unauthorized) { expire(); return@launch }
                // Definitive validation/conflict failures allow correction with a new request ID.
                val rejected = cause as? RepositoryFailure.MutationRejected
                if (rejected?.definitive == true) setDraft(state.value.draft.copy(attempt = null))
                val latest = when (val conflict = rejected?.conflict) {
                    is MutationConflict.NotesConflict -> "\nCurrent saved Notes: ${conflict.savedNotes}. Review current saved values before trying again."
                    MutationConflict.QuantityChanged -> "\nThe saved quantity changed. Refresh and review it before removing copies."
                    MutationConflict.Other -> "\nReview the current saved state before trying again."
                    null -> ""
                }
                val wentOffline = cause is OfflineWriteUnsupportedException || cause is TransportFailure
                update {
                    it.copy(
                        saving = false,
                        isOffline = if (wentOffline) true else it.isOffline,
                        writeError = (cause.message ?: "Save not confirmed.") + latest,
                    )
                }
                if (rejected?.conflict != null) refresh()
            }
        }
    }

    fun finishReceipt() {
        if (state.value.draft.attempt?.confirmedReceipt == null) return
        val attempt = state.value.draft.attempt ?: return
        val wasAdd = repos.inventory.isAddAttempt(attempt)
        if (setDraft(if (wasAdd) DraftState() else state.value.draft.copy(attempt = null))) {
            update { it.copy(notice = null, writeError = null, formGeneration = it.formGeneration + 1) }
        }
    }

    fun appearance(value: String) { store.appearance = value; update { it.copy(appearance = value) } }

    fun logout(forgetOnly: Boolean = false, onSuccess: () -> Unit) {
        if (state.value.saving) return
        if (!forgetOnly && (state.value.isOffline || !repos.connectivity.isOnline.value)) {
            update { it.copy(isOffline = true, error = "Offline mode is read-only. Reconnect to revoke the server session, or remove local sign-in only.") }
            return
        }
        val session = state.value.session
        val wasVerified = state.value.verified
        sessionRequests.cancel()
        cancelPrivateWork()
        update { it.copy(authenticating = false, verified = false, checkingSession = false, data = null, dataSource = null, cachedAtEpochMs = null, loading = false, live = "") }
        sessionRequests.launch(scope(), request = {
            if (!forgetOnly && session != null) repos.auth.logout(session.token)
            session?.let {
                val accountScope = AccountScope(backend, it.user.accountId)
                runCatching { repos.inventory.clearCache(accountScope) }
                runCatching { repos.decks.clearCache(accountScope) }
            }
            Unit
        }, onSuccess = {
            store.saveSession(null); store.clearDraft(session?.user?.accountId); store.clearDraft(null)
            cancelPrivateWork()
            update {
                AppState(
                    identityReady = true,
                    appearance = it.appearance,
                    isOffline = !repos.connectivity.isOnline.value,
                    scanCaptureStatus = repos.scan.captureStatus(),
                    notice = if (forgetOnly) "Local sign-in removed. The server session was not revoked." else "Signed out.",
                )
            }
            onSuccess()
        }, onFailure = { cause ->
            if (cause is RepositoryFailure.Unauthorized) {
                expire()
            } else {
                val restore = wasVerified && session?.isLive(now()) == true
                update { it.copy(verified = restore, error = "Logout not confirmed. Retry, or remove local sign-in explicitly.") }
                if (restore) { startEvents(); startExpiry() }
            }
        })
    }

    fun decideQr(code: String, decision: String, confirmed: Boolean = false) {
        if (!state.value.canWriteOnline) {
            update { it.copy(error = OFFLINE_WRITE_MESSAGE) }
            return
        }
        qr?.cancel()
        val owner = epoch
        val target = route
        qr = scope().launch {
            try {
                repos.scan.decideQrRequest(privateToken(), code, decision, confirmed)
                if (owner != epoch || !isActive || route != target) return@launch
                update { it.copy(notice = if (decision == "approve") "Anmeldung freigegeben." else "Request denied.") }; refresh()
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (cause: Exception) {
                if (owner != epoch || !isActive || route != target) return@launch
                if (cause is RepositoryFailure.Unauthorized) expire()
                else update {
                    it.copy(
                        isOffline = if (cause is OfflineWriteUnsupportedException || cause is TransportFailure) true else it.isOffline,
                        error = cause.message,
                    )
                }
            }
        }
    }

    private fun startExpiry() {
        expiry?.cancel()
        val session = state.value.session ?: return
        val owner = epoch
        expiry = scope().launch {
            delay(maxOf(0, Duration.between(now(), Instant.parse(session.expiresAt)).toMillis()))
            if (owner == epoch) expire()
        }
    }

    private fun startEvents() {
        stream?.cancel()
        if (!active || !state.value.verified || state.value.isOffline) return
        val owner = epoch
        val token = state.value.session?.token ?: return
        stream = scope().launch {
            var failures = 0
            while (isActive && owner == epoch) {
                try {
                    update { it.copy(live = "Connecting to saved changes…") }
                    val connectedAt = System.nanoTime()
                    repos.auth.observeEvents(token) { event, _ ->
                        if (owner != epoch || !isActive) return@observeEvents
                        when (event) {
                            "auth-expired" -> { expire(); return@observeEvents }
                            "reset", "invalidate" -> { update { it.copy(live = "Live updates connected") }; refresh() }
                            "recovering" -> update { it.copy(live = "Saved changes recovering. Refresh remains available.") }
                        }
                    }
                    if (System.nanoTime() - connectedAt >= 30_000_000_000L) failures = 0
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (cause: Exception) {
                    if (owner != epoch || !isActive) return@launch
                    if (cause is RepositoryFailure.Unauthorized) { expire(); break }
                    update { it.copy(live = "Live updates unavailable. Pull current data with Refresh.") }
                }
                failures++
                if (failures >= 5) break
                delay(minOf(30_000L, 1_000L shl failures))
            }
        }
    }

    override fun onCleared() { repos.onClose() }

    companion object {
        private const val OFFLINE_WRITE_MESSAGE = "Offline mode is read-only. Reconnect to save changes."
        private val CACHEABLE_PRIVATE_SCREENS = setOf("home", "inventory", "groups", "entry", "decks", "deck", "availability")
        private val ONLINE_ONLY_PRIVATE_SCREENS = setOf("profile", "qr")
        private val READABLE_SCREENS = CACHEABLE_PRIVATE_SCREENS + ONLINE_ONLY_PRIVATE_SCREENS + setOf("search", "printing")

        fun factory(context: Context): ViewModelProvider.Factory = object : ViewModelProvider.Factory {
            @Suppress("UNCHECKED_CAST")
            override fun <T : ViewModel> create(modelClass: Class<T>): T =
                AppModel(createAndroidRepositories(context)) as T
        }
    }
}

private inline fun <T, R> ReadResult<T>.map(transform: (T) -> R): ReadResult<R> =
    ReadResult(transform(value), source, cachedAtEpochMs)
