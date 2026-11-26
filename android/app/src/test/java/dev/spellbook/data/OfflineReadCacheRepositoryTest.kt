package dev.spellbook.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.MockEngine
import io.ktor.client.engine.mock.respond
import io.ktor.http.HttpStatusCode
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException

@OptIn(ExperimentalCoroutinesApi::class)
class OfflineReadCacheRepositoryTest {
    private val scopeA = AccountScope("https://api.example.test", "account-a")
    private val scopeB = AccountScope("https://api.example.test", "account-b")

    private fun sampleInventoryPage(): InventoryPage = InventoryPage(
        revision = "12",
        queryKey = "default",
        entries = listOf(
            InventoryEntry("e1", "p1", "c1", "Lightning Bolt", "2XM", "", 4, "nonfoil", "NM", "Burn staple", "1"),
            InventoryEntry("e2", "p2", "c2", "Sol Ring", "CMM", "", 2, "foil", "LP", "Commander", "1"),
            InventoryEntry("e3", "p3", "c3", "Counterspell", "MH2", "", 3, "nonfoil", "NM", "", "1"),
        ),
        groups = listOf(Group("g1", "Trade Binder", 1, 2)),
        groupPage = listOf(Group("g1", "Trade Binder", 1, 2)),
        groupCount = 1,
        matching = Matching(3, 9),
        totals = InventoryTotals(3, 9, 3),
    )

    private fun sampleDeckLibrary(): DeckLibrary = DeckLibrary(
        revision = "5",
        offset = 0,
        limit = 30,
        matchingTotal = 2,
        globalTotal = 2,
        items = listOf(
            DeckSummary("d1", "Izzet Murktide", "modern", 75, ""),
            DeckSummary("d2", "Atraxa Superfriends", "commander", 100, ""),
        ),
    )

    @Test fun `inventory online read populates cache and offline search filters locally`() = runTest {
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        val cache = InMemoryReadCacheStore()
        val connectivity = FakeConnectivityObserver(true)
        var networkCalls = 0
        val pageJson = WireJson.encodeToString(sampleInventoryPage())
        val engine = MockEngine {
            networkCalls++
            if (!connectivity.isOnline.value) throw IOException("offline")
            respond(pageJson, HttpStatusCode.OK)
        }
        Api(scopeA.backend, HttpClient(engine)).use { api ->
            val repo = HttpInventoryRepository(api, cache, connectivity, ioDispatcher = dispatcher, clockMs = { 1000L })

            val remote = repo.readInventory(scopeA, "token-a", query = "", group = "", offset = 0)
            assertEquals(DataSource.REMOTE, remote.source)
            assertEquals(3, remote.value.entries.size)
            assertEquals(1, networkCalls)

            // Go offline: search & pagination are served from local cache without hitting network.
            connectivity.setOnline(false)
            val filtered = repo.readInventory(scopeA, "token-a", query = "bolt", group = "", offset = 0)
            assertEquals(DataSource.CACHE, filtered.source)
            assertEquals(1000L, filtered.cachedAtEpochMs)
            assertEquals(listOf("Lightning Bolt"), filtered.value.entries.map { it.name })
            assertEquals(1L, filtered.value.matching.entryCount)
            assertEquals(4L, filtered.value.matching.copyCount)
            assertEquals(1, networkCalls)

            val notesMatch = repo.readInventory(scopeA, "token-a", query = "Commander", group = "", offset = 0)
            assertEquals(listOf("Sol Ring"), notesMatch.value.entries.map { it.name })
        }
    }

    @Test fun `inventory box membership requires cached box read and entry detail is browsable offline`() = runTest {
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        val cache = InMemoryReadCacheStore()
        val connectivity = FakeConnectivityObserver(true)
        val entry = sampleInventoryPage().entries[1]
        val detailJson = WireJson.encodeToString(EntryDetail(entry, listOf("g1"), "12"))
        val groupsJson = WireJson.encodeToString(GroupPage("12", listOf(Group("g1", "Trade Binder", 1, 2)), 1))
        val pageJson = WireJson.encodeToString(sampleInventoryPage())
        val boxPageJson = WireJson.encodeToString(
            sampleInventoryPage().copy(
                entries = listOf(entry),
                matching = Matching(1, 2),
            ),
        )
        val engine = MockEngine { request ->
            when {
                request.url.encodedPath == "/api/v1/mtg/inventory" && request.url.parameters["group"] == "g1" -> respond(boxPageJson, HttpStatusCode.OK)
                request.url.encodedPath == "/api/v1/mtg/inventory" -> respond(pageJson, HttpStatusCode.OK)
                request.url.encodedPath == "/api/v1/mtg/inventory/e2" -> respond(detailJson, HttpStatusCode.OK)
                request.url.encodedPath == "/api/v1/mtg/inventory/groups" -> respond(groupsJson, HttpStatusCode.OK)
                else -> error("Unexpected path ${request.url.encodedPath}")
            }
        }
        Api(scopeA.backend, HttpClient(engine)).use { api ->
            val repo = HttpInventoryRepository(api, cache, connectivity, ioDispatcher = dispatcher, clockMs = { 2000L })
            repo.readInventory(scopeA, "token-a", query = "", group = "", offset = 0)
            repo.readEntry(scopeA, "token-a", "e2")

            // Uncached Box filter must report unavailable offline instead of misleading empty results.
            connectivity.setOnline(false)
            try {
                repo.readInventory(scopeA, "token-a", query = "", group = "g1", offset = 0)
                fail("Uncached Box filter must not return empty success offline")
            } catch (_: TransportFailure) {
            }

            // Once the Box filter is fetched online, it works offline.
            connectivity.setOnline(true)
            repo.readInventory(scopeA, "token-a", query = "", group = "g1", offset = 0)

            connectivity.setOnline(false)
            val boxFiltered = repo.readInventory(scopeA, "token-a", query = "", group = "g1", offset = 0)
            assertEquals(DataSource.CACHE, boxFiltered.source)
            assertEquals(listOf("Sol Ring"), boxFiltered.value.entries.map { it.name })

            val cachedDetail = repo.readEntry(scopeA, "token-a", "e2")
            assertEquals(DataSource.CACHE, cachedDetail.source)
            assertEquals(listOf("g1"), cachedDetail.value.first.memberships)
            assertEquals(1, cachedDetail.value.second.groups.size)
        }
    }

    @Test fun `cache is strictly isolated by account and empty cache fails instead of returning empty success`() = runTest {
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        val cache = InMemoryReadCacheStore()
        val connectivity = FakeConnectivityObserver(true)
        val pageJson = WireJson.encodeToString(sampleInventoryPage())
        val engine = MockEngine { respond(pageJson, HttpStatusCode.OK) }
        Api(scopeA.backend, HttpClient(engine)).use { api ->
            val repo = HttpInventoryRepository(api, cache, connectivity, ioDispatcher = dispatcher)
            repo.readInventory(scopeA, "token-a", query = "", group = "", offset = 0)

            connectivity.setOnline(false)
            try {
                repo.readInventory(scopeB, "token-b", query = "", group = "", offset = 0)
                fail("Account B must not read Account A's cached inventory or fabricate an empty page")
            } catch (_: TransportFailure) {
            }
        }
    }

    @Test fun `401 unauthorized never falls back to cached private data`() = runTest {
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        val cache = InMemoryReadCacheStore()
        val connectivity = FakeConnectivityObserver(true)
        var revoked = false
        val pageJson = WireJson.encodeToString(sampleInventoryPage())
        val engine = MockEngine {
            if (revoked) respond("""{"message":"Authentication required."}""", HttpStatusCode.Unauthorized)
            else respond(pageJson, HttpStatusCode.OK)
        }
        Api(scopeA.backend, HttpClient(engine)).use { api ->
            val repo = HttpInventoryRepository(api, cache, connectivity, ioDispatcher = dispatcher)
            repo.readInventory(scopeA, "token-a", query = "", group = "", offset = 0)
            revoked = true
            try {
                repo.readInventory(scopeA, "token-a", query = "", group = "", offset = 0)
                fail("401 must propagate so the session expires")
            } catch (_: RepositoryFailure.Unauthorized) {
            }
        }
    }

    @Test fun `offline mutations are rejected and confirmed online delete evicts cached entry`() = runTest {
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        val cache = InMemoryReadCacheStore()
        val connectivity = FakeConnectivityObserver(true)
        val pageJson = WireJson.encodeToString(sampleInventoryPage())
        val receiptJson = """{"requestId":"req-1","revision":"13","changes":[],"removedEntryIds":["e1"]}"""
        val engine = MockEngine { request ->
            if (request.url.encodedPath == "/api/v1/mtg/inventory/e1") respond(receiptJson, HttpStatusCode.OK)
            else respond(pageJson, HttpStatusCode.OK)
        }
        Api(scopeA.backend, HttpClient(engine)).use { api ->
            val repo = HttpInventoryRepository(api, cache, connectivity, ioDispatcher = dispatcher)
            repo.readInventory(scopeA, "token-a", query = "", group = "", offset = 0)

            val deleteAttempt = MutationAttempt(scopeA.backend, scopeA.accountId, "DELETE", "/api/v1/mtg/inventory/e1", """{"requestId":"req-1","expectedQuantity":4}""", "req-1")
            connectivity.setOnline(false)
            try {
                repo.submitMutation(scopeA, "token-a", deleteAttempt)
                fail("Offline write must be rejected in v1")
            } catch (_: OfflineWriteUnsupportedException) {
            }

            connectivity.setOnline(true)
            val submitted = repo.submitMutation(scopeA, "token-a", deleteAttempt)
            assertEquals("req-1", submitted.receipt.requestId)
            assertEquals("13", submitted.receipt.revision)

            connectivity.setOnline(false)
            val afterDelete = repo.readInventory(scopeA, "token-a", query = "", group = "", offset = 0)
            assertEquals(listOf("Counterspell", "Sol Ring"), afterDelete.value.entries.map { it.name })
        }
    }

    @Test fun `cache eviction failure after confirmed delete still returns confirmed receipt`() = runTest {
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        val failingCache = object : ReadCacheStore by InMemoryReadCacheStore() {
            override fun removeInventoryEntries(scope: AccountScope, entryIds: Collection<String>) {
                throw IllegalStateException("disk full")
            }
        }
        val connectivity = FakeConnectivityObserver(true)
        val receiptJson = """{"requestId":"req-1","revision":"13","changes":[],"removedEntryIds":["e1"]}"""
        val engine = MockEngine { respond(receiptJson, HttpStatusCode.OK) }
        Api(scopeA.backend, HttpClient(engine)).use { api ->
            val repo = HttpInventoryRepository(api, failingCache, connectivity, ioDispatcher = dispatcher)
            val deleteAttempt = MutationAttempt(scopeA.backend, scopeA.accountId, "DELETE", "/api/v1/mtg/inventory/e1", """{"requestId":"req-1","expectedQuantity":4}""", "req-1")
            val submitted = repo.submitMutation(scopeA, "token-a", deleteAttempt)
            assertEquals("req-1", submitted.receipt.requestId)
            assertEquals("13", submitted.receipt.revision)
        }
    }

    @Test fun `deck library and selected deck work offline with local search`() = runTest {
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        val cache = InMemoryReadCacheStore()
        val connectivity = FakeConnectivityObserver(true)
        val libraryJson = WireJson.encodeToString(sampleDeckLibrary())
        val selectedJson = WireJson.encodeToString(
            SelectedDeck(
                decks = listOf(Deck("d1", "Izzet Murktide", "modern", "Tempo deck", "1")),
                deckCards = listOf(DeckCard("dc1", "p1", "Lightning Bolt", "2XM", "", 4, "mainboard")),
                availability = mapOf("dc1" to Availability(4, 0, 0)),
            ),
        )
        val engine = MockEngine { request ->
            when {
                request.url.encodedPath == "/api/v1/mtg/deck-library" -> respond(libraryJson, HttpStatusCode.OK)
                request.url.encodedPath == "/api/v1/mtg/decks/d1" -> respond(selectedJson, HttpStatusCode.OK)
                else -> error("Unexpected path ${request.url.encodedPath}")
            }
        }
        Api(scopeA.backend, HttpClient(engine)).use { api ->
            val repo = HttpDeckRepository(api, cache, connectivity, ioDispatcher = dispatcher, clockMs = { 3000L })
            assertEquals(DataSource.REMOTE, repo.readDeckLibrary(scopeA, "token-a", query = "", offset = 0).source)
            assertEquals(DataSource.REMOTE, repo.readSelectedDeck(scopeA, "token-a", "d1").source)

            connectivity.setOnline(false)
            val filtered = repo.readDeckLibrary(scopeA, "token-a", query = "commander", offset = 0)
            assertEquals(DataSource.CACHE, filtered.source)
            assertEquals(listOf("Atraxa Superfriends"), filtered.value.items.map { it.name })

            val selected = repo.readSelectedDeck(scopeA, "token-a", "d1")
            assertEquals(DataSource.CACHE, selected.source)
            assertEquals("Izzet Murktide", selected.value.decks.single().name)
        }
    }

    @Test fun `offline groups pagination uses cached group count rather than larger server total`() = runTest {
        val dispatcher = UnconfinedTestDispatcher(testScheduler)
        val cache = InMemoryReadCacheStore()
        val connectivity = FakeConnectivityObserver(true)
        val partialGroups = GroupPage(
            revision = "9",
            groups = listOf(Group("g1", "Alpha", 1, 1), Group("g2", "Beta", 2, 3)),
            count = 100,
        )
        val engine = MockEngine { respond(WireJson.encodeToString(partialGroups), HttpStatusCode.OK) }
        Api(scopeA.backend, HttpClient(engine)).use { api ->
            val repo = HttpInventoryRepository(api, cache, connectivity, ioDispatcher = dispatcher)
            repo.readGroups(scopeA, "token-a", offset = 0, limit = 40)

            connectivity.setOnline(false)
            val cached = repo.readGroups(scopeA, "token-a", offset = 0, limit = 40)
            assertEquals(DataSource.CACHE, cached.source)
            assertEquals(2L, cached.value.count)
            assertEquals(2, cached.value.groups.size)
        }
    }
}
