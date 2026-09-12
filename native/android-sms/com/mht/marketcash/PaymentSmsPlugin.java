package com.mht.marketcash;

import android.Manifest;
import android.app.role.RoleManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.provider.Telephony;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONException;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "PaymentSms",
    permissions = @Permission(
        alias = "sms",
        strings = { Manifest.permission.READ_SMS, Manifest.permission.RECEIVE_SMS }
    )
)
public class PaymentSmsPlugin extends Plugin {
    private static final String SMS_PERMISSION = "sms";

    @PluginMethod
    public void getStatus(PluginCall call) {
        call.resolve(buildStatus());
    }

    @PluginMethod
    public void requestSmsPermissions(PluginCall call) {
        if (getPermissionState(SMS_PERMISSION) == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        requestPermissionForAlias(SMS_PERMISSION, call, "smsPermissionResult");
    }

    @PermissionCallback
    private void smsPermissionResult(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState(SMS_PERMISSION) == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestDefaultSmsRole(PluginCall call) {
        if (isDefaultSmsApp()) {
            JSObject ret = new JSObject();
            ret.put("requested", false);
            ret.put("isDefaultSms", true);
            call.resolve(ret);
            return;
        }

        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager roleManager = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
            if (roleManager == null || !roleManager.isRoleAvailable(RoleManager.ROLE_SMS)) {
                call.reject("Le rôle SMS n'est pas disponible sur cet appareil.");
                return;
            }
            intent = roleManager.createRequestRoleIntent(RoleManager.ROLE_SMS);
        } else {
            intent = new Intent(Telephony.Sms.Intents.ACTION_CHANGE_DEFAULT);
            intent.putExtra(Telephony.Sms.Intents.EXTRA_PACKAGE_NAME, getContext().getPackageName());
        }
        startActivityForResult(call, intent, "smsRoleResult");
    }

    @ActivityCallback
    private void smsRoleResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        ret.put("requested", true);
        ret.put("isDefaultSms", isDefaultSmsApp());
        call.resolve(ret);
    }

    @PluginMethod
    public void getPendingSms(PluginCall call) {
        JSArray messages = new JSArray();
        for (JSONObject item : PaymentSmsQueue.readAll(getContext())) messages.put(item);
        JSObject ret = new JSObject();
        ret.put("messages", messages);
        call.resolve(ret);
    }

    @PluginMethod
    public void acknowledgeSms(PluginCall call) {
        JSArray idsArray = call.getArray("ids");
        if (idsArray == null) {
            call.reject("Liste des SMS requise.");
            return;
        }
        List<String> ids = new ArrayList<>();
        try {
            for (Object value : idsArray.toList()) {
                if (value != null) ids.add(String.valueOf(value));
            }
        } catch (JSONException error) {
            call.reject("Liste des SMS invalide.");
            return;
        }
        int removed = PaymentSmsQueue.acknowledge(getContext(), ids);
        JSObject ret = new JSObject();
        ret.put("removed", removed);
        ret.put("remaining", PaymentSmsQueue.count(getContext()));
        call.resolve(ret);
    }

    private JSObject buildStatus() {
        JSObject ret = new JSObject();
        ret.put("supported", isSmsRoleAvailable());
        ret.put("isDefaultSms", isDefaultSmsApp());
        ret.put("pendingCount", PaymentSmsQueue.count(getContext()));
        ret.put("platform", "android");
        return ret;
    }

    private boolean isSmsRoleAvailable() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager roleManager = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
            return roleManager != null && roleManager.isRoleAvailable(RoleManager.ROLE_SMS);
        }
        return true;
    }

    private boolean isDefaultSmsApp() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            RoleManager roleManager = (RoleManager) getContext().getSystemService(Context.ROLE_SERVICE);
            return roleManager != null && roleManager.isRoleHeld(RoleManager.ROLE_SMS);
        }
        String current = Telephony.Sms.getDefaultSmsPackage(getContext());
        return getContext().getPackageName().equals(current);
    }
}
