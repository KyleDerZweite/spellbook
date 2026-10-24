package dev.spellbook.data

import java.util.UUID
import kotlinx.serialization.json.put

/** Client state ownership only. The API derives write authority from the bearer credential. */
data class AccountScope(val backend: String, val accountId: String)

data class PrivateBrowsingContext(
    val inventoryQuery: String = "", val inventoryGroup: String = "", val inventoryOffset: Int = 0,
    val deckQuery: String = "", val deckOffset: Int = 0,
) {
    fun forAccount(previous: AccountScope?, next: AccountScope): PrivateBrowsingContext =
        if (previous == next) this else PrivateBrowsingContext()
}

/** Guest authentication keeps its contextual return. Leaving a previous account drops its private routes. */
fun resetPrivateNavigation(previous: AccountScope?, next: AccountScope?): Boolean =
    previous != null && previous != next

data class ReviewedRemoval(
    val entryId: String, val name: String, val quantity: Long, val scope: AccountScope,
    val attempt: MutationAttempt,
)

/** Freeze all reviewed identity, quantity and retry data when the confirmation opens. */
fun reviewRemoval(entry: InventoryEntry, scope: AccountScope, requestId: String = UUID.randomUUID().toString()): ReviewedRemoval {
    val body = jsonBody {
        put("requestId", requestId)
        put("expectedQuantity", entry.quantity)
    }
    return ReviewedRemoval(entry.id, entry.name, entry.quantity, scope,
        MutationAttempt(scope.backend, scope.accountId, "DELETE", "/api/v1/mtg/inventory/${entry.id}", body, requestId))
}
