package com.apois.motorista;

import android.content.Intent;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DriverLocation")
public class DriverLocationPlugin extends Plugin {
    @PluginMethod
    public void start(PluginCall call) {
        String supabaseUrl = call.getString("supabaseUrl", "");
        String publishableKey = call.getString("publishableKey", "");
        String accessToken = call.getString("accessToken", "");
        String refreshToken = call.getString("refreshToken", "");

        if (supabaseUrl.isEmpty() || publishableKey.isEmpty() || accessToken.isEmpty()) {
            call.reject("Sessão/configuração Supabase ausente para localização em background.");
            return;
        }

        Intent intent = new Intent(getContext(), DriverLocationService.class);
        intent.setAction(DriverLocationService.ACTION_START);
        intent.putExtra(DriverLocationService.EXTRA_SUPABASE_URL, supabaseUrl);
        intent.putExtra(DriverLocationService.EXTRA_PUBLISHABLE_KEY, publishableKey);
        intent.putExtra(DriverLocationService.EXTRA_ACCESS_TOKEN, accessToken);
        intent.putExtra(DriverLocationService.EXTRA_REFRESH_TOKEN, refreshToken);
        ContextCompat.startForegroundService(getContext(), intent);

        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        Intent intent = new Intent(getContext(), DriverLocationService.class);
        intent.setAction(DriverLocationService.ACTION_STOP);
        getContext().startService(intent);
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }
}
