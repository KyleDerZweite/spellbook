package dev.spellbook.data

import io.ktor.client.HttpClient
import io.ktor.client.HttpClientConfig
import io.ktor.client.plugins.HttpResponseValidator
import io.ktor.client.plugins.sse.SSEClientException
import io.ktor.util.AttributeKey
import io.ktor.client.engine.okhttp.OkHttp
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.sse.SSE
import io.ktor.client.plugins.sse.sse
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.http.*
import io.ktor.utils.io.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.cancel
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
        guardSavedStateResponses()
        engine { config { retryOnConnectionFailure(false); followRedirects(false); followSslRedirects(false) } }
    }
    suspend fun request(path: String, token: String? = null, method: String = "GET", body: String? = null): String {
        require(path.startsWith("/api/") && !path.contains("#"))
        try {
            return client.prepareRequest(base + path) {
                this.method = HttpMethod.parse(method)
                accept(ContentType.Application.Json)
                if (token != null) bearerAuth(token)
                if (body != null) { contentType(ContentType.Application.Json); setBody(body) }
            }.execute { response ->
                // Streaming scope prevents Ktor SavedCall from eagerly buffering the whole response.
                val text = response.readBoundedBytes().decodeToString(throwOnInvalidSequence = true)
                if (response.status.value !in 200..299) {
                    val error = runCatching { WireJson.parseToJsonElement(text).jsonObject }.getOrDefault(buildJsonObject { put("message", "Request failed (${response.status.value}).") })
                    throw ApiFailure(response.status.value, error)
                }
                text
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: ApiFailure) { throw failure }
        catch (_: Exception) { throw TransportFailure() }
    }
    suspend inline fun <reified T> get(path: String, token: String? = null): T = WireJson.decodeFromString(request(path, token))
    suspend fun events(token: String, onEvent: suspend (String, String?) -> Unit) {
        try {
            client.sse(urlString = base + "/api/account/events", request = {
                bearerAuth(token)
                attributes.put(SavedStateRequest, Unit)
            }) {
                incoming.collect { event -> onEvent(event.event ?: "message", event.data) }
            }
        } catch (cancelled: CancellationException) { throw cancelled }
        catch (failure: SSEClientException) {
            (failure.cause as? CancellationException)?.let { throw it }
            (failure.cause as? ApiFailure)?.let { throw it }
            if (failure.response?.status == HttpStatusCode.Unauthorized) {
                throw ApiFailure(401, buildJsonObject { put("message", "Authentication required.") })
            }
            throw failure
        }
    }

    override fun close() = client.close()
}
fun query(value: String): String = value.encodeURLParameter()
fun jsonBody(block: JsonObjectBuilder.() -> Unit): String = buildJsonObject(block).toString()

private val SavedStateRequest = AttributeKey<Unit>("SpellbookSavedState")

/** SSE's own non-200 handler calls saved(). Reject before that transform can buffer error bodies. */
internal fun HttpClientConfig<*>.guardSavedStateResponses() {
    HttpResponseValidator {
        validateResponse { response ->
            if (!response.request.attributes.contains(SavedStateRequest)) return@validateResponse
            if (response.status.value !in setOf(200, 204)) {
                response.cancel()
                throw ApiFailure(response.status.value, buildJsonObject {
                    put("message", if (response.status.value == 401) "Authentication required." else "Saved changes are unavailable.")
                })
            }
        }
    }
}
