package com.mht.marketcash;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class PaymentMmsReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        // Market-Cash ne traite pas les MMS comme preuve de paiement.
        // Ce receiver est déclaré uniquement pour satisfaire le rôle SMS Android.
    }
}
