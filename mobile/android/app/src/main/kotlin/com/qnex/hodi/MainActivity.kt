package com.qnex.hodi

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.os.Bundle
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        ensureDefaultNotificationChannel()
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(
            flutterEngine.dartExecutor.binaryMessenger,
            "co.ke.kodihub.push"
        ).setMethodCallHandler { call, result ->
            when (call.method) {
                "getToken" -> {
                    val prefs = getSharedPreferences("kodihub_push", Context.MODE_PRIVATE)
                    result.success(prefs.getString("fcm_token", null))
                }
                else -> result.notImplemented()
            }
        }
    }

    private fun ensureDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
                ?: return
            val channel = NotificationChannel(
                "kodihub_default",
                "KodiHub Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Rent reminders, payment receipts, invoices, and maintenance updates"
            }
            manager.createNotificationChannel(channel)
        }
    }
}
