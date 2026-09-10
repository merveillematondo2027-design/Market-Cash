package com.marketcash.admin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION &&
            intent.action != Telephony.Sms.Intents.SMS_DELIVER_ACTION) return

        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) return

        val sender = messages.firstOrNull()?.originatingAddress.orEmpty()
        val body = messages.joinToString(separator = "") { it.messageBody.orEmpty() }
        val receivedAt = messages.maxOfOrNull { it.timestampMillis } ?: System.currentTimeMillis()
        val simSlot = intent.getIntExtra("slot", intent.getIntExtra("slot_id", -1))
        val subscriptionId = intent.getIntExtra("subscription", intent.getIntExtra("subscription_id", -1))
        val deviceId = DeviceId.get(context)

        val payload = mapOf(
            "senderAddress" to sender,
            "body" to body,
            "receivedAt" to receivedAt,
            "simSlot" to simSlot,
            "subscriptionId" to subscriptionId,
            "deviceId" to deviceId
        )

        if (FirebaseAuth.getInstance().currentUser == null) {
            PendingSmsStore.save(context, payload)
            return
        }

        val pending = goAsync()
        FirebaseFunctions.getInstance("europe-west1")
            .getHttpsCallable("paymentBridgeIngestSms")
            .call(payload)
            .addOnSuccessListener { pending.finish() }
            .addOnFailureListener {
                PendingSmsStore.save(context, payload)
                pending.finish()
            }
    }
}
