package dev.spellbook.data

import io.ktor.client.HttpClient
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.sse.SSE
import io.ktor.client.plugins.sse.sse
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.utils.io.*
import kotlinx.io.readByteArray
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.collect
import kotlinx.serialization.json.*
import java.net.URI
import java.time.Instant

fun normalizeBackend(value: String, debug: Boolean): String {
    val uri = URI(value.trim().trimEnd('/'))
    require(uri.host != null && uri.rawUserInfo == null && uri.rawQuery == null && uri.rawFragment == null && uri.path.orEmpty().isEmpty()) {
        "Configure an API origin without a path, credentials, query or fragment."
    }
    require(uri.scheme == "https" || (debug && uri.scheme == "http" && uri.host in setOf("127.0.0.1", "localhost"))) {
        "HTTPS is required. Debug HTTP is limited to loopback through adb reverse."
    }
    return uri.toASCIIString().trimEnd('/')
}
fun Session.isLive(now: Instant = Instant.now()): Boolean = runCatching { Instant.parse(expiresAt).isAfter(now) }.getOrDefault(false)

class ApiFailure(val status: Int, val detail: JsonObject) : Exception(
    detail["message"]?.jsonPrimitive?.contentOrNull ?: "Request failed ($status)."
) {
    val kind: String? get() = detail["kind"]?.jsonPrimitive?.contentOrNull
}
class TransportFailure : Exception("The server response was not confirmed. Check the connection and retry explicitly.")

class Api(val base: String, suppliedClient: HttpClient? = null) : AutoCloseable {
    val client = suppliedClient ?: HttpClient(OkHttp) {
        expectSuccess = false
        followRedirects = false
        install(HttpTimeout) { requestTimeoutMillis = 20_000; connectTimeoutMillis = 8_000; socketTimeoutMillis = 25_000 }
        install(SSE)
        engine { config { retryOnConnectionFailure(false); followRedirects(false); followSslRedirects(false) } }
    }
    suspend fun request(path: String, token: String? = null, method: String = "GET", body: String? = null): String {
        require(path.startsWith("/api/") && !path.contains("#"))
        try {
            val response = client.request(base + path) {
                this.method = HttpMethod.parse(method)
                accept(ContentType.Application.Json)
                if (token != null) bearerAuth(token)
                if (body != null) { contentType(ContentType.Application.Json); setBody(body) }
            }
            // No disk or reusable HTTP cache. A bounded current read is the only retained response.
            val channel = response.bodyAsChannel()
            val bytes = try { channel.readBuffer(2L * 1024 * 1024 + 1).readByteArray() }
                finally { channel.cancel() }
            if (bytes.size > 2 * 1024 * 1024) throw TransportFailure()
            val text = bytes.decodeToString(throwOnInvalidSequence = true)
            if (response.status.value !in 200..299) {
                val error = runCatching { WireJson.parseToJsonElement(text).jsonObject }.getOrDefault(buildJsonObject { put("message", "Request failed (${response.status.value}).") })
                throw ApiFailure(response.status.value, error)
            }
            return text
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ApiFailure) { throw failure }
        catch (_: Exception) { throw TransportFailure() }
    }
    suspend inline fun <reified T> get(path: String, token: String? = null): T = WireJson.decodeFromString(request(path, token))
    suspend fun events(token: String, onEvent: suspend (String, String?) -> Unit) {
        client.sse(urlString = base + "/api/account/events", request = { bearerAuth(token) }) {
            incoming.collect { event -> onEvent(event.event ?: "message", event.data) }
        }
    }
    override fun close() = client.close()
}
fun query(value: String): String = value.encodeURLParameter()
fun jsonBody(block: JsonObjectBuilder.() -> Unit): String = buildJsonObject(block).toString()
