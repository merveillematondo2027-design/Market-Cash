package com.mht.marketcash;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.provider.Telephony;
import android.telephony.SmsMessage;

public class PaymentSmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Telephony.Sms.Intents.SMS_DELIVER_ACTION.equals(intent.getAction())) return;

        SmsMessage[] messages = Telephony.Sms.Intents.getMessagesFromIntent(intent);
        if (messages == null || messages.length == 0) return;

        String sender = messages[0].getDisplayOriginatingAddress();
        StringBuilder body = new StringBuilder();
        long receivedAt = 0L;
        for (SmsMessage message : messages) {
            if (message == null) continue;
            if (message.getDisplayMessageBody() != null) body.append(message.getDisplayMessageBody());
            receivedAt = Math.max(receivedAt, message.getTimestampMillis());
        }
        if (receivedAt <= 0L) receivedAt = System.currentTimeMillis();

        int simSlot = intent.getIntExtra("slot", intent.getIntExtra("slot_id", -1));
        int subscriptionId = intent.getIntExtra("subscription", intent.getIntExtra("subscription_id", -1));
        PaymentSmsQueue.add(context, sender == null ? "" : sender, body.toString(), receivedAt, simSlot, subscriptionId);
    }
}
