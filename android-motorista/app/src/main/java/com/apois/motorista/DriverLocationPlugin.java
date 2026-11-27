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

        boolean hml = getContext().getPackageName().equals("com.apois.motorista.hml");
        if (hml != HmlDriverLocationService.ORIGIN.equals(supabaseUrl)) {
            call.reject("Ambiente incompatível com o pacote Android.");
            return;
        }
        Intent intent = new Intent(getContext(), hml ? HmlDriverLocationService.class : DriverLocationService.class);
        intent.setAction(DriverLocationService.ACTION_START);
        intent.putExtra(DriverLocationService.EXTRA_SUPABASE_URL, supabaseUrl);
        intent.putExtra(DriverLocationService.EXTRA_PUBLISHABLE_KEY, publishableKey);
        intent.putExtra(DriverLocationService.EXTRA_ACCESS_TOKEN, accessToken);
        if (!hml) intent.putExtra(DriverLocationService.EXTRA_REFRESH_TOKEN, refreshToken);
        ContextCompat.startForegroundService(getContext(), intent);

        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PluginMethod
    public void updateHmlToken(PluginCall call) {
        if (!getContext().getPackageName().equals("com.apois.motorista.hml")) { call.reject("HML only"); return; }
        String token=call.getString("accessToken","");
        if(HmlDriverLocationService.identity(token)==null){call.reject("Sessão inválida");return;}
        Intent intent=new Intent(getContext(),HmlDriverLocationService.class);
        intent.setAction(HmlDriverLocationService.UPDATE);
        intent.putExtra(DriverLocationService.EXTRA_ACCESS_TOKEN,token);
        getContext().startService(intent);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        boolean hml = getContext().getPackageName().equals("com.apois.motorista.hml");
        Intent intent = new Intent(getContext(), hml ? HmlDriverLocationService.class : DriverLocationService.class);
        intent.setAction(DriverLocationService.ACTION_STOP);
        getContext().startService(intent);
        JSObject result = new JSObject();
        result.put("stopped", true);
        call.resolve(result);
    }
}
