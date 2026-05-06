package dev.nihildigit.tokmato.prefs

import android.content.Context
import android.content.SharedPreferences

/**
 * Single source of truth for relay app state. Backed by SharedPreferences
 * (relay-prefs.xml) — small enough that DataStore would be over-engineering.
 *
 * Excluded from cloud backup + device transfer (see backup_rules.xml) so a
 * restored device starts fresh: the previous device's FCM token is dead and
 * the pair-code was single-use anyway.
 */
class AppPrefs(ctx: Context) {
    private val sp: SharedPreferences = ctx.getSharedPreferences("relay-prefs", Context.MODE_PRIVATE)

    var bound: Boolean
        get() = sp.getBoolean(KEY_BOUND, false)
        set(value) = sp.edit().putBoolean(KEY_BOUND, value).apply()

    var userId: String?
        get() = sp.getString(KEY_USER_ID, null)
        set(value) = sp.edit().putString(KEY_USER_ID, value).apply()

    var fcmToken: String?
        get() = sp.getString(KEY_FCM_TOKEN, null)
        set(value) = sp.edit().putString(KEY_FCM_TOKEN, value).apply()

    fun clear() {
        sp.edit().clear().apply()
    }

    companion object {
        private const val KEY_BOUND = "bound"
        private const val KEY_USER_ID = "userId"
        private const val KEY_FCM_TOKEN = "fcmToken"
    }
}
