package dev.spellbook.data

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject

val WireJson = Json { ignoreUnknownKeys = true; encodeDefaults = true; explicitNulls = false }

@Serializable data class User(val accountId: String, val username: String, val email: String = "")
@Serializable data class LoginResult(val user: User, val token: String, val expiresAt: String)
@Serializable data class Session(val backend: String, val user: User, val token: String, val expiresAt: String)
@Serializable data class SessionInfo(val user: User, val expiresAt: String)
@Serializable data class Printing(
    val id: String, val oracle_id: String, val name: String,
    val lang: String = "", val set_code: String = "", val set_name: String = "",
    val collector_number: String = "", val image_uri: String = "", val image_uri_small: String = "",
    val mana_cost: String = "", val type_line: String = "", val oracle_text: String = "",
    val is_foil_available: Boolean = false, val is_nonfoil_available: Boolean = false,
    val legalities: Map<String, String> = emptyMap(),
)
@Serializable data class SearchResult(
    val hits: List<Printing>, val query: String, val estimatedTotalHits: Long,
    val generationId: String? = null,
)
@Serializable data class Totals(
    val total: Long, val names: Long, val printings: Long, val sets: Long, val foils: Long, val decks: Long,
)
@Serializable data class RecentEntry(
    val id: String, val catalogCardId: String, val name: String, val setCode: String,
    val imageUri: String, val quantity: Long, val finish: String, val condition: String,
)
@Serializable data class RecentDeck(val id: String, val name: String, val format: String, val required: Long, val missing: Long)
@Serializable data class Dashboard(
    val totals: Totals, val recentEntries: List<RecentEntry>, val decks: List<RecentDeck>,
    val pendingScanReviews: Long? = null, val valuationError: JsonObject? = null,
)
@Serializable data class InventoryEntry(
    val id: String, val catalogCardId: String, val canonicalCardId: String,
    val name: String, val setCode: String, val imageUri: String,
    val quantity: Long, val finish: String, val condition: String,
    val notes: String, val notesRevision: String,
)
@Serializable data class InventoryTotals(val entryCount: Long, val copyCount: Long, val canonicalCardCount: Long)
@Serializable data class Matching(val entryCount: Long, val copyCount: Long)
@Serializable data class Group(val id: String, val name: String, val entryCount: Long, val quantity: Long)
@Serializable data class InventoryPage(
    val revision: String, val queryKey: String, val entries: List<InventoryEntry>,
    val groups: List<Group>, val groupPage: List<Group>, val groupCount: Long,
    val matching: Matching, val totals: InventoryTotals,
)
@Serializable data class GroupPage(val revision: String, val groups: List<Group>, val count: Long)
@Serializable data class EntryDetail(val entry: InventoryEntry, val memberships: List<String>, val revision: String)
@Serializable data class InventoryChange(val entryId: String, val catalogCardId: String, val quantity: Long, val delta: Long)
@Serializable data class InventoryReceipt(
    val requestId: String, val revision: String, val changes: List<InventoryChange>,
    val removedEntryIds: List<String>,
)
@Serializable data class DeckSummary(val id: String, val name: String, val format: String, val quantity: Long, val imageUri: String)
@Serializable data class DeckLibrary(
    val revision: String, val offset: Int, val limit: Int,
    val matchingTotal: Long, val globalTotal: Long, val items: List<DeckSummary>,
)
@Serializable data class Deck(val id: String, val name: String, val format: String, val description: String, val descriptionRevision: String)
@Serializable data class DeckCard(
    val id: String, val catalogCardId: String, val name: String, val setCode: String,
    val imageUri: String, val quantity: Long, val role: String,
)
@Serializable data class Availability(val exact: Long, val alternate: Long, val missing: Long)
@Serializable data class SelectedDeck(
    val decks: List<Deck>, val deckCards: List<DeckCard>,
    val availability: Map<String, Availability>,
)
@Serializable data class AvailabilityTotals(val required: Long, val exact: Long, val alternate: Long, val missing: Long)
@Serializable data class AvailabilityEntry(val entryId: String, val required: Long, val exact: Long, val alternate: Long, val missing: Long)
@Serializable data class DeckAvailability(val deckId: String, val entries: List<AvailabilityEntry>, val totals: AvailabilityTotals)
@Serializable data class Profile(val user: User, val card: JsonObject, val totals: Totals?, val statsError: String?)
@Serializable data class QrRequest(val code: String, val kind: String, val status: String, val expiresAt: String)

@Serializable data class AddDraft(
    val printing: Printing, val quantity: String = "1", val finish: String = "nonfoil",
    val condition: String = "NM", val notes: String = "",
)
/** A frozen attempt is bound to one backend and account. No automatic replay. */
@Serializable data class MutationAttempt(
    val backend: String, val accountId: String, val method: String, val path: String,
    val body: String, val requestId: String, val confirmedReceipt: String? = null,
)
@Serializable data class DraftState(val add: AddDraft? = null, val attempt: MutationAttempt? = null)

fun resolveProfileText(text: String, totals: Totals?): String {
    val values = mapOf("total_owned_cards" to totals?.total, "unique_card_names" to totals?.names,
        "owned_printings" to totals?.printings, "owned_sets" to totals?.sets,
        "foil_copies" to totals?.foils, "total_decks" to totals?.decks)
    return Regex("\\{([^{}]+)\\}").replace(text) { match ->
        if (values.containsKey(match.groupValues[1])) values[match.groupValues[1]]?.let { java.text.NumberFormat.getIntegerInstance(java.util.Locale.ENGLISH).format(it) } ?: "unavailable"
        else match.value
    }
}
