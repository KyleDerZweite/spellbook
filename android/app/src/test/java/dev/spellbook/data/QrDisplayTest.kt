package dev.spellbook.data

import org.junit.Assert.*
import org.junit.Test

class QrDisplayTest {
    @Test fun `display code groups the first eight characters and preserves case`() {
        assertEquals("AbCd-_-12", qrDisplayCode("AbCd_-12xyzREST" + "a".repeat(28)))
        assertEquals("Zz9--QqWw", qrDisplayCode("Zz9-QqWwEe"))
    }

    @Test fun `request time precedes expiry by the five minute lifetime`() {
        assertEquals(java.time.Instant.parse("2026-11-22T10:00:00Z"), qrRequestedAt("2026-11-22T10:05:00.000Z"))
        assertNull(qrRequestedAt("not a timestamp"))
    }

    @Test fun `device fields decode and browser requests omit them`() {
        val device = WireJson.decodeFromString<QrRequest>("""{"code":"c","kind":"device","status":"pending","expiresAt":"e","deviceName":"Station","deviceType":"cardstation"}""")
        assertEquals("Station", device.deviceName)
        assertEquals("cardstation", device.deviceType)
        assertNull(WireJson.decodeFromString<QrRequest>("""{"code":"c","kind":"browser","status":"pending","expiresAt":"e"}""").deviceName)
    }
}
