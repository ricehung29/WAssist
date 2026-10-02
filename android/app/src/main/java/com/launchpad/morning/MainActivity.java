package com.launchpad.morning;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Must be registered before super.onCreate() so the bridge picks it up
        // while building the plugin list.
        registerPlugin(WaAppsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}