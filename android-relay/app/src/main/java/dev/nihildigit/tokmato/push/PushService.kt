package dev.nihildigit.tokmato.push

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dev.nihildigit.tokmato.R
import dev.nihildigit.tokmato.net.RelayApi
import dev.nihildigit.tokmato.prefs.AppPrefs
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

const val NOTIFICATION_CHANNEL_ID = "tokmato-default"
private const val DEFAULT_OPEN_URL = "https://tokmato.nihildigit.dev/home"

/**
 * Receives FCM messages and renders them as system notifications.
 *
 * Server lib/fcm.ts ships data-only payloads:
 *   data: { title, body, url, tag }
 *   android: { priority: "high" }   // Doze-bypass
 *
 * Data-only is required so onMessageReceived always fires (a payload
 * with a `notification` block makes Firebase auto-render and ignore
 * any PendingIntent we'd want to attach). The tradeoff: if the user
 * has force-stopped the app, the message won't render at all — the
 * messaging service can't be woken from a stopped state. Our flow
 * doesn't depend on running across force-stop.
 */
class PushService : FirebaseMessagingService() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val prefs = AppPrefs(this)
        prefs.fcmToken = token
        val userId = prefs.userId
        if (prefs.bound && userId != null) {
            scope.launch {
                when (RelayApi.rotateFcmToken(userId, token)) {
                    is RelayApi.RotateResult.RebindRequired -> {
                        prefs.clear()
                    }

                    else -> Unit
                }
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val title = message.notification?.title ?: message.data["title"] ?: "tokmato"
        val body = message.notification?.body ?: message.data["body"].orEmpty()
        val url = message.data["url"] ?: DEFAULT_OPEN_URL
        val tag = message.data["tag"] ?: "tokmato"

        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val pending = PendingIntent.getActivity(
            this,
            url.hashCode(),
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )

        val notif = NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build()

        // Notification id keyed off `tag`, not message id: a fresh
        // running-end push *replaces* the prior pomodoro entry instead
        // of stacking. play-end uses a separate tag so it doesn't
        // collide with running/buffer ones.
        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        mgr.notify(tag.hashCode(), notif)
    }
}
