package com.mht.marketcash;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

final class PaymentSmsQueue {
    private static final String PREFS = "market_cash_payment_sms";
    private static final String KEY = "pending";
    private static final int MAX_MESSAGES = 500;

    private PaymentSmsQueue() {}

    static synchronized String add(Context context, String senderAddress, String body, long receivedAt, int simSlot, int subscriptionId) {
        String id = UUID.randomUUID().toString();
        JSONArray queue = readArray(context);
        JSONObject event = new JSONObject();
        try {
            event.put("id", id);
            event.put("senderAddress", senderAddress == null ? "" : senderAddress);
            event.put("body", body == null ? "" : body);
            event.put("receivedAt", receivedAt);
            event.put("simSlot", simSlot);
            event.put("subscriptionId", subscriptionId);
            queue.put(event);
            while (queue.length() > MAX_MESSAGES) queue.remove(0);
            saveArray(context, queue);
        } catch (JSONException ignored) {}
        return id;
    }

    static synchronized List<JSONObject> readAll(Context context) {
        JSONArray queue = readArray(context);
        List<JSONObject> result = new ArrayList<>();
        for (int i = 0; i < queue.length(); i++) {
            JSONObject item = queue.optJSONObject(i);
            if (item != null) result.add(item);
        }
        return result;
    }

    static synchronized int count(Context context) {
        return readArray(context).length();
    }

    static synchronized int acknowledge(Context context, List<String> ids) {
        Set<String> accepted = new HashSet<>(ids);
        JSONArray current = readArray(context);
        JSONArray remaining = new JSONArray();
        int removed = 0;
        for (int i = 0; i < current.length(); i++) {
            JSONObject item = current.optJSONObject(i);
            if (item == null) continue;
            if (accepted.contains(item.optString("id"))) removed++;
            else remaining.put(item);
        }
        saveArray(context, remaining);
        return removed;
    }

    private static JSONArray readArray(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = prefs.getString(KEY, "[]");
        try {
            return new JSONArray(raw == null ? "[]" : raw);
        } catch (JSONException ignored) {
            return new JSONArray();
        }
    }

    private static void saveArray(Context context, JSONArray queue) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, queue.toString())
            .apply();
    }
}
