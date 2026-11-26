package dev.spellbook.data

import kotlinx.coroutines.flow.StateFlow
import java.util.UUID

enum class DataSource { REMOTE, CACHE }

data class ReadResult<T>(
    val value: T,
    val source: DataSource,
    val cachedAtEpochMs: Long? = null,
)

sealed interface InventoryMutation {
    data class Add(val draft: AddDraft) : InventoryMutation
    data class PatchEntry(val entry: InventoryEntry, val quantity: Long, val notes: String) : InventoryMutation
    data class SaveGroups(val entryId: String, val groupIds: Set<String>) : InventoryMutation
    data class CreateGroup(val name: String) : InventoryMutation
}

data class SubmittedMutation(
    val receipt: InventoryReceipt,
    val confirmedAttempt: MutationAttempt,
)

class OfflineWriteUnsupportedException(
    message: String = "Offline mode is read-only. Reconnect to save changes.",
) : Exception(message)

sealed interface MutationConflict {
    data class NotesConflict(val savedNotes: String) : MutationConflict
    data object QuantityChanged : MutationConflict
    data object Other : MutationConflict
}

sealed class RepositoryFailure(message: String) : Exception(message) {
    class Unauthorized(message: String = "Authentication required.") : RepositoryFailure(message)
    class MutationRejected(
        message: String,
        val definitive: Boolean,
        val conflict: MutationConflict? = null,
    ) : RepositoryFailure(message)
    class RequestFailed(message: String) : RepositoryFailure(message)
}

data class ScanCaptureStatus(
    val available: Boolean,
    val title: String,
    val detail: String,
)

interface ConnectivityObserver {
    val isOnline: StateFlow<Boolean>
    fun close() {}
}

/**
 * Transport-agnostic local storage boundary for encrypted credentials, drafts and preferences.
 * Implementations isolate Android Keystore/SharedPreferences from ViewModels and JVM tests.
 */
interface LocalStorageAdapter {
    fun session(): Session?
    fun saveSession(session: Session?)
    fun draft(accountId: String?): DraftState
    fun saveDraft(accountId: String?, draft: DraftState)
    fun clearDraft(accountId: String?)
    var appearance: String
}

interface AuthRepository {
    suspend fun validateSession(token: String): SessionInfo
    suspend fun authenticate(register: Boolean, username: String, password: String): LoginResult
    suspend fun logout(token: String)
    suspend fun readProfile(token: String): Profile
    suspend fun observeEvents(token: String, onEvent: suspend (String, String?) -> Unit)
}

interface CatalogRepository {
    suspend fun search(query: String, color: String, offset: Int, limit: Int = 30): SearchResult
    suspend fun readPrinting(printingId: String): Pair<Printing, SearchResult>
}

/**
 * Core Inventory flow adapter.
 *
 * v1 contract:
 * - Reads use remote-first with account-scoped local read-cache fallback when offline.
 * - Writes ([submitMutation]) are online-only and reject offline attempts with
 *   [OfflineWriteUnsupportedException].
 *
 * v2 boundary:
 * - A future offline write queue and conflict-resolution engine plugs in behind [submitMutation]
 *   using the already-frozen [MutationAttempt] (method, path, body, requestId, backend, accountId)
 *   without changing UI screens or ViewModel callers.
 */
interface InventoryRepository {
    suspend fun readDashboard(
        scope: AccountScope,
        token: String,
        cacheOnly: Boolean = false,
        allowCacheFallback: Boolean = true,
    ): ReadResult<Dashboard>

    suspend fun readInventory(
        scope: AccountScope,
        token: String,
        query: String,
        group: String,
        offset: Int,
        limit: Int = 40,
        cacheOnly: Boolean = false,
        allowCacheFallback: Boolean = true,
    ): ReadResult<InventoryPage>

    suspend fun readGroups(
        scope: AccountScope,
        token: String,
        offset: Int,
        limit: Int = 40,
        cacheOnly: Boolean = false,
        allowCacheFallback: Boolean = true,
    ): ReadResult<GroupPage>

    suspend fun readEntry(
        scope: AccountScope,
        token: String,
        entryId: String,
        cacheOnly: Boolean = false,
        allowCacheFallback: Boolean = true,
    ): ReadResult<Pair<EntryDetail, GroupPage>>

    fun prepareMutation(
        scope: AccountScope,
        intent: InventoryMutation,
        requestId: String = UUID.randomUUID().toString(),
    ): MutationAttempt

    fun prepareRemoval(
        scope: AccountScope,
        entry: InventoryEntry,
        requestId: String = UUID.randomUUID().toString(),
    ): ReviewedRemoval

    fun isAddAttempt(attempt: MutationAttempt): Boolean

    suspend fun submitMutation(scope: AccountScope, token: String, attempt: MutationAttempt): SubmittedMutation

    suspend fun clearCache(scope: AccountScope)
}

/**
 * Core Decks flow adapter.
 *
 * v1 contract: read-only Deck library, selected Deck composition and Availability with local
 * offline read-cache fallback scoped by [AccountScope].
 */
interface DeckRepository {
    suspend fun readDeckLibrary(
        scope: AccountScope,
        token: String,
        query: String,
        offset: Int,
        limit: Int = 30,
        cacheOnly: Boolean = false,
        allowCacheFallback: Boolean = true,
    ): ReadResult<DeckLibrary>

    suspend fun readSelectedDeck(
        scope: AccountScope,
        token: String,
        deckId: String,
        cacheOnly: Boolean = false,
        allowCacheFallback: Boolean = true,
    ): ReadResult<SelectedDeck>

    suspend fun readDeckAvailability(
        scope: AccountScope,
        token: String,
        deckId: String,
        cacheOnly: Boolean = false,
        allowCacheFallback: Boolean = true,
    ): ReadResult<DeckAvailability>

    suspend fun clearCache(scope: AccountScope)
}

/**
 * Core Scan and QR sign-in flow adapter.
 *
 * v1 contract: online-only QR request inspection and approval/denial plus explicit unavailable
 * capture status. Future local camera recognition or Card Station sync adapters implement this
 * interface without coupling UI screens to transport or hardware details.
 */
interface ScanRepository {
    fun captureStatus(): ScanCaptureStatus
    suspend fun readQrRequest(token: String, code: String): QrRequest
    suspend fun decideQrRequest(token: String, code: String, decision: String, confirmed: Boolean)
}

data class AppRepositories(
    val backend: String,
    val configurationError: String? = null,
    val storage: LocalStorageAdapter,
    val connectivity: ConnectivityObserver,
    val auth: AuthRepository,
    val catalog: CatalogRepository,
    val inventory: InventoryRepository,
    val decks: DeckRepository,
    val scan: ScanRepository,
    val onClose: () -> Unit = {},
)
