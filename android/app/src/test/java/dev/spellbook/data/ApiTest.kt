package dev.spellbook.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.*
import io.ktor.client.request.*
import io.ktor.http.*
import io.ktor.http.content.*
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.*
import kotlinx.serialization.json.*
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant
import java.io.IOException

class ApiTest {
    @Test fun `release requires HTTPS and debug permits only loopback HTTP`() {
        assertEquals("https://api.example.test", normalizeBackend("https://api.example.test/", false))
        assertEquals("http://127.0.0.1:4123", normalizeBackend("http://127.0.0.1:4123", true))
        listOf("http://api.example.test", "http://192.168.1.2:4000", "https://u:p@example.test", "https://example.test/api", "https://example.test?token=x").forEach { value ->
            assertThrows(IllegalArgumentException::class.java) { normalizeBackend(value, value.contains("192.168")) }
        }
    }
    @Test fun `fixed expiry is checked without refresh tokens`() {
        val session = Session("https://api.example.test", User("account-a", "alice"), "token-a", "2026-10-20T12:00:00Z")
        assertTrue(session.isLive(Instant.parse("2026-10-20T11:59:59Z")))
        assertFalse(session.isLive(Instant.parse("2026-10-20T12:00:00Z")))
    }
    @Test fun `public reads omit credentials and private reads send only selected bearer`() = runTest {
        val seen = mutableListOf<String?>()
        val paths = mutableListOf<String>()
        val engine = MockEngine { request ->
            seen += request.headers[HttpHeaders.Authorization]
            paths += request.url.encodedPath
            assertNull(request.headers[HttpHeaders.Cookie])
            respond("{}", HttpStatusCode.OK, headersOf(HttpHeaders.CacheControl, "no-store"))
        }
        Api("https://api.example.test", HttpClient(engine)).use { api ->
            api.request("/api/v1/mtg/catalog/search")
            api.request("/api/v1/account/profile", "account-a-token")
            api.request("/api/v1/account/profile", "account-b-token")
        }
        assertEquals(listOf(null, "Bearer account-a-token", "Bearer account-b-token"), seen)
        assertEquals(listOf("/api/v1/mtg/catalog/search", "/api/v1/account/profile", "/api/v1/account/profile"), paths)
    }
    @Test fun `no-store response is never reused`() = runTest {
        var calls = 0
        val engine = MockEngine { calls++; respond("{\"revision\":\"$calls\"}", headers = headersOf(HttpHeaders.CacheControl, "no-store")) }
        Api("https://api.example.test", HttpClient(engine)).use { api ->
            assertNotEquals(api.request("/api/v1/mtg/inventory", "a"), api.request("/api/v1/mtg/inventory", "a"))
        }
        assertEquals(2, calls)
    }
    @Test fun `structured conflict details retain saved values and revision`() = runTest {
        val body = """{"message":"Notes changed","kind":"NotesConflict","entryId":"entry-a","notes":"new saved note","notesRevision":"42"}"""
        val engine = MockEngine { respond(body, HttpStatusCode.Conflict) }
        Api("https://api.example.test", HttpClient(engine)).use { api ->
            try { api.request("/api/v1/mtg/inventory/entry-a", "a", "PATCH", "{}"); fail("Expected conflict") }
            catch (failure: ApiFailure) {
                assertEquals("NotesConflict", failure.kind)
                assertEquals("new saved note", failure.detail["notes"]?.jsonPrimitive?.content)
                assertEquals("42", failure.detail["notesRevision"]?.jsonPrimitive?.content)
            }
        }
    }
    @Test fun `ambiguous transport failure never retries automatically`() = runTest {
        var calls = 0
        val engine = MockEngine { calls++; throw IOException("response lost") }
        Api("https://api.example.test", HttpClient(engine)).use { api ->
            try { api.request("/api/v1/mtg/inventory", "a", "POST", "{}"); fail("Expected failure") }
            catch (_: TransportFailure) { }
        }
        assertEquals(1, calls)
    }
    @Test fun `mutation body and request identity stay frozen across explicit retry`() = runTest {
        val frozen = MutationAttempt("https://api.example.test", "a", "POST", "/api/v1/mtg/inventory", "{\"requestId\":\"request-a\",\"items\":[{\"quantity\":2}]}", "request-a")
        val seen = mutableListOf<String>()
        val engine = MockEngine { request ->
            assertEquals("/api/v1/mtg/inventory", request.url.encodedPath)
            assertEquals(HttpMethod.Post, request.method)
            seen += (request.body as TextContent).text
            if (seen.size == 1) throw IOException("lost acknowledgement")
            respond("""{"requestId":"request-a","revision":"7","changes":[],"removedEntryIds":[]}""")
        }
        Api(frozen.backend, HttpClient(engine)).use { api ->
            try { api.request(frozen.path, "a", frozen.method, frozen.body) } catch (_: TransportFailure) { }
            val retry = frozen.retryFor(frozen.backend, "a")
            val receipt = api.request(retry.path, "a", retry.method, retry.body)
            val confirmed = retry.confirm(receipt)
            assertNotNull(confirmed.confirmedReceipt)
            assertThrows(IllegalStateException::class.java) { confirmed.retryFor(frozen.backend, "a") }
        }
        assertEquals(listOf(frozen.body, frozen.body), seen)
    }
    @Test fun `frozen retry cannot cross accounts or backends`() {
        val attempt = MutationAttempt("https://a.example.test", "account-a", "POST", "/api/v1/mtg/inventory", "{}", "request-a")
        assertThrows(IllegalStateException::class.java) { attempt.retryFor(attempt.backend, "account-b") }
        assertThrows(IllegalStateException::class.java) { attempt.retryFor("https://b.example.test", "account-a") }
        assertThrows(IllegalStateException::class.java) { attempt.confirm("""{"requestId":"another-request","revision":"1","changes":[],"removedEntryIds":[]}""") }
    }
    @Test fun `obsolete persisted attempts are discarded without changing the add draft`() {
        val add = AddDraft(Printing("printing-a", "canonical-a", "Card", is_nonfoil_available = true), "3")
        val original = MutationAttempt("https://api.example.test", "a", "POST", "/api/mobile/v1/mtg/inventory", "{\"requestId\":\"old-request\",\"items\":[]}", "old-request")
        for (attempt in listOf(original, original.copy(confirmedReceipt = "saved receipt"))) {
            val restored = WireJson.decodeFromString<DraftState>(WireJson.encodeToString(DraftState(add, attempt)))
                .withCurrentAttempt()
            assertEquals(add, restored.add)
            assertNull(restored.attempt)
            assertThrows(IllegalStateException::class.java) { attempt.retryFor(attempt.backend, attempt.accountId) }
        }
        assertEquals(DraftState(add), DraftState(add).withCurrentAttempt())
    }
    @Test fun `only current mutation operations retain frozen attempts`() {
        val current = listOf(
            "POST" to "/api/v1/mtg/inventory", "POST" to "/api/v1/mtg/inventory/groups",
            "PATCH" to "/api/v1/mtg/inventory/entry-a", "DELETE" to "/api/v1/mtg/inventory/entry-a",
            "PUT" to "/api/v1/mtg/inventory/entry-a/groups",
        )
        for ((method, path) in current) {
            val attempt = MutationAttempt("https://api.example.test", "a", method, path, "frozen body", "request-a")
            for (retained in listOf(attempt, attempt.copy(confirmedReceipt = "saved receipt"))) {
                val draft = DraftState(attempt = retained)
                val restored = WireJson.decodeFromString<DraftState>(WireJson.encodeToString(draft)).withCurrentAttempt()
                assertEquals(draft, restored)
            }
            assertEquals(attempt, attempt.retryFor(attempt.backend, attempt.accountId))
        }
        for ((method, path) in listOf(
            "GET" to "/api/v1/mtg/inventory", "POST" to "/api/v1/mtg/inventory/entry-a",
            "PATCH" to "/api/v1/mtg/inventory/entry-a/groups", "DELETE" to "/api/v1/mtg/inventory/entry-a?old=true",
            "PUT" to "/api/v1/mtg/inventory/entry-a/groups/old",
        )) {
            val attempt = MutationAttempt("https://api.example.test", "a", method, path, "frozen body", "request-a")
            assertNull(DraftState(attempt = attempt).withCurrentAttempt().attempt)
            assertThrows(IllegalStateException::class.java) { attempt.retryFor(attempt.backend, attempt.accountId) }
        }
    }
    @Test fun `add body uses printing identity and keeps existing Notes unchanged`() {
        val printing = Printing("printing-a", "canonical-a", "Real server card", is_nonfoil_available = true)
        val body = WireJson.parseToJsonElement(inventoryAddBody(AddDraft(printing, "3"), "request-a")).jsonObject
        val item = body["items"]!!.jsonArray.single().jsonObject
        assertEquals(3, item["quantity"]!!.jsonPrimitive.int)
        assertEquals("printing-a", item["catalogCardId"]!!.jsonPrimitive.content)
        assertFalse(item.containsKey("name")); assertFalse(item.containsKey("accountId")); assertFalse(item.containsKey("notes"))
        assertThrows(IllegalArgumentException::class.java) { inventoryAddBody(AddDraft(printing, "0"), "new-request") }
        assertThrows(IllegalArgumentException::class.java) { inventoryAddBody(AddDraft(printing, finish = "foil"), "new-request") }
    }
    @Test fun `draft serialization retains unconfirmed body after process recreation`() {
        val attempt = MutationAttempt("https://a.example.test", "a", "POST", "/api/v1/mtg/inventory", "{\"requestId\":\"r\",\"items\":[]}", "r")
        val restored = WireJson.decodeFromString<DraftState>(WireJson.encodeToString(DraftState(attempt = attempt)))
        assertEquals(attempt, restored.attempt)
        assertFalse(ApiFailure(503, buildJsonObject { put("message", "Unavailable") }).isDefinitiveMutationFailure())
        assertTrue(ApiFailure(409, buildJsonObject { put("message", "Changed") }).isDefinitiveMutationFailure())
    }
    @Test fun `private request cancellation propagates instead of becoming a retry failure`() = runTest {
        val entered = CompletableDeferred<Unit>()
        var calls = 0
        val engine = MockEngine { calls++; entered.complete(Unit); awaitCancellation() }
        Api("https://api.example.test", HttpClient(engine)).use { api ->
            val read = launch { api.request("/api/v1/account/profile", "a") }
            entered.await()
            read.cancelAndJoin()
            assertTrue(read.isCancelled)
        }
        assertEquals(1, calls)
    }
    @Test fun `oversized response is unavailable instead of partially decoded success`() = runTest {
        val engine = MockEngine { respond("x".repeat(2 * 1024 * 1024 + 1)) }
        Api("https://api.example.test", HttpClient(engine)).use { api ->
            try { api.request("/api/v1/mtg/catalog/search"); fail("Expected bounded read failure") }
            catch (_: TransportFailure) { }
        }
    }
    @Test fun `profile text resolves only actual metrics and preserves mana symbols`() {
        val totals = Totals(1234, 45, 50, 9, 3, 2)
        assertEquals("1,234 copies, 2 Decks, {G}", resolveProfileText("{total_owned_cards} copies, {total_decks} Decks, {G}", totals))
        assertEquals("unavailable copies", resolveProfileText("{total_owned_cards} copies", null))
    }

}
