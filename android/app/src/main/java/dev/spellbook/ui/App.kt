package dev.spellbook.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.navigation3.runtime.*
import androidx.navigation3.ui.NavDisplay
import dev.spellbook.feature.*
import dev.spellbook.data.*

private val roots = listOf("home", "search", "inventory", "decks")
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun SpellbookApp(model: AppModel, state: AppState) {
    val stack = rememberNavBackStack(Route("home"))
    val route = stack.last() as Route
    val keyboard = LocalSoftwareKeyboardController.current
    val back = {
        if (route.screen == "auth") model.cancelAuthentication()
        keyboard?.hide(); if (stack.size > 1) stack.removeLastOrNull(); Unit
    }
    val nav: (Route) -> Unit = { next ->
        if (stack.lastOrNull() != next) {
            keyboard?.hide()
            if (next.screen in roots && next.context.isEmpty()) stack.clear()
            stack.add(next)
        }
    }
    val root: (String) -> Unit = { screen ->
        keyboard?.hide(); stack.clear(); stack.add(Route(screen))
    }
    var navigationBackend by rememberSaveable { mutableStateOf(model.backend) }
    var navigationAccount by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(route, state.identityReady, model.backend, state.session?.user?.accountId) {
        if (state.identityReady) {
            val previous = navigationAccount?.let { AccountScope(navigationBackend, it) }
            val next = state.session?.user?.accountId?.let { AccountScope(model.backend, it) }
            val reset = resetPrivateNavigation(previous, next)
            navigationBackend = model.backend
            navigationAccount = next?.accountId
            if (reset) {
                stack.clear(); stack.add(Route("home"))
                model.navigate(Route("home"))
                return@LaunchedEffect
            }
        }
        model.navigate(route)
    }
    val navigationColors = if (MaterialTheme.colorScheme.surface.luminance() > .5f) mapOf("home" to Color(0xFF7443A5), "search" to Color(0xFF24688D), "inventory" to Color(0xFF875521), "decks" to Color(0xFF276C49)) else DestinationColors
    val focused = route.screen in setOf("add", "auth", "entry", "profile", "qr", "connect", "capture")
    val rootView = stack.size == 1 && route.screen in roots
    val title = when (route.screen) {
        "home" -> "Home"; "search" -> if (route.context == "add") "Choose a Printing" else "Search"
        "inventory", "groups" -> "Inventory"; "decks" -> "Decks"; "settings" -> "Settings"
        "printing" -> (state.data as? ScreenData.PrintingDetail)?.value?.name ?: "Printing"
        "entry" -> "Inventory entry"; "add" -> "Add to Inventory"; "auth" -> "Account"
        "deck" -> (state.data as? ScreenData.Selected)?.value?.decks?.firstOrNull()?.name ?: "Deck"
        "availability" -> "Availability"; "profile" -> "Profile"; "station" -> "Card Station"
        "connect", "qr" -> "QR sign-in"; "capture" -> "Phone capture"; else -> "About"
    }
    Scaffold(
        topBar = {
            TopAppBar(title = {
                if (route.screen == "search") {
                    var query by rememberSaveable { mutableStateOf(state.search) }
                    OutlinedTextField(query, { query = it.take(200) }, Modifier.fillMaxWidth(), placeholder = { Text("Search cards") }, singleLine = true,
                        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                        keyboardActions = KeyboardActions(onSearch = { model.search(query); keyboard?.hide() }),
                        trailingIcon = { IconAction("search", "Run Search") { model.search(query); keyboard?.hide() } })
                } else Text(title, style = MaterialTheme.typography.titleMedium, maxLines = 1)
            }, navigationIcon = { if (!rootView) IconAction("back", if (focused) "Cancel or go back" else "Back", back) },
                actions = {
                    if (route.screen == "inventory") {
                        IconAction("camera", "Phone capture") { nav(Route("capture")) }
                        IconAction("plus", "Add cards") { nav(Route("search", context = "add")) }
                    }
                    if (route.screen != "settings" && !focused) IconAction("settings", "Settings") { nav(Route("settings")) }
                })
        },
        bottomBar = {
            if (rootView || route.screen == "station") NavigationBar(containerColor = MaterialTheme.colorScheme.surface, tonalElevation = 0.dp) {
                roots.forEach { screen ->
                    NavigationBarItem(selected = route.screen == screen, onClick = { root(screen) },
                        icon = { Glyph(screen, null, navigationColors.getValue(screen)) },
                        label = { Text(screen.replaceFirstChar { it.uppercase() }, style = MaterialTheme.typography.labelSmall) },
                        colors = NavigationBarItemDefaults.colors(indicatorColor = MaterialTheme.colorScheme.surfaceContainerHigh))
                }
            }
        },
    ) { padding ->
        NavDisplay(backStack = stack, onBack = back, modifier = Modifier.padding(padding).imePadding(), entryProvider = { key ->
            val destination = key as Route
            NavEntry(key) {
                // Private form state is recreated for a different account, including restored navigation.
                key(state.session?.user?.accountId ?: "guest", destination) {
                    Destination(destination, model, state, nav, back, root)
                }
            }
        })
    }
}
@Composable private fun Destination(route: Route, model: AppModel, state: AppState, nav: (Route) -> Unit, back: () -> Unit, root: (String) -> Unit) {
    val privateScreen = route.screen in setOf("inventory", "groups", "entry", "decks", "deck", "availability", "profile", "qr")
    // Keep edited text outside the loading branch so refresh and SSE do not discard it.
    var baseline by rememberSaveable(route.id, state.formGeneration) { mutableStateOf<String?>(null) }
    var editQuantity by rememberSaveable(route.id, state.formGeneration) { mutableStateOf<String?>(null) }
    var editNotes by rememberSaveable(route.id, state.formGeneration) { mutableStateOf<String?>(null) }
    var editGroups by rememberSaveable(route.id, state.formGeneration) { mutableStateOf<List<String>?>(null) }
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.checkingSession && privateScreen) item { LinearProgressIndicator(Modifier.fillMaxWidth()); Muted("Checking your session…") }
        if (state.draft.attempt != null) item {
            val attempt = state.draft.attempt
            Surface(color = MaterialTheme.colorScheme.surfaceContainer, shape = MaterialTheme.shapes.medium) {
                Column(Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(if (attempt.confirmedReceipt != null) "Saved" else if (state.saving) "Saving…" else "Save not confirmed", style = MaterialTheme.typography.titleSmall)
                    Muted(if (attempt.confirmedReceipt != null) "The server confirmed this change. Refresh retries only the read." else "The draft and original request ID are retained. Retrying sends that same request.")
                    if (attempt.confirmedReceipt != null) Row {
                        TextButton(onClick = model::refresh) { Text("Refresh saved details") }
                        TextButton(onClick = { model.finishReceipt(); if (route.screen == "add") root("inventory") }) { Text("Done") }
                    } else Action(if (state.saving) "Saving…" else "Retry same save", state.verified && !state.saving, model::retryMutation)
                }
            }
        }
        state.writeError?.let { item { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) } }
        state.notice?.let { item { Muted(it) } }
        if (privateScreen && !state.verified) item {
            AuthGate(state, model) { nav(Route("auth")) }
        } else {
            if (state.loading) item { LinearProgressIndicator(Modifier.fillMaxWidth()) }
            if (state.error != null) item {
                Empty("Data unavailable", state.error)
                TextButton(onClick = model::refresh) { Text("Retry read") }
            }
            when (route.screen) {
                "home" -> item { HomeScreen(state, nav) }
                "search" -> item { SearchScreen(route, state, model, nav) }
                "printing" -> item { PrintingScreen(route, state, model, nav) }
                "inventory" -> item { InventoryScreen(state, model, nav) }
                "groups" -> item { GroupsScreen(state, model, nav) }
                "entry" -> item {
                    (state.data as? ScreenData.Entry)?.let { data ->
                        if (baseline == null) baseline = WireJson.encodeToString(data.value.entry)
                        val original = WireJson.decodeFromString<InventoryEntry>(baseline!!)
                        EntryScreen(data, original, state, model, editQuantity ?: original.quantity.toString(), editNotes ?: original.notes,
                            editGroups?.toSet() ?: data.value.memberships.toSet(),
                            { editQuantity = it }, { editNotes = it }, { editGroups = it.toList() },
                            { baseline = WireJson.encodeToString(data.value.entry); editQuantity = data.value.entry.quantity.toString(); editNotes = data.value.entry.notes; editGroups = data.value.memberships }, nav)
                    }
                }
                "decks" -> item { DecksScreen(state, model, nav) }
                "deck" -> item { SelectedDeckScreen(route, state, nav) }
                "availability" -> item { AvailabilityScreen(state) }
                "settings" -> item { SettingsScreen(state, model, nav) { root("home") } }
                "profile" -> item { ProfileScreen(state) }
                "add" -> item { AddScreen(state, model, nav) }
                "auth" -> item { AuthScreen(state, model, route.context == "add" || state.draft.add != null, back) }
                "station" -> item { StationScreen() }
                "capture" -> item { Empty("Camera recognition unavailable", "Phone capture and local card recognition do not have an implemented native adapter yet. Choose a Printing with Search and confirm Inventory ownership explicitly."); Action("Choose with Search") { nav(Route("search", context = "add")) } }
                "connect" -> item { ConnectScreen(nav) }
                "qr" -> item { QrScreen(state, model) }
                "about" -> item { Empty("Spellbook for Android", "Independent Kotlin and Compose client. Card artwork belongs to its respective creators. Catalog identities and artwork are supplied by the connected Spellbook API and Scryfall."); Muted("API: ${model.backend.ifEmpty { "Not configured" }}") }
            }
        }
        if (route.screen in setOf("home", "inventory", "groups", "decks", "deck", "profile") && state.verified) item {
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Muted(state.live, Modifier.weight(1f)); IconAction("refresh", "Refresh current data", model::refresh)
            }
        }
    }
}
@Composable private fun AuthGate(state: AppState, model: AppModel, login: () -> Unit) {
    Empty(if (state.session == null) "Your account" else "Sign-in needs verification", "Sign in to access your Inventory and Decks. Public Search remains available.")
    Action("Sign in", onClick = login)
    if (state.session != null) TextButton(onClick = model::validateSession) { Text("Retry session check") }
}
