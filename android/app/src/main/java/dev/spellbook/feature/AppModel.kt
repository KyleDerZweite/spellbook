package dev.spellbook.feature

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import dev.spellbook.BuildConfig
import dev.spellbook.data.*
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.*
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import androidx.navigation3.runtime.NavKey
import java.util.UUID
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
    val data: ScreenData? = null, val loading: Boolean = false, val error: String? = null,
    val authError: String? = null, val authenticating: Boolean = false,
    val draft: DraftState = DraftState(), val saving: Boolean = false, val writeError: String? = null,
    val notice: String? = null, val live: String = "", val appearance: String = "system",
    val search: String = "", val color: String = "", val offset: Int = 0,
    val browsing: PrivateBrowsingContext = PrivateBrowsingContext(), val formGeneration: Int = 0,
    val identityReady: Boolean = false,
) {
    val inventoryQuery get() = browsing.inventoryQuery
    val inventoryGroup get() = browsing.inventoryGroup
    val inventoryOffset get() = browsing.inventoryOffset
    val deckQuery get() = browsing.deckQuery
    val deckOffset get() = browsing.deckOffset

    fun authExpired(credentialCleared: Boolean = true): AppState = copy(
        verified = false, checkingSession = false, data = null, loading = false,
        saving = false, authenticating = false, live = "",
        notice = "Session expired. Sign in again to resume your account's draft.",
        error = if (credentialCleared) null else "Local credential removal failed. Private access is disabled; retry removing local sign-in.",
    )
}

class AppModel(application: Application) : AndroidViewModel(application) {
    private val configured = runCatching { normalizeBackend(BuildConfig.API_BASE_URL, BuildConfig.DEBUG) }
    val backend: String = configured.getOrDefault("")
    private val store = PrivateStore(application, backend)
    private val api = if (backend.isNotEmpty()) Api(backend) else null
    private val _state = MutableStateFlow(AppState(appearance = store.appearance, error = configured.exceptionOrNull()?.message))
    val state: StateFlow<AppState> = _state.asStateFlow()
    private var route = Route("home")
    private var foreground: Job? = null
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
    private fun scope(): CoroutineScope = CoroutineScope(viewModelScope.coroutineContext + (foreground ?: Job().also { it.cancel() }))

    fun foreground(value: Boolean) {
        if (active == value) return
        active = value
        if (!value) {
            sessionRequests.cancel()
            cancelPrivateWork()
            foreground?.cancel(); foreground = null; read = null; validation = null; stream = null
            update { it.copy(data = null, loading = false, saving = false, authenticating = false, checkingSession = false, live = "") }
            return
        }
        foreground = SupervisorJob(viewModelScope.coroutineContext[Job])
        if (!sessionLoaded) {
            sessionLoaded = true
            val session = store.session()
            update { it.copy(session = session, draft = store.draft(session?.user?.accountId), identityReady = true) }
        }
        validateSession()
    }
    fun cancelAuthentication() {
        sessionRequests.cancel()
        update { it.copy(authenticating = false) }
    }
    fun navigate(next: Route) {
        if (route.screen == "auth" && next != route) {
            sessionRequests.cancel()
            update { it.copy(authenticating = false) }
        }
        if (route.screen == "qr" && next != route) qr?.cancel()
        route = next
        update { it.copy(data = null, loading = false, error = null, authError = null) }
        refresh()
    }
    fun validateSession() {
        sessionRequests.cancel()
        val session = state.value.session
        if (session == null) { update { it.copy(verified = false) }; refresh(); return }
        if (!session.isLive()) { expire(); return }
        mutation?.cancel(); stream?.cancel()
        update { it.copy(checkingSession = true, verified = false, data = null, saving = false) }
        val owner = ++epoch
        read?.cancel()
        validation?.cancel()
        validation = scope().launch {
            try {
                val info = apiOrFail().get<SessionInfo>("/api/v1/auth/session", session.token)
                if (owner != epoch || !isActive) return@launch
                val validated = session.copy(user = info.user, expiresAt = info.expiresAt)
                check(validated.user.accountId == session.user.accountId && validated.isLive())
                store.saveSession(validated)
                update { it.copy(session = validated, verified = true, checkingSession = false, error = null) }
                refresh(); startEvents(); startExpiry()
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (cause: Exception) {
                if (owner != epoch || !isActive) return@launch
                if (cause is ApiFailure && cause.status == 401) expire()
                else update { it.copy(checkingSession = false, error = cause.message ?: "Session check unavailable.") }
            }
        }
    }
    private fun apiOrFail(): Api = api ?: error("API address is not configured. Set the HTTPS API origin at build time.")
    private fun privateToken(): String {
        val session = state.value.session ?: error("Sign in to continue.")
        if (!session.isLive()) { expire(); error("Sign in again to continue.") }
        check(state.value.verified) { "Sign in again to continue." }
        return session.token
    }
    private fun cancelPrivateWork() {
        ++epoch
        read?.cancel(); validation?.cancel(); stream?.cancel(); mutation?.cancel(); expiry?.cancel(); qr?.cancel()
    }
    private fun expire() {
        sessionRequests.cancel()
        cancelPrivateWork()
        // Keep this account's unsaved draft under its account key, never under guest.
        val cleared = runCatching { store.saveSession(null) }.isSuccess
        update { it.authExpired(cleared) }
    }
    fun refresh() {
        if (!active) return
        read?.cancel()
        val target = route
        val privateScreen = target.screen in setOf("home", "inventory", "groups", "entry", "decks", "deck", "availability", "profile", "qr")
        if (privateScreen && !state.value.verified) { update { it.copy(data = null, loading = false) }; return }
        if (target.screen !in setOf("home", "search", "printing", "inventory", "groups", "entry", "decks", "deck", "availability", "profile", "qr")) return
        val owner = epoch
        val snapshot = state.value
        update { it.copy(loading = true, error = null) }
        read = scope().launch {
            try {
                val api = apiOrFail()
                val token = if (privateScreen) privateToken() else null
                val result: ScreenData = when (target.screen) {
                    "home" -> ScreenData.Home(api.get("/api/v1/mtg/dashboard", token))
                    "search" -> {
                        val body = jsonBody {
                            put("query", snapshot.search); put("limit", 30); put("offset", snapshot.offset)
                            if (snapshot.color.isNotEmpty()) putJsonObject("filters") { putJsonArray("colors") { add(snapshot.color) } }
                        }
                        ScreenData.Search(WireJson.decodeFromString(api.request("/api/v1/mtg/catalog/search", method = "POST", body = body)))
                    }
                    "printing" -> {
                        val printing = api.get<Printing>("/api/v1/mtg/catalog/printings/${target.id}")
                        val printings = api.get<SearchResult>("/api/v1/mtg/catalog/cards/${printing.oracle_id}/printings?limit=30&offset=0")
                        ScreenData.PrintingDetail(printing, printings)
                    }
                    "inventory" -> ScreenData.Inventory(api.get("/api/v1/mtg/inventory?limit=40&offset=${snapshot.inventoryOffset}&q=${query(snapshot.inventoryQuery)}${if (snapshot.inventoryGroup.isNotEmpty()) "&group=${query(snapshot.inventoryGroup)}" else ""}", token))
                    "groups" -> ScreenData.Groups(api.get("/api/v1/mtg/inventory/groups?limit=40&offset=${snapshot.inventoryOffset}", token))
                    "entry" -> ScreenData.Entry(api.get("/api/v1/mtg/inventory/${target.id}", token), api.get("/api/v1/mtg/inventory/groups?limit=500", token))
                    "decks" -> ScreenData.Decks(api.get("/api/v1/mtg/deck-library?limit=30&offset=${snapshot.deckOffset}&dirQ=${query(snapshot.deckQuery)}", token))
                    "deck" -> ScreenData.Selected(api.get("/api/v1/mtg/decks/${target.id}?selectedOnly=true", token))
                    "availability" -> ScreenData.Available(api.get("/api/v1/mtg/decks/${target.id}/availability", token))
                    "profile" -> ScreenData.Account(api.get("/api/v1/account/profile", token))
                    "qr" -> ScreenData.Qr(api.get("/api/v1/auth/qr/requests/${query(target.id)}", token))
                    else -> error("Unknown screen")
                }
                if (owner == epoch && isActive && route == target) update { it.copy(data = result, loading = false, error = null) }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (cause: Exception) {
                if (owner != epoch || !isActive || route != target) return@launch
                if (privateScreen && cause is ApiFailure && cause.status == 401) expire()
                else update { it.copy(loading = false, data = null, error = cause.message ?: "Read unavailable.") }
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
        val previousAccount = state.value.session?.user?.accountId
        val previousScope = previousAccount?.let { AccountScope(backend, it) }
        val guest = if (previousAccount == null && carryGuestDraft) state.value.draft.add else null
        update { it.copy(authenticating = true, authError = null) }
        sessionRequests.launch(scope(), request = {
            WireJson.decodeFromString<LoginResult>(apiOrFail().request("/api/v1/auth/${if (register) "register" else "login"}", method = "POST", body = jsonBody { put("username", username); put("password", password) }))
        }, onSuccess = { result ->
            val session = Session(backend, result.user, result.token, result.expiresAt)
            check(session.isLive())
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
            update { it.copy(session = session, verified = true, checkingSession = false,
                authenticating = false, authError = null, error = null, data = null, loading = false,
                saving = false, draft = draft, writeError = null, notice = null, live = "",
                browsing = it.browsing.forAccount(previousScope, nextScope), identityReady = true) }
            startEvents(); startExpiry(); onSuccess()
        }, onFailure = { cause ->
            update { it.copy(authenticating = false, authError = cause.message ?: "Sign in unavailable.") }
        })
    }
    fun saveAdd() {
        val draft = state.value.draft.add ?: return
        try {
            inventoryAddBody(draft, "validate")
            mutate("POST", "/api/v1/mtg/inventory") { id -> inventoryAddBody(draft, id) }
        } catch (cause: IllegalArgumentException) { update { it.copy(writeError = cause.message) } }
    }

    fun patchEntry(entry: InventoryEntry, quantity: String, notes: String) {
        val count = quantity.toLongOrNull()
        if (count == null || count !in 1..2_147_483_647) { update { it.copy(writeError = "Enter a positive Quantity.") }; return }
        mutate("PATCH", "/api/v1/mtg/inventory/${entry.id}") { id -> jsonBody {
            put("requestId", id); put("quantity", count)
            if (notes != entry.notes) { put("notes", notes); put("notesRevision", entry.notesRevision) }
        } }
    }
    fun removeEntry(review: ReviewedRemoval) = submitMutation(review.attempt)
    fun saveGroups(entryId: String, groups: Set<String>) = mutate("PUT", "/api/v1/mtg/inventory/$entryId/groups") { id -> jsonBody { put("requestId", id); putJsonArray("groupIds") { groups.sorted().forEach { add(it) } } } }
    fun createGroup(name: String) = mutate("POST", "/api/v1/mtg/inventory/groups") { id -> jsonBody { put("requestId", id); put("name", name) } }
    private fun mutate(method: String, path: String, body: (String) -> String) {
        if (state.value.draft.attempt != null || state.value.saving || !state.value.verified) return
        val account = state.value.session?.user?.accountId ?: return
        val id = UUID.randomUUID().toString()
        val attempt = MutationAttempt(backend, account, method, path, body(id), id)
        submitMutation(attempt)
    }
    private fun submitMutation(attempt: MutationAttempt) {
        if (state.value.draft.attempt != null || state.value.saving || !state.value.verified) return
        val account = state.value.session?.user?.accountId ?: return
        if (runCatching { attempt.retryFor(backend, account) }.isFailure) {
            update { it.copy(writeError = "This review belongs to another account. Review the entry again.") }
            return
        }
        if (setDraft(state.value.draft.copy(attempt = attempt))) retryMutation()
    }
    fun retryMutation() {
        val pending = state.value.draft.attempt ?: return
        val attempt = runCatching { pending.retryFor(backend, state.value.session?.user?.accountId ?: "") }.getOrNull() ?: return
        if (attempt.confirmedReceipt != null || state.value.saving || !state.value.verified) return
        if (attempt.backend != backend || attempt.accountId != state.value.session?.user?.accountId) return
        val owner = epoch
        update { it.copy(saving = true, writeError = null) }
        mutation = scope().launch {
            try {
                val raw = apiOrFail().request(attempt.path, privateToken(), attempt.method, attempt.body)
                val receipt = WireJson.decodeFromString<InventoryReceipt>(raw)
                check(receipt.requestId == attempt.requestId)
                if (owner != epoch || !isActive) return@launch
                val confirmed = state.value.draft.copy(attempt = attempt.confirm(raw))
                val persisted = setDraft(confirmed)
                if (!persisted) update { it.copy(draft = confirmed, writeError = "Saved on the server. Local receipt storage is unavailable; keep the original request ID if you restart.") }
                update { it.copy(saving = false, notice = "Saved. Receipt ${receipt.requestId.take(8)} · revision ${receipt.revision}.") }
                refresh() // This is a read. Its failure never replays the successful write.
            } catch (cancelled: CancellationException) { if (owner == epoch) update { it.copy(saving = false) }; throw cancelled }
            catch (cause: Exception) {
                if (owner != epoch || !isActive) return@launch
                if (cause is ApiFailure && cause.status == 401) { expire(); return@launch }
                // Definitive validation/conflict failures allow correction with a new request ID.
                val definitive = cause is ApiFailure && cause.isDefinitiveMutationFailure()
                if (definitive) setDraft(state.value.draft.copy(attempt = null))
                val latest = if (cause is ApiFailure && cause.status == 409) when (cause.kind) { "NotesConflict" -> "\nCurrent saved Notes: ${cause.detail["notes"]?.jsonPrimitive?.contentOrNull.orEmpty()}. Review current saved values before trying again."; "QuantityChanged" -> "\nThe saved quantity changed. Refresh and review it before removing copies."; else -> "\nReview the current saved state before trying again." } else ""
                update { it.copy(saving = false, writeError = (cause.message ?: "Save not confirmed.") + latest) }
                if (cause is ApiFailure && cause.status == 409) refresh()
            }
        }
    }
    fun finishReceipt() {
        if (state.value.draft.attempt?.confirmedReceipt == null) return
        val attempt = state.value.draft.attempt ?: return
        // Retained attempts keep their original path through retry and receipt acknowledgement.
        val wasAdd = attempt.method == "POST" && attempt.path in setOf("/api/v1/mtg/inventory", "/api/mobile/v1/mtg/inventory")
        if (setDraft(if (wasAdd) DraftState() else state.value.draft.copy(attempt = null))) {
            update { it.copy(notice = null, writeError = null, formGeneration = it.formGeneration + 1) }
        }
    }
    fun appearance(value: String) { store.appearance = value; update { it.copy(appearance = value) } }
    fun logout(forgetOnly: Boolean = false, onSuccess: () -> Unit) {
        if (state.value.saving) return
        val session = state.value.session
        val wasVerified = state.value.verified
        sessionRequests.cancel()
        cancelPrivateWork()
        update { it.copy(authenticating = false, verified = false, checkingSession = false, data = null, loading = false, live = "") }
        sessionRequests.launch(scope(), request = {
            if (!forgetOnly && session != null) apiOrFail().request("/api/v1/auth/logout", session.token, "POST")
            Unit
        }, onSuccess = {
            store.saveSession(null); store.clearDraft(session?.user?.accountId); store.clearDraft(null)
            cancelPrivateWork()
            update { AppState(identityReady = true, appearance = it.appearance, notice = if (forgetOnly) "Local sign-in removed. The server session was not revoked." else "Signed out.") }
            onSuccess()
        }, onFailure = {
            val restore = wasVerified && session?.isLive() == true
            update { it.copy(verified = restore, error = "Logout not confirmed. Retry, or remove local sign-in explicitly.") }
            if (restore) { startEvents(); startExpiry() }
        })
    }
    fun decideQr(code: String, decision: String) {
        qr?.cancel()
        val owner = epoch
        val target = route
        qr = scope().launch {
            try {
                apiOrFail().request("/api/v1/auth/qr/requests/${query(code)}/decision", privateToken(), "POST", jsonBody { put("decision", decision) })
                if (owner != epoch || !isActive || route != target) return@launch
                update { it.copy(notice = if (decision == "approve") "Anmeldung freigegeben." else "Request denied.") }; refresh()
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (cause: Exception) {
                if (owner != epoch || !isActive || route != target) return@launch
                if (cause is ApiFailure && cause.status == 401) expire()
                else update { it.copy(error = cause.message) }
            }
        }
    }
    private fun startExpiry() {
        expiry?.cancel()
        val session = state.value.session ?: return
        val owner = epoch
        expiry = scope().launch {
            delay(maxOf(0, Duration.between(Instant.now(), Instant.parse(session.expiresAt)).toMillis()))
            if (owner == epoch) expire()
        }
    }
    private fun startEvents() {
        stream?.cancel()
        if (!active || !state.value.verified) return
        val owner = epoch
        val token = state.value.session?.token ?: return
        stream = scope().launch {
            var failures = 0
            while (isActive && owner == epoch) {
                try {
                    update { it.copy(live = "Connecting to saved changes…") }
                    val connectedAt = System.nanoTime()
                    apiOrFail().events(token) { event, _ ->
                        if (owner != epoch || !isActive) return@events
                        when (event) {
                            "auth-expired" -> { expire(); return@events }
                            "reset", "invalidate" -> { update { it.copy(live = "Live updates connected") }; refresh() }
                            "recovering" -> update { it.copy(live = "Saved changes recovering. Refresh remains available.") }
                        }
                    }
                    if (System.nanoTime() - connectedAt >= 30_000_000_000L) failures = 0
                } catch (cancelled: CancellationException) { throw cancelled }
                catch (cause: Exception) {
                    if (owner != epoch || !isActive) return@launch
                    if (cause is ApiFailure && cause.status == 401) { expire(); break }
                    update { it.copy(live = "Live updates unavailable. Pull current data with Refresh.") }
                }
                failures++
                if (failures >= 5) break
                delay(minOf(30_000L, 1_000L shl failures))
            }
        }
    }
    override fun onCleared() { api?.close() }
}
