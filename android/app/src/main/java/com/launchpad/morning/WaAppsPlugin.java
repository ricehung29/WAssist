package com.launchpad.morning;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Lets the web layer pick between WhatsApp and WhatsApp Business.
 *
 * Both apps register the exact same `whatsapp://` scheme, so a plain URL always
 * hands off to the system default (or a chooser). The only way to target one
 * specific app is to resolve the intent against its package name, which the
 * WebView cannot do — hence this plugin.
 *
 * Both packages are declared in <queries>, so the Android 11+ package-visibility
 * filter still lets us see them.
 */
@CapacitorPlugin(name = "WaApps")
public class WaAppsPlugin extends Plugin {

    private static final String PKG_WHATSAPP = "com.whatsapp";
    private static final String PKG_BUSINESS = "com.whatsapp.w4b";

    private boolean isInstalled(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }

    /** Which of the two apps this device actually has. */
    @PluginMethod
    public void installed(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("whatsapp", isInstalled(PKG_WHATSAPP));
        ret.put("business", isInstalled(PKG_BUSINESS));
        call.resolve(ret);
    }

    /**
     * Open a chat in one named app. Rejects when that app is not installed so
     * the caller can fall back instead of silently opening the wrong one.
     */
    @PluginMethod
    public void open(PluginCall call) {
        String phone = call.getString("phone", "");
        String text = call.getString("text", "");
        String target = call.getString("target", "whatsapp");

        if (phone == null || phone.isEmpty()) {
            call.reject("missing-phone");
            return;
        }

        String pkg = "business".equals(target) ? PKG_BUSINESS : PKG_WHATSAPP;
        if (!isInstalled(pkg)) {
            call.reject("not-installed");
            return;
        }

        StringBuilder uri = new StringBuilder("whatsapp://send?phone=").append(phone);
        if (text != null && !text.isEmpty()) {
            uri.append("&text=").append(Uri.encode(text));
        }

        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri.toString()));
            intent.setPackage(pkg);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("launch-failed", e);
        }
    }
}