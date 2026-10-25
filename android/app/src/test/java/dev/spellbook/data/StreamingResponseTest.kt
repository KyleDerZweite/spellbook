package dev.spellbook.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.*
import io.ktor.client.plugins.sse.SSE
import io.ktor.client.plugins.sse.SSEClientException
import io.ktor.http.*
import io.ktor.utils.io.ByteChannel
import io.ktor.utils.io.cancel
import io.ktor.utils.io.writeFully
import kotlinx.coroutines.*
import org.junit.Assert.*
import org.junit.Test
import java.io.IOException
import java.util.concurrent.atomic.AtomicInteger
import com.sun.net.httpserver.HttpServer
import java.net.InetSocketAddress
import java.util.concurrent.atomic.AtomicReference
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

class StreamingResponseTest {
    @Test fun `API cancels an unknown length oversized response before full consumption`() = runBlocking {
        assertBoundedStream { client ->
            Api("https://api.example.test", client).request("/api/v1/mtg/catalog/search")
        }
    }

    @Test fun `artwork cancels an unknown length oversized response before full consumption`() = runBlocking {
        assertBoundedStream { client ->
            if (loadArtworkBytes(client, "https://art.example.test/card.jpg") == null) throw TransportFailure()
        }
    }

    @Test fun `oversized API error body is stopped before full consumption`() = runBlocking {
        assertBoundedStream(HttpStatusCode.ServiceUnavailable) { client ->
            Api("https://api.example.test", client).request("/api/v1/account/profile", "session")
        }
    }

    @Test fun `non-success artwork body is closed without downloading it all`() = runBlocking {
        assertBoundedStream(HttpStatusCode.ServiceUnavailable) { client ->
            if (loadArtworkBytes(client, "https://art.example.test/card.jpg") == null) throw TransportFailure()
        }
    }

    @Test fun `SSE rejection cancels its streamed error body before Ktor can save it`() = runBlocking {
        val written = AtomicInteger()
        val finished = CountDownLatch(1)
        val total = 16 * 1024 * 1024
        val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
        server.createContext("/api/v1/account/events") { exchange ->
            try {
                exchange.responseHeaders.set("Content-Type", "application/json")
                exchange.sendResponseHeaders(401, 0)
                val chunk = ByteArray(8 * 1024) { 120 }
                exchange.responseBody.use { output ->
                    repeat(total / chunk.size) {
                        output.write(chunk); output.flush(); written.addAndGet(chunk.size)
                    }
                }
            } catch (_: IOException) { }
            finally { exchange.close(); finished.countDown() }
        }
        server.start()
        try {
            Api("http://127.0.0.1:${server.address.port}").use { api ->
                val failure = runCatching { api.events("revoked") { _, _ -> } }.exceptionOrNull()
                assertTrue("Expected 401, got $failure", failure is ApiFailure && failure.status == 401)
                assertTrue("The response producer did not stop", finished.await(5, TimeUnit.SECONDS))
                assertTrue("SSE saved all $total error bytes", written.get() < total)
            }
        } finally { server.stop(0) }
    }

    @Test fun `SSE handshake 401 uses the same auth failure as private reads`() = runBlocking {
        withSseResponse(401) { api, authorization ->
            val failure = runCatching { api.events("revoked-session") { _, _ -> fail("No event should be delivered") } }.exceptionOrNull()
            assertEquals("Bearer revoked-session", authorization.get())
            assertTrue("Expected ApiFailure(401), got $failure", failure is ApiFailure)
            assertEquals(401, (failure as ApiFailure).status)
        }
    }

    @Test fun `SSE unavailable does not become an expired session`() = runBlocking {
        withSseResponse(503) { api, _ ->
            val failure = runCatching { api.events("session") { _, _ -> } }.exceptionOrNull()
            assertNotNull(failure)
            assertFalse(failure is ApiFailure && failure.status == 401)
        }
    }

}

/** Backpressured 16 MiB producer with no Content-Length. A prebuffering client consumes it all. */
internal suspend fun assertBoundedStream(status: HttpStatusCode = HttpStatusCode.OK, consume: suspend (HttpClient) -> Unit) = coroutineScope {
    val total = 16 * 1024 * 1024
    val produced = AtomicInteger()
    val body = ByteChannel(autoFlush = true)
    val producer = launch(Dispatchers.Default) {
        val chunk = ByteArray(8 * 1024) { 120 }
        try {
            repeat(total / chunk.size) {
                body.writeFully(chunk)
                produced.addAndGet(chunk.size)
                yield()
            }
        } catch (_: Exception) {
            // The consumer must cancel this producer by closing the response channel.
        } finally { body.close() }
    }
    val client = HttpClient(MockEngine {
        respond(body, status, headersOf(HttpHeaders.CacheControl, "no-store"))
    })
    try {
        consume(client)
        fail("Expected the oversized response to be rejected")
    } catch (_: TransportFailure) {
        withTimeout(5_000) { producer.join() }
        assertTrue("Producer consumed all $total bytes before the cap: ${produced.get()}", produced.get() < total)
        assertTrue("Read-ahead must remain bounded: ${produced.get()}", produced.get() < 8 * 1024 * 1024)
        assertNotNull("Response cancellation must reach its source", body.closedCause)
    } finally {
        body.cancel()
        producer.cancelAndJoin()
        client.close()
    }
}

/** Real OkHttp/SSE handshake against a task-owned ephemeral loopback listener, without Android. */
private suspend fun withSseResponse(status: Int, test: suspend (Api, AtomicReference<String?>) -> Unit) {
    val authorization = AtomicReference<String?>()
    val server = HttpServer.create(InetSocketAddress("127.0.0.1", 0), 0)
    server.createContext("/api/v1/account/events") { exchange ->
        authorization.set(exchange.requestHeaders.getFirst("Authorization"))
        exchange.responseHeaders.set("Content-Type", "application/json")
        exchange.responseHeaders.set("Cache-Control", "no-store")
        exchange.sendResponseHeaders(status, 2)
        exchange.responseBody.use { it.write("{}".toByteArray()) }
        exchange.close()
    }
    server.start()
    try {
        Api("http://127.0.0.1:${server.address.port}").use { test(it, authorization) }
    } finally { server.stop(0) }
}
