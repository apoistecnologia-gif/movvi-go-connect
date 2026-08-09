package com.apois.motorista;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DriverLocationPlugin.class);
        registerPlugin(DriverVoicePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
