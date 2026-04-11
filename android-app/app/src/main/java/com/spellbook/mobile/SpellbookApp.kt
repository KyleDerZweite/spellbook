package com.spellbook.mobile

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat

private enum class MobileTab(val label: String) {
    Search("Search"),
    Inventory("Inventory"),
    Decks("Decks"),
    Scan("Scan"),
}

@Composable
fun SpellbookApp() {
    var currentTab by remember { mutableStateOf(MobileTab.Search) }

    MaterialTheme {
        Scaffold(
            bottomBar = {
                NavigationBar {
                    MobileTab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = currentTab == tab,
                            onClick = { currentTab = tab },
                            icon = { Text(tab.label.take(1)) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            },
        ) { innerPadding ->
            when (currentTab) {
                MobileTab.Search -> PlaceholderScreen(
                    title = "MTG Search",
                    body = "Thin mobile client surface for catalog search and printing selection.",
                    innerPadding = innerPadding,
                )

                MobileTab.Inventory -> PlaceholderScreen(
                    title = "Inventory",
                    body = "Owned card ledger and quantity management will sync against the mobile API.",
                    innerPadding = innerPadding,
                )

                MobileTab.Decks -> PlaceholderScreen(
                    title = "Decks",
                    body = "Deck create/edit and owned-versus-required views will live here.",
                    innerPadding = innerPadding,
                )

                MobileTab.Scan -> ScanScreen(innerPadding = innerPadding)
            }
        }
    }
}

@Composable
private fun PlaceholderScreen(title: String, body: String, innerPadding: PaddingValues) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            verticalArrangement = Arrangement.spacedBy(12.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text(text = title, style = MaterialTheme.typography.headlineMedium)
            Text(text = body, style = MaterialTheme.typography.bodyLarge)
        }
    }
}

@Composable
private fun ScanScreen(innerPadding: PaddingValues) {
    val context = LocalContext.current
    var cameraGranted by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) ==
                PackageManager.PERMISSION_GRANTED,
        )
    }
    val cameraPermissionLauncher =
        rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
            cameraGranted = granted
        }

    LaunchedEffect(Unit) {
        if (!cameraGranted) {
            cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(innerPadding)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        Text(
            text = "Scan",
            style = MaterialTheme.typography.headlineMedium,
        )
        Text(
            text = "V1 keeps the camera UI intentionally simple. Capture is local, recognition is server-side, and review happens before any inventory mutation.",
            style = MaterialTheme.typography.bodyMedium,
        )
        if (cameraGranted) {
            CameraPreview(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
            )
        } else {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f),
                contentAlignment = Alignment.Center,
            ) {
                Text("Camera permission is required for scan capture.")
            }
        }
        Button(
            onClick = {
                if (!cameraGranted) {
                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                }
            },
        ) {
            Text(if (cameraGranted) "Camera Ready" else "Grant Camera Access")
        }
    }
}

@Composable
private fun CameraPreview(modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val previewView = remember { PreviewView(context) }

    DisposableEffect(lifecycleOwner, previewView) {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
        val executor = ContextCompat.getMainExecutor(context)
        val listener = Runnable {
            val cameraProvider = cameraProviderFuture.get()
            val preview = Preview.Builder().build().also {
                it.surfaceProvider = previewView.surfaceProvider
            }

            try {
                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(
                    lifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                )
            } catch (_: Exception) {
                // Keep the initial shell resilient; deeper error reporting comes later.
            }
        }

        cameraProviderFuture.addListener(listener, executor)
        onDispose {
            if (cameraProviderFuture.isDone) {
                cameraProviderFuture.get().unbindAll()
            }
        }
    }

    AndroidView(
        modifier = modifier,
        factory = { _: Context -> previewView },
    )
}
