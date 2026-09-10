package com.marketcash.admin

import android.content.Context
import java.util.UUID

object DeviceId {
    fun get(context: Context): String {
        val prefs = context.getSharedPreferences("market_cash_admin", Context.MODE_PRIVATE)
        return prefs.getString("device_id", null) ?: "MC-ADMIN-${UUID.randomUUID()}".also {
            prefs.edit().putString("device_id", it).apply()
        }
    }
}
