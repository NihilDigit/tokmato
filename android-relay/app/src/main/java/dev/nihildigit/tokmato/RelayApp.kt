package dev.nihildigit.tokmato

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dev.nihildigit.tokmato.push.NOTIFICATION_CHANNEL_ID

class RelayApp : Application() {
    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            val ch = NotificationChannel(
                NOTIFICATION_CHANNEL_ID,
                "tokmato",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "番茄完成 / buffer 结束 / 娱乐时间结束"
                enableLights(true)
                enableVibration(true)
            }
            mgr.createNotificationChannel(ch)
        }
    }
}
