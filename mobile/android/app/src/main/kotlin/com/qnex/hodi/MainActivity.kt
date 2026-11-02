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
            val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            when (call.method) {
                "getToken" -> {
                    val cached = prefs.getString(KEY_FCM_TOKEN, null)
                    if (!cached.isNullOrBlank()) {
                        result.success(cached)
                    } else {
                        fetchFcmTokenIfAvailable(this) { token ->
                            result.success(token)
                        }
                    }
                }
                "setToken" -> {
                    val token = call.argument<String>("token")?.trim()
                    if (!token.isNullOrEmpty()) {
                        saveFcmToken(this, token)
                    }
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }

    companion object {
        private const val PREFS_NAME = "kodihub_push"
        private const val KEY_FCM_TOKEN = "fcm_token"

        @JvmStatic
        fun saveFcmToken(context: Context, token: String) {
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(KEY_FCM_TOKEN, token)
                .apply()
        }

        private fun fetchFcmTokenIfAvailable(context: Context, callback: (String?) -> Unit) {
            try {
                val messagingClass = Class.forName("com.google.firebase.messaging.FirebaseMessaging")
                val instance = messagingClass.getMethod("getInstance").invoke(null)
                val task = messagingClass.getMethod("getToken").invoke(instance)
                val taskClass = Class.forName("com.google.android.gms.tasks.Task")
                val listenerClass = Class.forName("com.google.android.gms.tasks.OnCompleteListener")
                val proxy = java.lang.reflect.Proxy.newProxyInstance(
                    listenerClass.classLoader,
                    arrayOf(listenerClass)
                ) { _, method, args ->
                    if (method.name == "onComplete" && args != null && args.isNotEmpty()) {
                        val completedTask = args[0]
                        val ok = taskClass.getMethod("isSuccessful").invoke(completedTask) as? Boolean ?: false
                        val token = if (ok) {
                            (taskClass.getMethod("getResult").invoke(completedTask) as? String)?.trim()
                        } else null
                        if (!token.isNullOrEmpty()) {
                            saveFcmToken(context, token)
                        }
                        callback(token)
                    }
                    null
                }
                taskClass.getMethod("addOnCompleteListener", listenerClass).invoke(task, proxy)
            } catch (_: Throwable) {
                callback(null)
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
