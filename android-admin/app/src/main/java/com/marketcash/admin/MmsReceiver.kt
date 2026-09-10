package com.marketcash.admin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class MmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        // Required for eligibility as the default SMS/MMS handler.
        // Payment verification V1 only consumes SMS operator receipts.
    }
}
