package dev.spellbook

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.activity.viewModels
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.graphics.Color
import androidx.lifecycle.compose.LifecycleStartEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.spellbook.feature.AppModel
import dev.spellbook.ui.SpellbookApp

class MainActivity : ComponentActivity() {
    private val model: AppModel by viewModels()
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val state by model.state.collectAsStateWithLifecycle()
            LifecycleStartEffect(model) {
                model.foreground(true)
                onStopOrDispose { model.foreground(false) }
            }
            val dark = when (state.appearance) { "dark" -> true; "light" -> false; else -> isSystemInDarkTheme() }
            LaunchedEffect(dark) {
                val transparent = android.graphics.Color.TRANSPARENT
                val bars = if (dark) SystemBarStyle.dark(transparent) else SystemBarStyle.light(transparent, transparent)
                enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
            }
            val scheme = if (dark) darkColorScheme(
                primary = Color(0xFFE5E5E5), onPrimary = Color(0xFF101010),
                background = Color(0xFF101010), surface = Color(0xFF101010),
                surfaceContainer = Color(0xFF1C1C1C), surfaceContainerHigh = Color(0xFF262626),
                onSurface = Color(0xFFE5E5E5), onSurfaceVariant = Color(0xFFA3A3A3),
            ) else lightColorScheme(
                primary = Color(0xFF222222), onPrimary = Color.White,
                background = Color(0xFFFAFAFA), surface = Color(0xFFFAFAFA),
                surfaceContainer = Color(0xFFF0F0F0), surfaceContainerHigh = Color(0xFFE5E5E5),
                onSurface = Color(0xFF171717), onSurfaceVariant = Color(0xFF606060),
            )
            MaterialTheme(colorScheme = scheme) { SpellbookApp(model, state) }
        }
    }
}
