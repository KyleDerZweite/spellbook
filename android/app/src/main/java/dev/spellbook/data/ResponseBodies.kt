package dev.spellbook.data

import io.ktor.client.HttpClient
import io.ktor.client.request.prepareGet
import io.ktor.client.statement.HttpResponse
import io.ktor.client.statement.bodyAsChannel
import io.ktor.utils.io.cancel
import io.ktor.utils.io.readBuffer
import kotlinx.io.readByteArray

internal const val RESPONSE_BODY_LIMIT = 2 * 1024 * 1024
internal class ResponseBodyTooLarge : Exception("Response exceeds the 2 MiB limit.")

/** Call only inside HttpStatement.execute { }; eager request/get prebuffers before this limit. */
internal suspend fun HttpResponse.readBoundedBytes(): ByteArray {
    val channel = bodyAsChannel()
    val bytes = try { channel.readBuffer(RESPONSE_BODY_LIMIT.toLong() + 1).readByteArray() }
        finally { channel.cancel() }
    if (bytes.size > RESPONSE_BODY_LIMIT) throw ResponseBodyTooLarge()
    return bytes
}

suspend fun loadArtworkBytes(client: HttpClient, uri: String): ByteArray? =
    client.prepareGet(uri).execute { response ->
        if (response.status.value != 200) return@execute null
        try { response.readBoundedBytes() } catch (_: ResponseBodyTooLarge) { null }
    }
