package com.marketcash.admin

import android.content.Context
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

object FirebaseRuntime {
    fun ensure(context: Context) {
        if (FirebaseApp.getApps(context).isNotEmpty()) return
        val options = FirebaseOptions.Builder()
            .setApiKey("AIzaSyA0JtXL4msd5O8bq8hD2vMKCZGgmwhldWY")
            .setApplicationId("1:153173040202:web:40558026c87f8f7a739ab3")
            .setProjectId("automarket-fintech")
            .setStorageBucket("automarket-fintech.firebasestorage.app")
            .setGcmSenderId("153173040202")
            .build()
        FirebaseApp.initializeApp(context, options)
    }
}
