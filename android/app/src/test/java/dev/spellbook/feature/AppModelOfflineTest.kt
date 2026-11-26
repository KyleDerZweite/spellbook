package dev.spellbook.feature

import dev.spellbook.data.*
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.*
import org.junit.Test
import java.time.Instant

@OptIn(ExperimentalCoroutinesApi::class)
class AppModelOfflineTest {
    private val backend = "https://api.example.test"
    private val user = User("account-a", "alice")
    private val futureExpiry = Instant.now().plusSeconds(3600).toString()
    private val liveSession = Session(backend, user, "token-a", futureExpiry)

    private fun sampleInventoryPage() = InventoryPage(
        revision = "10",
        queryKey = "default",
        entries = listOf(
            InventoryEntry("e1", "p1", "c1", "Lightning Bolt", "2XM", "", 4, "nonfoil", "NM", "", "1"),
            InventoryEntry("e2", "p2", "c2", "Sol Ring", "CMM", "", 1, "foil", "NM", "", "1"),
        ),
        groups = listOf(Group("g1", "Binder", 1, 4)),
        groupPage = listOf(Group("g1", "Binder", 1, 4)),
        groupCount = 1,
        matching = Matching(2, 5),
        totals = InventoryTotals(2, 5, 2),
    )

    private fun sampleDeckLibrary() = DeckLibrary(
        revision = "4",
        offset = 0,
        limit = 30,
        matchingTotal = 2,
        globalTotal = 2,
        items = listOf(
            DeckSummary("d1", "Mono Red Burn", "modern", 60, ""),
            DeckSummary("d2", "Yuriko Ninjas", "commander", 100, ""),
        ),
    )

    private fun sampleDashboard() = Dashboard(
        totals = Totals(5, 2, 2, 2, 1, 2),
        recentEntries = emptyList(),
        decks = listOf(RecentDeck("d1", "Mono Red Burn", "modern", 60, 0)),
    )

    private data class Harness(
        val model: AppModel,
        val storage: FakeLocalStorageAdapter,
        val connectivity: FakeConnectivityObserver,
        val auth: FakeAuthRepository,
        val inventory: FakeInventoryRepository,
        val decks: FakeDeckRepository,
        val scan: FakeScanRepository,
        val cache: InMemoryReadCacheStore,
    )

    private fun TestScope.createHarness(
        initialSession: Session? = liveSession,
        initialOnline: Boolean = true,
    ): Harness {
        val storage = FakeLocalStorageAdapter(initialSession)
        val connectivity = FakeConnectivityObserver(initialOnline)
        val cache = InMemoryReadCacheStore()
        val auth = FakeAuthRepository(
            validateHandler = { SessionInfo(user, futureExpiry) },
        )
        val catalog = FakeCatalogRepository()
        val inventory = FakeInventoryRepository(cache, connectivity).apply {
            remoteDashboard = sampleDashboard()
            remoteInventory = sampleInventoryPage()
        }
        val decks = FakeDeckRepository(cache, connectivity).apply {
            remoteLibrary = sampleDeckLibrary()
        }
        val scan = FakeScanRepository(connectivity)
        val repos = AppRepositories(
            backend = backend,
            storage = storage,
            connectivity = connectivity,
            auth = auth,
            catalog = catalog,
            inventory = inventory,
            decks = decks,
            scan = scan,
        )
        val model = AppModel(repos, baseScope = backgroundScope)
        return Harness(model, storage, connectivity, auth, inventory, decks, scan, cache)
    }

    @Test fun `online reads populate cache then offline mode browses inventory and decks while blocking writes`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        h.model.foreground(true)
        runCurrent()
        assertTrue(h.model.state.value.verified)
        assertTrue(h.model.state.value.canWriteOnline)

        // Populate Inventory and Decks caches while online.
        h.model.navigate(Route("inventory"))
        runCurrent()
        assertEquals(DataSource.REMOTE, h.model.state.value.dataSource)
        assertEquals(2, (h.model.state.value.data as ScreenData.Inventory).value.entries.size)

        h.model.navigate(Route("decks"))
        runCurrent()
        assertEquals(DataSource.REMOTE, h.model.state.value.dataSource)
        assertEquals(2, (h.model.state.value.data as ScreenData.Decks).value.items.size)

        // Drop connectivity -> offline banner active, writes disabled, cached reads work!
        h.connectivity.setOnline(false)
        runCurrent()
        assertTrue(h.model.state.value.isOffline)
        assertTrue(h.model.state.value.canBrowsePrivate)
        assertFalse(h.model.state.value.canWriteOnline)

        // Offline Deck search
        h.model.decks("yuriko")
        runCurrent()
        assertEquals(DataSource.CACHE, h.model.state.value.dataSource)
        assertEquals(listOf("Yuriko Ninjas"), (h.model.state.value.data as ScreenData.Decks).value.items.map { it.name })

        // Offline Inventory browse & search
        h.model.navigate(Route("inventory"))
        runCurrent()
        h.model.inventory("bolt")
        runCurrent()
        assertEquals(DataSource.CACHE, h.model.state.value.dataSource)
        assertEquals(listOf("Lightning Bolt"), (h.model.state.value.data as ScreenData.Inventory).value.entries.map { it.name })

        // Offline writes are blocked and never reach the repository
        h.model.createGroup("Offline Box")
        h.model.patchEntry(sampleInventoryPage().entries.first(), "5", "note")
        h.model.decideQr("qr-code-123", "approve", confirmed = true)
        runCurrent()
        assertTrue(h.inventory.submittedMutations.isEmpty())
        assertTrue(h.scan.decisions.isEmpty())
        assertNotNull(h.model.state.value.writeError)
    }

    @Test fun `cold start while offline with live saved session enters read-only cached mode and recovers on reconnect`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = false)
        val scope = AccountScope(backend, user.accountId)
        h.cache.saveDashboard(scope, sampleDashboard(), 1000L)
        h.cache.saveInventoryPage(scope, "", "", 0, sampleInventoryPage(), 1000L)

        h.model.foreground(true)
        runCurrent()

        assertTrue(h.model.state.value.isOffline)
        assertFalse(h.model.state.value.verified)
        assertTrue(h.model.state.value.canBrowsePrivate)
        assertFalse(h.model.state.value.canWriteOnline)
        assertEquals(0, h.auth.validateCalls)
        assertEquals(DataSource.CACHE, h.model.state.value.dataSource)
        assertTrue(h.model.state.value.data is ScreenData.Home)

        h.model.navigate(Route("inventory"))
        runCurrent()
        assertEquals(DataSource.CACHE, h.model.state.value.dataSource)
        assertEquals(2, (h.model.state.value.data as ScreenData.Inventory).value.entries.size)

        // Connectivity returns -> validates session and re-enables online writes.
        h.connectivity.setOnline(true)
        runCurrent()
        assertEquals(1, h.auth.validateCalls)
        assertTrue(h.model.state.value.verified)
        assertFalse(h.model.state.value.isOffline)
        assertTrue(h.model.state.value.canWriteOnline)
        assertEquals(DataSource.REMOTE, h.model.state.value.dataSource)
    }

    @Test fun `logout clears local read cache for the signed out account`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        h.model.foreground(true)
        runCurrent()

        h.model.navigate(Route("inventory"))
        runCurrent()
        val scope = AccountScope(backend, user.accountId)
        assertNotNull(h.cache.loadInventoryPage(scope, "", "", 0, 40))

        var loggedOut = false
        h.model.logout { loggedOut = true }
        runCurrent()

        assertTrue(loggedOut)
        assertEquals(1, h.auth.logoutCalls)
        assertEquals(listOf(scope), h.inventory.clearedScopes)
        assertEquals(listOf(scope), h.decks.clearedScopes)
        assertNull(h.cache.loadInventoryPage(scope, "", "", 0, 40))
    }

    @Test fun `scan adapter supplies capture status and executes online QR decisions`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        assertFalse(h.model.state.value.scanCaptureStatus.available)
        assertEquals("Camera recognition unavailable", h.model.state.value.scanCaptureStatus.title)

        h.model.foreground(true)
        runCurrent()
        h.model.navigate(Route("qr", id = "AbCdEfGh12345678901234567890123456789012345"))
        runCurrent()
        assertTrue(h.model.state.value.data is ScreenData.Qr)

        h.model.decideQr("AbCdEfGh12345678901234567890123456789012345", "approve", confirmed = true)
        runCurrent()
        assertEquals(1, h.scan.decisions.size)
        assertEquals("approve", h.scan.decisions.single().second)
    }

    @Test fun `server 401 revokes offline cache access even if connectivity drops later`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        h.model.foreground(true)
        runCurrent()
        h.model.navigate(Route("inventory"))
        runCurrent()
        assertTrue(h.model.state.value.verified)

        // Server revokes the session with 401.
        h.inventory.remoteFailure = RepositoryFailure.Unauthorized()
        h.model.refresh()
        runCurrent()
        assertFalse(h.model.state.value.verified)
        assertTrue(h.model.state.value.sessionRevoked)
        assertFalse(h.model.state.value.canBrowsePrivate)

        // Losing connectivity must NOT re-grant access to the revoked account's cache.
        h.connectivity.setOnline(false)
        runCurrent()
        assertFalse(h.model.state.value.canBrowsePrivate)
        h.model.navigate(Route("inventory"))
        runCurrent()
        assertNull(h.model.state.value.data)
    }

    @Test fun `remote logout is blocked offline while local sign-in removal still clears cache`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        h.model.foreground(true)
        runCurrent()
        h.model.navigate(Route("inventory"))
        runCurrent()

        h.connectivity.setOnline(false)
        runCurrent()
        var loggedOut = false
        h.model.logout(forgetOnly = false) { loggedOut = true }
        runCurrent()
        assertFalse(loggedOut)
        assertEquals(0, h.auth.logoutCalls)
        assertNotNull(h.model.state.value.error)

        h.model.logout(forgetOnly = true) { loggedOut = true }
        runCurrent()
        assertTrue(loggedOut)
        assertEquals(0, h.auth.logoutCalls)
        assertNull(h.model.state.value.session)
        assertNull(h.cache.loadInventoryPage(AccountScope(backend, user.accountId), "", "", 0, 40))
    }

    @Test fun `logout 401 revokes session and blocks offline cache access`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        h.model.foreground(true)
        runCurrent()
        h.model.navigate(Route("inventory"))
        runCurrent()
        h.auth.logoutHandler = { throw RepositoryFailure.Unauthorized() }

        h.model.logout(forgetOnly = false) {}
        runCurrent()
        assertFalse(h.model.state.value.verified)
        assertTrue(h.model.state.value.sessionRevoked)
        assertFalse(h.model.state.value.canBrowsePrivate)

        h.connectivity.setOnline(false)
        runCurrent()
        assertFalse(h.model.state.value.canBrowsePrivate)
    }

    @Test fun `public catalog read does not close private offline fallback before session verification`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        val scope = AccountScope(backend, user.accountId)
        h.cache.saveInventoryPage(scope, "", "", 0, sampleInventoryPage(), 1000L)
        h.auth.validateHandler = { throw TransportFailure() }

        h.model.foreground(true)
        runCurrent()
        assertTrue(h.model.state.value.isOffline)
        assertFalse(h.model.state.value.verified)
        assertTrue(h.model.state.value.canBrowsePrivate)

        // Public Catalog Search succeeds while network is reachable, but private session is still unverified.
        h.model.navigate(Route("search"))
        runCurrent()
        assertTrue(h.model.state.value.isOffline)
        assertTrue(h.model.state.value.canBrowsePrivate)

        // Returning to Inventory still reads from the local cache.
        h.model.navigate(Route("inventory"))
        runCurrent()
        assertEquals(DataSource.CACHE, h.model.state.value.dataSource)
        assertEquals(2, (h.model.state.value.data as ScreenData.Inventory).value.entries.size)
    }

    @Test fun `public catalog read does not re-enable writes after verified session fell back to cache`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        h.model.foreground(true)
        runCurrent()
        h.model.navigate(Route("inventory"))
        runCurrent()
        assertTrue(h.model.state.value.verified)
        assertTrue(h.model.state.value.canWriteOnline)

        // Authenticated read hits transport failure and falls back to cache while Android still reports online.
        h.inventory.remoteFailure = TransportFailure()
        h.model.refresh()
        runCurrent()
        assertTrue(h.model.state.value.verified)
        assertTrue(h.model.state.value.isOffline)
        assertFalse(h.model.state.value.canWriteOnline)
        assertEquals(DataSource.CACHE, h.model.state.value.dataSource)

        // Public Catalog read succeeds, but private offline state and disabled writes must persist.
        h.model.navigate(Route("search"))
        runCurrent()
        assertTrue(h.model.state.value.isOffline)
        assertFalse(h.model.state.value.canWriteOnline)

        // Once authenticated reads succeed again, online writes are re-enabled.
        h.inventory.remoteFailure = null
        h.model.navigate(Route("inventory"))
        runCurrent()
        assertFalse(h.model.state.value.isOffline)
        assertTrue(h.model.state.value.canWriteOnline)
        assertEquals(DataSource.REMOTE, h.model.state.value.dataSource)
    }

    @Test fun `reconnect revalidates session before enabling writes and backend recovery restarts live events`() = runTest {
        var eventStreamsStarted = 0
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        h.auth.eventsHandler = { _, _ ->
            eventStreamsStarted++
            kotlinx.coroutines.awaitCancellation()
        }
        h.model.foreground(true)
        runCurrent()
        assertEquals(1, eventStreamsStarted)

        // Drop network, then reconnect while backend is still unreachable -> writes stay disabled!
        h.connectivity.setOnline(false)
        runCurrent()
        h.auth.validateHandler = { throw TransportFailure() }
        h.connectivity.setOnline(true)
        runCurrent()
        assertTrue(h.model.state.value.isOffline)
        assertFalse(h.model.state.value.canWriteOnline)

        // Backend recovers -> validateSession succeeds -> writes enabled and stream restarted.
        h.auth.validateHandler = { SessionInfo(user, futureExpiry) }
        h.model.retryConnection()
        runCurrent()
        assertFalse(h.model.state.value.isOffline)
        assertTrue(h.model.state.value.canWriteOnline)
        assertEquals(2, eventStreamsStarted)

        // Cache fallback without connectivity drop cancels stream; subsequent remote private refresh restarts it.
        h.model.navigate(Route("inventory"))
        runCurrent()
        h.inventory.remoteFailure = TransportFailure()
        h.model.refresh()
        runCurrent()
        assertTrue(h.model.state.value.isOffline)
        h.inventory.remoteFailure = null
        h.model.refresh()
        runCurrent()
        assertFalse(h.model.state.value.isOffline)
        assertEquals(3, eventStreamsStarted)
    }

    @Test fun `typed repository mutation conflict surfaces latest saved notes without HTTP details`() = runTest {
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        h.model.foreground(true)
        runCurrent()
        h.inventory.mutationHandler = { _, _, _ ->
            throw RepositoryFailure.MutationRejected(
                message = "Notes changed",
                definitive = true,
                conflict = MutationConflict.NotesConflict("Server note v2"),
            )
        }

        h.model.patchEntry(sampleInventoryPage().entries.first(), "4", "My local note")
        runCurrent()
        assertNull(h.model.state.value.draft.attempt)
        assertTrue(h.model.state.value.writeError.orEmpty().contains("Server note v2"))
    }

    @Test fun `connectivity drop during in-flight session validation keeps writes disabled when validation completes`() = runTest {
        val gate = kotlinx.coroutines.CompletableDeferred<SessionInfo>()
        var eventsStarted = 0
        val h = createHarness(initialSession = liveSession, initialOnline = true)
        h.auth.validateHandler = { gate.await() }
        h.auth.eventsHandler = { _, _ -> eventsStarted++; kotlinx.coroutines.awaitCancellation() }

        h.model.foreground(true)
        runCurrent()
        assertTrue(h.model.state.value.checkingSession)

        // Connectivity drops before validation finishes.
        h.connectivity.setOnline(false)
        runCurrent()
        assertTrue(h.model.state.value.isOffline)

        // Validation response arrives late while device is offline.
        gate.complete(SessionInfo(user, futureExpiry))
        runCurrent()
        assertTrue(h.model.state.value.verified)
        assertTrue(h.model.state.value.isOffline)
        assertFalse(h.model.state.value.canWriteOnline)
        assertEquals(0, eventsStarted)
    }
}
