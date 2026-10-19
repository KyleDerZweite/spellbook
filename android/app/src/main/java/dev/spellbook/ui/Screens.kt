package dev.spellbook.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.Alignment
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.input.*
import androidx.compose.ui.unit.dp
import dev.spellbook.data.*
import dev.spellbook.feature.*
import kotlinx.serialization.json.*
import kotlin.math.cos
import kotlin.math.sin

@Composable private fun Section(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(title, style = MaterialTheme.typography.titleSmall, modifier = Modifier.padding(top = 16.dp))
        content()
    }
}
@Composable fun HomeScreen(state: AppState, nav: (Route) -> Unit) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (!state.verified) {
            Empty("Your cards, together", "Search the public Catalog, choose a Printing and prepare an Inventory draft. Sign in when you want to save it.")
            LinkRow("Search Catalog", "Public cards and Printings") { nav(Route("search")) }
            LinkRow("Sign in or create an account") { nav(Route("auth")) }
        }
        (state.data as? ScreenData.Home)?.value?.let { value ->
            Muted("${value.totals.total} copies · ${value.totals.names} card names · ${value.totals.decks} Decks")
            LinkRow("Open Inventory", "Your cards and Boxes") { nav(Route("inventory")) }
            value.decks.take(5).forEach { deck ->
                LinkRow(deck.name, "${deck.required} required · ${deck.format} · ${deck.missing} missing") { nav(Route("deck", deck.id)) }
            }
            Section("Recently updated") {
                if (value.recentEntries.isEmpty()) Empty("No Inventory entries", "Use the small plus action in Inventory to add an owned Printing.")
                value.recentEntries.take(10).forEach { entry -> CardRow(entry.name, "${entry.setCode.uppercase()} · ${entry.finish} · ${entry.condition}", entry.imageUri, entry.quantity) { nav(Route("entry", entry.id)) } }
            }
            value.valuationError?.let { Muted("Market value is currently unavailable. Your Inventory counts remain separate.") }
        }
        LinkRow("Card Station", "Connection and planned box layout") { nav(Route("station")) }
    }
}
@OptIn(ExperimentalLayoutApi::class)
@Composable fun SearchScreen(route: Route, state: AppState, model: AppModel, nav: (Route) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            listOf("" to "All", "W" to "White", "U" to "Blue", "B" to "Black", "R" to "Red", "G" to "Green", "C" to "Colorless").forEach { (value, label) ->
                FilterChip(selected = state.color == value, onClick = { model.search(state.search, value) }, label = { Text(label) })
            }
        }
        (state.data as? ScreenData.Search)?.value?.let { result ->
            Muted("${result.estimatedTotalHits} Catalog matches")
            if (result.hits.isEmpty()) Empty("No matches", "Try another card name or remove the color filter.")
            result.hits.forEach { card -> CardRow(card.name, "${card.type_line}\n${card.set_code.uppercase()} · ${card.collector_number} · ${card.lang.uppercase()}", card.image_uri_small.ifEmpty { card.image_uri }) { nav(Route("printing", card.id, route.context)) } }
            Pages(state.offset, 30, state.offset + result.hits.size < result.estimatedTotalHits) { model.search(state.search, offset = it) }
        }
    }
}
@Composable fun PrintingScreen(route: Route, state: AppState, model: AppModel, nav: (Route) -> Unit) {
    val data = state.data as? ScreenData.PrintingDetail ?: return
    val card = data.value
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Artwork(card.image_uri, card.name, Modifier.fillMaxWidth().height(300.dp))
        Text(card.name, style = MaterialTheme.typography.titleLarge)
        Muted("${card.set_name} · ${card.set_code.uppercase()} ${card.collector_number} · ${card.lang.uppercase()}")
        Text(card.mana_cost + "\n" + card.type_line, style = MaterialTheme.typography.bodyMedium)
        Text(card.oracle_text, style = MaterialTheme.typography.bodyMedium)
        if (card.is_foil_available || card.is_nonfoil_available) Action(if (route.context == "add") "Use this Printing" else "Prepare Inventory add") {
            model.prepareAdd(card); nav(Route("add"))
        } else Muted("This Printing has no supported Inventory finish.")
        Section("Other Printings") {
            if (data.printings.hits.isEmpty()) Muted("No other Printings in this Catalog.")
            data.printings.hits.forEach { printing ->
                CardRow(printing.name, "${printing.set_code.uppercase()} · ${printing.collector_number} · ${printing.lang.uppercase()}", printing.image_uri_small) {
                    nav(Route("printing", printing.id, route.context))
                }
            }
            if (data.printings.estimatedTotalHits > data.printings.hits.size) Muted("Showing the first ${data.printings.hits.size} Printings. Search the Catalog to narrow the result.")
        }
    }
}
@Composable fun InventoryScreen(state: AppState, model: AppModel, nav: (Route) -> Unit) {
    var text by rememberSaveable { mutableStateOf(state.inventoryQuery) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilledTonalButton(onClick = { model.inventory(group = "") }, shape = RoundedCornerShape(10.dp)) { Text("Cards") }
            FilledTonalButton(onClick = { model.inventory(offset = 0); nav(Route("groups")) }, shape = RoundedCornerShape(10.dp)) { Text("Boxes") }
        }
        SearchInput(text, "Find owned cards", { text = it }) { model.inventory(text) }
        if (state.inventoryGroup.isNotEmpty()) TextButton(onClick = { model.inventory(group = "") }) { Text("Clear Box filter") }
        (state.data as? ScreenData.Inventory)?.value?.let { page ->
            Muted("${page.matching.copyCount} matching copies · ${page.totals.copyCount} total copies · ${page.totals.canonicalCardCount} card names")
            if (page.entries.isEmpty()) {
                if (page.totals.entryCount == 0L) Empty("No Inventory entries", "Use + to choose a Printing and explicitly save owned copies.")
                else Empty("No matching entries", "Clear the search or Box filter to see other owned cards.")
            }
            page.entries.forEach { entry -> CardRow(entry.name, "${entry.setCode.uppercase()} · ${entry.finish} · ${entry.condition}", entry.imageUri, entry.quantity) { nav(Route("entry", entry.id)) } }
            Pages(state.inventoryOffset, 40, state.inventoryOffset + page.entries.size < page.matching.entryCount) { model.inventory(offset = it) }
        }
    }
}
@Composable fun GroupsScreen(state: AppState, model: AppModel, nav: (Route) -> Unit) {
    var name by rememberSaveable { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Muted("Boxes select whole Inventory entries. They do not allocate physical copies.")
        (state.data as? ScreenData.Groups)?.value?.let { page ->
            if (page.groups.isEmpty()) Empty("No Boxes", "Create a Box and assign entries from their detail screen.")
            page.groups.forEach { group -> LinkRow(group.name, "${group.entryCount} entries · ${group.quantity} copies") {
                model.inventory(group = group.id); nav(Route("inventory", context = group.id))
            } }
            Pages(state.inventoryOffset, 40, state.inventoryOffset + page.groups.size < page.count) { model.inventory(offset = it) }
        }
        OutlinedTextField(name, { name = it.take(200) }, Modifier.fillMaxWidth(), label = { Text("New Box name") }, singleLine = true)
        Action("Create Box", name.isNotBlank() && !state.saving && state.draft.attempt == null) { model.createGroup(name) }
    }
}
@Composable fun EntryScreen(data: ScreenData.Entry, original: InventoryEntry, state: AppState, model: AppModel, quantity: String, notes: String, groups: Set<String>, onQuantity: (String) -> Unit, onNotes: (String) -> Unit, onGroups: (Set<String>) -> Unit, useSaved: () -> Unit, nav: (Route) -> Unit) {
    val entry = data.value.entry
    var confirmRemoval by remember { mutableStateOf(false) }
    val editable = !state.saving && state.draft.attempt == null
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        CardRow(entry.name, "${entry.setCode.uppercase()} · ${entry.finish} · ${entry.condition}", entry.imageUri, entry.quantity) { nav(Route("printing", entry.catalogCardId)) }
        Muted("Printing, Finish and Condition identify this entry and remain fixed.")
        OutlinedTextField(quantity, { onQuantity(it.take(10)) }, Modifier.fillMaxWidth(), enabled = editable, label = { Text("Quantity") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        OutlinedTextField(notes, { onNotes(it.take(4000)) }, Modifier.fillMaxWidth(), enabled = editable, label = { Text("Notes") }, minLines = 3)
        Action("Save Quantity and Notes", editable) { model.patchEntry(original, quantity, notes) }
        TextButton(onClick = useSaved, enabled = editable) { Text("Use current saved values") }
        Section("Boxes") {
            if (data.groups.groups.isEmpty()) Muted("Create a Box in Inventory first.")
            data.groups.groups.forEach { group ->
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(group.id in groups, onCheckedChange = { checked -> onGroups(if (checked) groups + group.id else groups - group.id) }, enabled = editable)
                    Text(group.name)
                }
            }
            if (data.groups.count > data.groups.groups.size) Muted("Only the first ${data.groups.groups.size} Boxes are shown. Existing memberships outside this page are preserved.")
            Action("Save Box membership", editable) { model.saveGroups(entry.id, groups) }
        }
        TextButton(onClick = { confirmRemoval = true }, enabled = editable) { Text("Remove entry", color = MaterialTheme.colorScheme.error) }
    }
    if (confirmRemoval) AlertDialog(onDismissRequest = { confirmRemoval = false }, title = { Text("Remove owned copies?") }, text = { Text("Remove the reviewed ${entry.quantity} copies of ${entry.name}? A changed saved quantity requires another review.") },
        confirmButton = { TextButton(onClick = { confirmRemoval = false; model.removeEntry(entry) }) { Text("Remove ${entry.quantity} copies") } }, dismissButton = { TextButton(onClick = { confirmRemoval = false }) { Text("Cancel") } })
}
@Composable fun DecksScreen(state: AppState, model: AppModel, nav: (Route) -> Unit) {
    var text by rememberSaveable { mutableStateOf(state.deckQuery) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        SearchInput(text, "Find Decks", { text = it }) { model.decks(text) }
        (state.data as? ScreenData.Decks)?.value?.let { page ->
            Muted("${page.matchingTotal} matching · ${page.globalTotal} Decks")
            if (page.items.isEmpty()) Empty("No Decks", "This library shows Deck requirements saved in your account.")
            page.items.forEach { deck -> CardRow(deck.name, "${deck.format} · ${deck.quantity} required", deck.imageUri) { nav(Route("deck", deck.id)) } }
            Pages(state.deckOffset, 30, state.deckOffset + page.items.size < page.matchingTotal) { model.decks(offset = it) }
        }
    }
}
@Composable fun SelectedDeckScreen(route: Route, state: AppState, nav: (Route) -> Unit) {
    var offset by rememberSaveable(route.id) { mutableIntStateOf(0) }
    val selected = (state.data as? ScreenData.Selected)?.value ?: return
    val deck = selected.decks.firstOrNull { it.id == route.id } ?: return
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Muted(deck.format)
        if (deck.description.isNotEmpty()) Text(deck.description, style = MaterialTheme.typography.bodyMedium)
        LinkRow("Availability", "Exact, alternate and missing owned copies") { nav(Route("availability", deck.id)) }
        Muted("Deck requirements do not reserve or add owned copies.")
        if (selected.deckCards.isEmpty()) Empty("No Deck entries", "The selected Deck has no saved card requirements.")
        selected.deckCards.drop(offset).take(40).forEach { card ->
            val available = selected.availability[card.id]
            CardRow(card.name, "${card.role} · ${card.setCode.uppercase()}" + if (available != null) "\n${available.exact} exact · ${available.alternate} alternate · ${available.missing} missing" else "", card.imageUri, card.quantity) { nav(Route("printing", card.catalogCardId)) }
        }
        Pages(offset, 40, offset + 40 < selected.deckCards.size) { offset = it }
    }
}
@Composable fun AvailabilityScreen(state: AppState) {
    val value = (state.data as? ScreenData.Available)?.value ?: return
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text("${value.totals.required} required copies", style = MaterialTheme.typography.titleMedium)
        Text("${value.totals.exact} exact · ${value.totals.alternate} alternate · ${value.totals.missing} missing")
        Muted("The API allocates exact Printing matches before alternate Printings of the same canonical card. This comparison does not reserve physical cards.")
        value.entries.forEachIndexed { index, entry ->
            Text("Entry ${index + 1}: ${entry.required} required", style = MaterialTheme.typography.bodyMedium)
            Muted("${entry.exact} exact · ${entry.alternate} alternate · ${entry.missing} missing")
        }
    }
}
@OptIn(ExperimentalLayoutApi::class)
@Composable fun AddScreen(state: AppState, model: AppModel, nav: (Route) -> Unit) {
    val draft = state.draft.add
    if (draft == null) { Empty("Choose a Printing", "Use Search to prepare one Inventory add."); Action("Search Catalog") { nav(Route("search", context = "add")) }; return }
    val editable = state.draft.attempt == null && !state.saving
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        CardRow(draft.printing.name, "${draft.printing.set_code.uppercase()} · ${draft.printing.collector_number} · ${draft.printing.lang.uppercase()}", draft.printing.image_uri_small) { nav(Route("printing", draft.printing.id, "add")) }
        OutlinedTextField(draft.quantity, { model.editAdd(draft.copy(quantity = it)) }, Modifier.fillMaxWidth(), label = { Text("Owned Quantity") }, enabled = editable, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number))
        Text("Finish", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("nonfoil" to draft.printing.is_nonfoil_available, "foil" to draft.printing.is_foil_available).filter { it.second }.forEach { (finish, _) ->
                FilterChip(draft.finish == finish, onClick = { model.editAdd(draft.copy(finish = finish)) }, label = { Text(finish) }, enabled = editable)
            }
        }
        Text("Condition", style = MaterialTheme.typography.labelLarge)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("NM", "LP", "MP", "HP", "DMG").forEach { condition -> FilterChip(draft.condition == condition, { model.editAdd(draft.copy(condition = condition)) }, label = { Text(condition) }, enabled = editable) }
        }
        if (!state.verified) {
            Muted("This draft is unsaved. Sign in or register, review the same draft, then choose Save explicitly.")
            Action("Sign in to continue") { nav(Route("auth", context = "add")) }
        } else {
            Muted("Save adds these owned copies to ${state.session?.user?.username}'s Inventory. Signing in does not save the draft.")
            Action("Save to Inventory", editable, model::saveAdd)
        }
    }
}
@Composable fun AuthScreen(state: AppState, model: AppModel, carryDraft: Boolean, success: () -> Unit) {
    var username by rememberSaveable { mutableStateOf("") }
    // Password stays only in this composition and is never in saved state or preferences.
    var password by remember { mutableStateOf("") }
    var register by rememberSaveable { mutableStateOf(false) }
    val keyboard = LocalSoftwareKeyboardController.current
    val submit = { keyboard?.hide(); model.authenticate(register, username, password, carryDraft) { password = ""; success() } }
    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
        Text(if (register) "Create an account" else "Sign in", style = MaterialTheme.typography.titleLarge)
        if (carryDraft) Muted("Return to your unsaved Inventory draft after signing in. Save remains a separate action.")
        OutlinedTextField(username, { username = it.take(32) }, Modifier.fillMaxWidth(), label = { Text("Username") }, singleLine = true,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Next), enabled = !state.authenticating)
        OutlinedTextField(password, { password = it.take(128) }, Modifier.fillMaxWidth(), label = { Text("Password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (!state.authenticating && username.isNotBlank() && password.isNotEmpty()) submit() }), enabled = !state.authenticating)
        if (register) Muted("Username: 3 to 32 letters, digits, underscores or hyphens. Password: 12 to 128 characters.")
        state.authError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Action(if (state.authenticating) "Please wait…" else if (register) "Register" else "Sign in", !state.authenticating && username.isNotBlank() && password.isNotEmpty(), submit)
        TextButton(onClick = { register = !register }, enabled = !state.authenticating) { Text(if (register) "Use an existing account" else "Create an account") }
    }
}
@Composable fun SettingsScreen(state: AppState, model: AppModel, nav: (Route) -> Unit, loggedOut: () -> Unit) {
    var confirm by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.session != null) {
            LinkRow(state.session.user.username, "Profile and account totals") { nav(Route("profile")) }
            LinkRow("Sign out", "Revoke this account session") { confirm = true }
            if (!state.verified || state.error != null) TextButton(onClick = { model.logout(forgetOnly = true, onSuccess = loggedOut) }) { Text("Remove local sign-in only") }
        } else LinkRow("Sign in or register") { nav(Route("auth")) }
        Section("Appearance") {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("system", "light", "dark").forEach { value -> FilterChip(state.appearance == value, { model.appearance(value) }, label = { Text(value.replaceFirstChar { it.uppercase() }) }) }
            }
        }
        LinkRow("QR sign-in", "Review a request and approve or deny explicitly") { nav(Route("connect")) }
        LinkRow("Card Station", "Device connection unavailable") { nav(Route("station")) }
        LinkRow("About") { nav(Route("about")) }
        Muted("API: ${model.backend.ifEmpty { "Not configured" }}")
    }
    if (confirm) AlertDialog(onDismissRequest = { confirm = false }, title = { Text("Sign out?") }, text = { Text("This clears this account's local drafts and private reads. The server revokes the current session.") }, confirmButton = { TextButton(onClick = { confirm = false; model.logout(onSuccess = loggedOut) }) { Text("Sign out") } }, dismissButton = { TextButton(onClick = { confirm = false }) { Text("Cancel") } })
}
@Composable fun ProfileScreen(state: AppState) {
    val profile = (state.data as? ScreenData.Account)?.value ?: return
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(profile.user.username, style = MaterialTheme.typography.titleLarge)
        Text(profile.user.email.ifEmpty { "No contact email saved" })
        val name = profile.card["name"]?.jsonPrimitive?.contentOrNull
        name?.let { Text(it, style = MaterialTheme.typography.titleMedium) }
        profile.card["typeLine"]?.jsonPrimitive?.contentOrNull?.let { Muted(it) }
        profile.card["rulesText"]?.jsonPrimitive?.contentOrNull?.let { Text(resolveProfileText(it, profile.totals)) }
        profile.totals?.let { Muted("${it.total} copies · ${it.names} card names · ${it.printings} Printings\n${it.sets} sets · ${it.foils} foils · ${it.decks} Decks") }
        profile.statsError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Muted("Session expiry: ${state.session?.expiresAt.orEmpty()}")
    }
}
@Composable fun StationScreen() {
    val color = MaterialTheme.colorScheme.outline
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Not connected", style = MaterialTheme.typography.titleMedium)
        Muted("No device connection is available. Device registry, jobs, telemetry and physical box allocation are not implemented.")
        Box(Modifier.fillMaxWidth().aspectRatio(1f), contentAlignment = Alignment.Center) {
            Canvas(Modifier.fillMaxSize().padding(18.dp)) {
                val box = size.minDimension * .18f
                val radius = size.minDimension * .37f
                repeat(8) { index ->
                    val angle = -Math.PI / 2 + index * Math.PI / 4
                    val center = Offset(size.width / 2 + cos(angle).toFloat() * radius, size.height / 2 + sin(angle).toFloat() * radius)
                    drawRoundRect(color, center - Offset(box / 2, box / 2), Size(box, box), cornerRadius = androidx.compose.ui.geometry.CornerRadius(8.dp.toPx()), style = Stroke(1.dp.toPx()))
                }
            }
            Column(horizontalAlignment = Alignment.CenterHorizontally) { Text("Input"); Muted("No observation") }
        }
        Muted("Design representation: eight box positions around a central input stack. No device name, ID, contents or activity has been reported.")
    }
}
@Composable fun ConnectScreen(nav: (Route) -> Unit) {
    var code by rememberSaveable { mutableStateOf("") }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Muted("Enter the public request code from the same Spellbook website. Native camera QR decoding is unavailable. This authorizes an ordinary account session, not device enrollment.")
        OutlinedTextField(code, { code = it.take(100) }, Modifier.fillMaxWidth(), label = { Text("Request code") }, singleLine = true)
        Action("Inspect request", code.matches(Regex("[A-Za-z0-9_-]{43}"))) { nav(Route("qr", code)) }
    }
}
@Composable fun QrScreen(state: AppState, model: AppModel) {
    val request = (state.data as? ScreenData.Qr)?.value ?: return
    var confirmed by remember(request.code, state.session?.user?.accountId) { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Review sign-in request", style = MaterialTheme.typography.titleMedium)
        Text("Account: ${state.session?.user?.username}")
        Muted("API: ${model.backend}\nRequest: ${request.code.take(12)}\nKind: ${request.kind}\nStatus: ${request.status}\nExpires: ${request.expiresAt}")
        Text("Approve only if you initiated this request on a device you trust.")
        Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(confirmed, { confirmed = it }); Text("I reviewed this account and request") }
        Action("Approve sign-in", confirmed && request.status == "pending") { confirmed = false; model.decideQr(request.code, "approve") }
        TextButton(onClick = { model.decideQr(request.code, "deny") }, enabled = request.status == "pending") { Text("Deny") }
    }
}
@Composable private fun SearchInput(value: String, label: String, change: (String) -> Unit, submit: () -> Unit) {
    val keyboard = LocalSoftwareKeyboardController.current
    OutlinedTextField(value, change, Modifier.fillMaxWidth(), placeholder = { Text(label) }, singleLine = true,
        keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search), keyboardActions = KeyboardActions(onSearch = { submit(); keyboard?.hide() }),
        trailingIcon = { IconAction("search", label) { submit(); keyboard?.hide() } })
}
