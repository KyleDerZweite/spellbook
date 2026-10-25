package dev.spellbook.feature

import kotlinx.coroutines.*
import kotlinx.coroutines.test.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import dev.spellbook.data.*
import kotlinx.serialization.json.buildJsonObject

@OptIn(ExperimentalCoroutinesApi::class)
class SessionRequestsTest {
    @Test fun `delayed login completion after local logout cannot restore the credential or return to draft`() = runTest {
        var context = AuthIntentContext("https://api.example.test", "account-a", 1)
        val requests = SessionRequests { context }
        val response = CompletableDeferred<String>()
        var credential: String? = "expired-token"
        var returnedToDraft = false
        val login = requests.launch(this,
            request = { withContext(NonCancellable) { response.await() } },
            onSuccess = { credential = it; returnedToDraft = true }, onFailure = { fail("Stale login failure") })
        runCurrent()
        context = context.copy(epoch = 2)
        requests.launch(this, request = { Unit }, onSuccess = {
            credential = null
            context = context.copy(accountId = null, epoch = 3)
        }, onFailure = { fail("Local logout should succeed") })
        runCurrent()
        response.complete("late-session-token")
        advanceUntilIdle()
        assertTrue(login.isCancelled)
        assertNull(credential)
        assertFalse(returnedToDraft)
    }

    @Test fun `epoch backend and account fences reject a completed request even without job cancellation`() = runTest {
        val origin = AuthIntentContext("https://api.example.test", "account-a", 1)
        for (changed in listOf(origin.copy(epoch = 2), origin.copy(accountId = "account-b"), origin.copy(backend = "https://other.example.test"))) {
            var context = origin
            val requests = SessionRequests { context }
            val response = CompletableDeferred<String>()
            var accepted = false
            requests.launch(this, request = { response.await() }, onSuccess = { accepted = true }, onFailure = { accepted = true })
            runCurrent()
            context = changed
            response.complete("completed-token")
            advanceUntilIdle()
            assertFalse("Stale context $changed accepted a result", accepted)
        }
    }

    @Test fun `Back cancels the login intent and suppresses a delayed failure`() = runTest {
        val context = AuthIntentContext("https://api.example.test", null, 1)
        val requests = SessionRequests { context }
        val response = CompletableDeferred<Unit>()
        var error: String? = null
        val login = requests.launch(this, request = {
            withContext(NonCancellable) { response.await(); throw IOException("late network failure") }
        }, onSuccess = { fail("Login should not succeed") }, onFailure = { error = it.message })
        runCurrent()
        requests.cancel()
        response.complete(Unit)
        advanceUntilIdle()
        assertTrue(login.isCancelled)
        assertNull(error)
    }

    @Test fun `late logout response cannot clear a newer account session`() = runTest {
        var context = AuthIntentContext("https://api.example.test", "account-a", 1)
        val requests = SessionRequests { context }
        val revoked = CompletableDeferred<Unit>()
        var credential: String? = "account-a-token"
        requests.launch(this, request = { withContext(NonCancellable) { revoked.await() } },
            onSuccess = { credential = null }, onFailure = { fail("Stale logout error") })
        runCurrent()
        context = context.copy(epoch = 2)
        requests.launch(this, request = { "account-b-token" }, onSuccess = {
            credential = it
            context = context.copy(accountId = "account-b", epoch = 3)
        }, onFailure = { fail("Current login failed") })
        runCurrent()
        revoked.complete(Unit)
        advanceUntilIdle()
        assertEquals("account-b-token", credential)
    }

    @Test fun `current intent delivers the result and network failures remain explicit`() = runTest {
        val context = AuthIntentContext("https://api.example.test", null, 1)
        val requests = SessionRequests { context }
        var accepted: String? = null
        requests.launch(this, request = { "current-session" }, onSuccess = { accepted = it }, onFailure = { fail("Unexpected failure") })
        advanceUntilIdle()
        assertEquals("current-session", accepted)
        var failure: Exception? = null
        requests.launch(this, request = { throw IOException("offline") }, onSuccess = { fail("Offline is not a guest success") }, onFailure = { failure = it })
        advanceUntilIdle()
        assertTrue(failure is IOException)
    }
    @Test fun `expiry gates private state immediately even if credential cleanup fails`() {
        val user = User("account-a", "alice")
        val session = Session("https://api.example.test", user, "session-a", "2026-10-20T12:00:00Z")
        val draft = DraftState(attempt = MutationAttempt(session.backend, user.accountId, "DELETE", "/api/v1/mtg/inventory/entry-a", "{}", "request-a"))
        val before = AppState(session = session, verified = true,
            data = ScreenData.Account(Profile(user, buildJsonObject { }, null, null)), draft = draft,
            authenticating = true, saving = true, loading = true, live = "Live updates connected")
        for (cleared in listOf(true, false)) {
            val after = before.authExpired(cleared)
            assertFalse(after.verified)
            assertNull(after.data)
            assertFalse(after.loading)
            assertFalse(after.saving)
            assertFalse(after.authenticating)
            assertEquals("", after.live)
            assertEquals(user.accountId, after.session?.user?.accountId)
            assertEquals(draft, after.draft)
        }
    }

}
