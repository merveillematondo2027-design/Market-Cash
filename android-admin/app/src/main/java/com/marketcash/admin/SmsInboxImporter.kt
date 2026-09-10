package com.marketcash.admin

import android.content.Context
import android.provider.Telephony
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.functions.FirebaseFunctions

object SmsInboxImporter {
    private data class InboxSms(
        val sender: String,
        val body: String,
        val receivedAt: Long,
        val subscriptionId: Int
    )

    fun importRecentPayments(
        context: Context,
        days: Int = 30,
        maxMessages: Int = 500,
        onComplete: (imported: Int, failed: Int) -> Unit
    ) {
        FirebaseRuntime.ensure(context)
        if (FirebaseAuth.getInstance().currentUser == null) {
            onComplete(0, 0)
            return
        }

        Thread {
            val items = mutableListOf<InboxSms>()
            val since = System.currentTimeMillis() - days * 24L * 60L * 60L * 1000L
            val projection = arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                "sub_id"
            )
            runCatching {
                context.contentResolver.query(
                    Telephony.Sms.Inbox.CONTENT_URI,
                    projection,
                    "${Telephony.Sms.DATE} >= ?",
                    arrayOf(since.toString()),
                    "${Telephony.Sms.DATE} DESC"
                )?.use { cursor ->
                    val addressIndex = cursor.getColumnIndex(Telephony.Sms.ADDRESS)
                    val bodyIndex = cursor.getColumnIndex(Telephony.Sms.BODY)
                    val dateIndex = cursor.getColumnIndex(Telephony.Sms.DATE)
                    val subIndex = cursor.getColumnIndex("sub_id")
                    while (cursor.moveToNext() && items.size < maxMessages) {
                        val sender = if (addressIndex >= 0) cursor.getString(addressIndex).orEmpty() else ""
                        val body = if (bodyIndex >= 0) cursor.getString(bodyIndex).orEmpty() else ""
                        if (!looksLikePaymentSms(sender, body)) continue
                        items += InboxSms(
                            sender = sender,
                            body = body,
                            receivedAt = if (dateIndex >= 0) cursor.getLong(dateIndex) else System.currentTimeMillis(),
                            subscriptionId = if (subIndex >= 0) cursor.getInt(subIndex) else -1
                        )
                    }
                }
            }

            context.mainExecutor.execute {
                syncItems(context, items, onComplete)
            }
        }.start()
    }

    private fun syncItems(context: Context, items: List<InboxSms>, onComplete: (Int, Int) -> Unit) {
        if (items.isEmpty()) {
            onComplete(0, 0)
            return
        }
        val functions = FirebaseFunctions.getInstance("europe-west1")
        val deviceId = DeviceId.get(context)
        var index = 0
        var imported = 0
        var failed = 0

        fun next() {
            if (index >= items.size) {
                onComplete(imported, failed)
                return
            }
            val item = items[index++]
            val payload = mapOf(
                "senderAddress" to item.sender,
                "body" to item.body,
                "receivedAt" to item.receivedAt,
                "simSlot" to -1,
                "subscriptionId" to item.subscriptionId,
                "deviceId" to deviceId
            )
            functions.getHttpsCallable("paymentBridgeIngestSms").call(payload)
                .addOnSuccessListener {
                    imported++
                    next()
                }
                .addOnFailureListener {
                    PendingSmsStore.save(context, payload)
                    failed++
                    next()
                }
        }
        next()
    }

    private fun looksLikePaymentSms(sender: String, body: String): Boolean {
        val text = "$sender $body".lowercase()
        val provider = listOf("mpesa", "m-pesa", "vodacom", "airtel", "orange money", "afrimoney", "africell")
            .any { text.contains(it) }
        val receipt = listOf("vous avez reçu", "vous avez recu", "received", "paiement reçu", "paiement recu", "credited", "crédité", "credite")
            .any { text.contains(it) }
        return provider || receipt
    }
}
