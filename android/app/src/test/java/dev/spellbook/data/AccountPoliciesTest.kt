package dev.spellbook.data

import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test

class AccountPoliciesTest {
    private val account = AccountScope("https://api.example.test", "account-a")
    private fun entry(quantity: Long) = InventoryEntry(
        "00000000-0000-4000-8000-000000000001", "printing-a", "canonical-a", "Reviewed card", "SET", "",
        quantity, "nonfoil", "NM", "Notes", "1",
    )

    @Test fun `remote quantity change cannot enlarge an open removal review`() {
        var saved = entry(3)
        val reviewed = reviewRemoval(saved, account, "00000000-0000-4000-8000-000000000011")
        saved = saved.copy(quantity = 10, name = "Refreshed name")
        val body = WireJson.parseToJsonElement(reviewed.attempt.body).jsonObject
        assertEquals("/api/v1/mtg/inventory/${saved.id}", reviewed.attempt.path)
        assertEquals("DELETE", reviewed.attempt.method)
        assertEquals(3L, reviewed.quantity)
        assertEquals("Reviewed card", reviewed.name)
        assertEquals(3L, body.getValue("expectedQuantity").jsonPrimitive.long)
        assertEquals(reviewed.attempt.requestId, body.getValue("requestId").jsonPrimitive.content)
        assertEquals(10L, saved.quantity)
        val retry = reviewed.attempt.retryFor(account.backend, account.accountId)
        assertEquals(reviewed.attempt.path, retry.path)
        assertEquals(reviewed.attempt.body, retry.body)
        assertThrows(IllegalStateException::class.java) { reviewed.attempt.retryFor(account.backend, "account-b") }
    }

    @Test fun `only a new explicit removal review adopts the latest quantity and request ID`() {
        val before = reviewRemoval(entry(3), account)
        val after = reviewRemoval(entry(10), account)
        assertNotEquals(before.attempt.requestId, after.attempt.requestId)
        assertEquals(3L, WireJson.parseToJsonElement(before.attempt.body).jsonObject.getValue("expectedQuantity").jsonPrimitive.long)
        assertEquals(10L, WireJson.parseToJsonElement(after.attempt.body).jsonObject.getValue("expectedQuantity").jsonPrimitive.long)
    }

    @Test fun `different account or backend drops private Box searches and page offsets`() {
        val context = PrivateBrowsingContext("Alice's cards", "alice-box-id", 80, "Alice's Deck", 60)
        assertEquals(PrivateBrowsingContext(), context.forAccount(account, account.copy(accountId = "account-b")))
        assertEquals(PrivateBrowsingContext(), context.forAccount(account, account.copy(backend = "https://other.example.test")))
        assertEquals(context, context.forAccount(account, account))
    }

    @Test fun `private ID navigation resets on account change but guest auth keeps its draft return`() {
        assertTrue(resetPrivateNavigation(account, account.copy(accountId = "account-b")))
        assertTrue(resetPrivateNavigation(account, account.copy(backend = "https://other.example.test")))
        assertTrue(resetPrivateNavigation(account, null))
        assertFalse(resetPrivateNavigation(account, account))
        assertFalse(resetPrivateNavigation(null, account))
    }
}
