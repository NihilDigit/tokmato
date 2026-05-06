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
 * Server lib/fcm.ts ships push payloads as:
 *   notification: { title, body }     // for tray rendering when app is killed
 *   data: { url? }                    // deep-link target for click handling
 *   android: { priority: "high" }     // Doze-bypass
 *
 * We bypass Firebase's auto-display path by reading the payload ourselves,
 * because that lets us attach the click PendingIntent. Without our own
 * NotificationCompat build, the click would just open MainActivity which is
 * not what we want — the relay app is the relay, not the destination.
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

        val mgr = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        mgr.notify(message.messageId?.hashCode() ?: System.currentTimeMillis().toInt(), notif)
    }
}
