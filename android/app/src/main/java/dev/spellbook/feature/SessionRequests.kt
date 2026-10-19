package dev.spellbook.feature

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/** Epoch changes cover token replacement, account changes, logout, expiry and background disposal. */
data class AuthIntentContext(val backend: String, val accountId: String?, val epoch: Int)

/** Owns the latest login/logout job and fences callbacks even if a cancelled provider completes late. */
class SessionRequests(private val currentContext: () -> AuthIntentContext) {
    private var generation = 0L
    private var job: Job? = null

    fun cancel() {
        generation++
        job?.cancel()
        job = null
    }

    fun <T> launch(
        scope: CoroutineScope,
        request: suspend () -> T,
        onSuccess: (T) -> Unit,
        onFailure: (Exception) -> Unit,
    ): Job {
        cancel()
        val owner = generation
        val context = currentContext()
        fun current() = owner == generation && context == currentContext() && job?.isActive == true
        val work = scope.launch(start = CoroutineStart.LAZY) {
            try {
                val result = request()
                if (current()) onSuccess(result)
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (cause: Exception) { if (current()) onFailure(cause) }
        }
        job = work
        work.start()
        return work
    }
}
