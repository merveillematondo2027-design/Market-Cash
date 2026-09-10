package com.marketcash.admin

import android.content.Context
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions
import org.json.JSONArray
import org.json.JSONObject

object PendingSmsStore {
    private const val PREFS = "market_cash_payment_bridge"
    private const val KEY = "pending_sms"

    fun count(context: Context): Int {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        return runCatching { JSONArray(prefs.getString(KEY, "[]") ?: "[]").length() }.getOrDefault(0)
    }

    fun save(context: Context, payload: Map<String, Any>) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val array = runCatching { JSONArray(prefs.getString(KEY, "[]") ?: "[]") }.getOrElse { JSONArray() }
        array.put(JSONObject(payload))
        prefs.edit().putString(KEY, array.toString()).apply()
    }

    fun flush(context: Context, onComplete: (() -> Unit)? = null) {
        FirebaseRuntime.ensure(context)
        if (FirebaseAuth.getInstance().currentUser == null) {
            onComplete?.invoke()
            return
        }
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val array = runCatching { JSONArray(prefs.getString(KEY, "[]") ?: "[]") }.getOrElse { JSONArray() }
        if (array.length() == 0) {
            onComplete?.invoke()
            return
        }

        val remaining = JSONArray()
        val functions = FirebaseFunctions.getInstance("europe-west1")
        var index = 0

        fun next() {
            if (index >= array.length()) {
                prefs.edit().putString(KEY, remaining.toString()).apply()
                onComplete?.invoke()
                return
            }
            val obj = array.getJSONObject(index++)
            val payload = obj.keys().asSequence().associateWith { key -> obj.get(key) }
            functions.getHttpsCallable("paymentBridgeIngestSms").call(payload)
                .addOnSuccessListener { next() }
                .addOnFailureListener {
                    remaining.put(obj)
                    next()
                }
        }
        next()
    }
}
