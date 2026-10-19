package dev.spellbook.ui

import android.graphics.BitmapFactory
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.*
import androidx.compose.ui.graphics.vector.*
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.spellbook.data.*
import io.ktor.client.*
import io.ktor.client.engine.okhttp.*
import io.ktor.client.plugins.*
import io.ktor.client.request.*
import io.ktor.client.statement.*
import io.ktor.utils.io.*
import kotlinx.coroutines.*
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withPermit
import kotlinx.io.readByteArray
import java.net.URI
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle

val DestinationColors = mapOf("home" to Color(0xFFBCA3EE), "search" to Color(0xFF8BC4E3), "inventory" to Color(0xFFD4AB7D), "decks" to Color(0xFF8FC9AA))
private val paths = mapOf(
    "home" to "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
    "search" to "M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0",
    "inventory" to "M4 4h16v16H4zM4 10h16M10 10v10",
    "decks" to "m12 3 9 5-9 5-9-5 9-5zM3 12l9 5 9-5M3 16l9 5 9-5",
    "settings" to "M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
    "plus" to "M12 4v16M4 12h16",
    "back" to "M19 12H5M12 5l-7 7 7 7",
    "camera" to "M3 6h5l2-3h4l2 3h5v15H3zM16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
    "refresh" to "M20 4v6h-6M20 10a8 8 0 1 0 0 6",
    "chevron" to "M9 6l6 6-6 6",
)
@Composable fun Glyph(name: String, description: String?, tint: Color = LocalContentColor.current) {
    val vector = remember(name) {
        ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f).apply {
            addPath(PathParser().parsePathString(paths[name] ?: paths.getValue("inventory")).toNodes(), fill = null, stroke = SolidColor(Color.Black), strokeLineWidth = 1.5f, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round)
        }.build()
    }
    Icon(vector, contentDescription = description, tint = tint, modifier = Modifier.size(22.dp))
}
@Composable fun IconAction(icon: String, label: String, action: () -> Unit) {
    IconButton(onClick = action, modifier = Modifier.size(48.dp)) { Glyph(icon, label) }
}
@Composable fun Muted(text: String, modifier: Modifier = Modifier) {
    Text(text, modifier, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
}
@Composable fun LinkRow(title: String, subtitle: String = "", onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 14.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f)) { Text(title, style = MaterialTheme.typography.bodyLarge); if (subtitle.isNotEmpty()) Muted(subtitle) }
        Glyph("chevron", null)
    }
}
@Composable fun CardRow(name: String, metadata: String, image: String, quantity: Long? = null, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(vertical = 7.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Artwork(image, name, Modifier.width(42.dp).height(58.dp), maxPixels = 192)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(name, maxLines = 2, overflow = TextOverflow.Ellipsis, style = MaterialTheme.typography.bodyMedium)
            Muted(metadata)
        }
        quantity?.let { Text("${it}×", style = MaterialTheme.typography.bodyMedium) }
    }
}
@Composable fun Action(label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Button(onClick, Modifier.fillMaxWidth().heightIn(min = 48.dp), enabled = enabled, shape = RoundedCornerShape(10.dp)) { Text(label) }
}
@Composable fun Empty(title: String, detail: String) {
    Column(Modifier.fillMaxWidth().padding(vertical = 28.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(title, style = MaterialTheme.typography.titleMedium); Muted(detail)
    }
}
@Composable fun Pages(offset: Int, size: Int, hasNext: Boolean, onPage: (Int) -> Unit) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { onPage(maxOf(0, offset - size)) }, enabled = offset > 0) { Text("Previous") }
        Muted("Page ${offset / size + 1}")
        TextButton(onClick = { onPage(offset + size) }, enabled = hasNext) { Text("Next") }
    }
}
private object Art {
    val permits = Semaphore(4)
    val client = HttpClient(OkHttp) {
        followRedirects = false
        install(HttpTimeout) { requestTimeoutMillis = 15_000; connectTimeoutMillis = 5_000 }
        engine { config { retryOnConnectionFailure(false) } }
    }
}
/** Image bytes never enter a persistent cache; at most four bounded decodes run together. */
@Composable fun Artwork(uri: String, name: String, modifier: Modifier, maxPixels: Int = 800) {
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    val bitmap by produceState<ImageBitmap?>(null, uri, lifecycle, maxPixels) {
        lifecycle.repeatOnLifecycle(Lifecycle.State.STARTED) {
        value = null
        if (runCatching { URI(uri).scheme == "https" }.getOrDefault(false)) {
            try {
                value = withContext(Dispatchers.IO) {
                    Art.permits.withPermit {
                        val response = Art.client.get(uri)
                        if (response.status.value != 200) return@withPermit null
                        val channel = response.bodyAsChannel()
                        val bytes = try { channel.readBuffer(2 * 1024 * 1024L + 1).readByteArray() }
                            finally { channel.cancel() }
                        if (bytes.size > 2 * 1024 * 1024) return@withPermit null
                        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
                        if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || bounds.outWidth > 10000 || bounds.outHeight > 10000) return@withPermit null
                        var sample = 1
                        while (maxOf(bounds.outWidth, bounds.outHeight) / sample > maxPixels) sample *= 2
                        val options = BitmapFactory.Options().apply { inSampleSize = sample }
                        BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options)?.asImageBitmap()
                    }
                }
            } catch (cancelled: CancellationException) { throw cancelled }
            catch (_: Exception) { value = null }
        }
        }
    }
    Box(modifier.clip(RoundedCornerShape(3.dp)).background(MaterialTheme.colorScheme.surfaceContainer), contentAlignment = Alignment.Center) {
        bitmap?.let { Image(it, contentDescription = name, Modifier.fillMaxSize(), contentScale = ContentScale.Fit) }
            ?: Glyph("inventory", "Artwork unavailable")
    }
}
