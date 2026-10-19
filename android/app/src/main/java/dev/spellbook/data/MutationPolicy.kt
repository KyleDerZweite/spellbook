package dev.spellbook.data

import kotlinx.serialization.json.*

fun inventoryAddBody(draft: AddDraft, requestId: String): String {
    val quantity = draft.quantity.toLongOrNull()
    require(quantity != null && quantity in 1..2_147_483_647) { "Quantity must be between 1 and 2,147,483,647." }
    require(draft.condition in setOf("NM", "LP", "MP", "HP", "DMG")) { "Select a supported Condition." }
    require((draft.finish == "nonfoil" && draft.printing.is_nonfoil_available) || (draft.finish == "foil" && draft.printing.is_foil_available)) { "Select a supported Finish." }
    return jsonBody {
        put("requestId", requestId); put("source", "mobile")
        putJsonArray("items") { addJsonObject {
            put("catalogCardId", draft.printing.id); put("finish", draft.finish); put("condition", draft.condition); put("quantity", quantity)
        } }
    }
}
fun MutationAttempt.retryFor(backend: String, accountId: String): MutationAttempt {
    check(this.backend == backend && this.accountId == accountId) { "This save belongs to a different backend or account." }
    check(confirmedReceipt == null) { "The save is already confirmed. Retry only its read." }
    return this
}
fun MutationAttempt.confirm(raw: String): MutationAttempt {
    val receipt = WireJson.decodeFromString<InventoryReceipt>(raw)
    check(receipt.requestId == requestId) { "The server receipt does not match this request." }
    return copy(confirmedReceipt = raw)
}
fun ApiFailure.isDefinitiveMutationFailure(): Boolean = status in setOf(400, 403, 404, 409, 413, 415, 422)
