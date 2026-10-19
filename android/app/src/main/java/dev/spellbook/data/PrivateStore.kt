package dev.spellbook.data

import android.content.Context
import android.annotation.SuppressLint
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Credential ciphertext only; the nonexportable AES key belongs to Android Keystore. */
// Synchronous commit confirms that the frozen attempt exists before HTTP dispatch.
@SuppressLint("ApplySharedPref", "UseKtx")
class PrivateStore(context: Context, private val backend: String) {
    private val prefs = context.getSharedPreferences("spellbook.private.v1", Context.MODE_PRIVATE)
    private val namespace = MessageDigest.getInstance("SHA-256").digest(backend.toByteArray()).joinToString("") { "%02x".format(it) }
    private val sessionKey = "$namespace.session"
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        return store.getKey("spellbook.session.v1", null) as? SecretKey ?: KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder("spellbook.session.v1", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
            generateKey()
        }
    }
    fun session(): Session? = runCatching {
        val encoded = prefs.getString(sessionKey, null) ?: return null
        val bytes = Base64.decode(encoded, Base64.NO_WRAP)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, bytes.copyOfRange(0, 12)))
        cipher.updateAAD(backend.toByteArray())
        WireJson.decodeFromString<Session>(cipher.doFinal(bytes.copyOfRange(12, bytes.size)).decodeToString())
            .takeIf { it.backend == backend && it.isLive() }
    }.getOrNull()
    fun saveSession(session: Session?) {
        if (session == null) { check(prefs.edit().remove(sessionKey).commit()); return }
        require(session.backend == backend)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        cipher.updateAAD(backend.toByteArray())
        val ciphertext = cipher.iv + cipher.doFinal(WireJson.encodeToString(session).toByteArray())
        check(prefs.edit().putString(sessionKey, Base64.encodeToString(ciphertext, Base64.NO_WRAP)).commit())
    }
    fun draft(accountId: String?): DraftState {
        val raw = prefs.getString("$namespace.${accountId ?: "guest"}.draft", null) ?: return DraftState()
        if (raw.toByteArray(Charsets.UTF_8).size > 64 * 1024) return DraftState()
        return runCatching { WireJson.decodeFromString<DraftState>(raw) }.getOrDefault(DraftState())
    }
    fun saveDraft(accountId: String?, draft: DraftState) {
        val raw = WireJson.encodeToString(draft)
        require(raw.toByteArray(Charsets.UTF_8).size <= 64 * 1024)
        val draftKey = "$namespace.${accountId ?: "guest"}.draft"
        val edit = prefs.edit().putString(draftKey, raw).putLong("$draftKey.touched", System.currentTimeMillis())
        // At most four small backend/account draft slots across application updates.
        prefs.all.keys.filter { it.endsWith(".draft") && it != draftKey }
            .sortedByDescending { prefs.getLong("$it.touched", 0) }.drop(3)
            .forEach { edit.remove(it).remove("$it.touched") }
        check(edit.commit())
    }
    fun clearDraft(accountId: String?) { prefs.edit().remove("$namespace.${accountId ?: "guest"}.draft").remove("$namespace.${accountId ?: "guest"}.draft.touched").commit() }
    var appearance: String
        get() = prefs.getString("appearance", "system") ?: "system"
        set(value) { prefs.edit().putString("appearance", value).apply() }
}
