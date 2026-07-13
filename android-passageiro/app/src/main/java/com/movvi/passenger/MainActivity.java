package com.movvi.passenger;

import android.os.Bundle;
import android.os.Build;
import android.util.Log;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MovviPassenger";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Log.i(TAG, "MainActivity criada");

        // Evita conflito adjustResize + WebView + IME em aparelhos XOS/Transsion.
        getWindow().setSoftInputMode(
            WindowManager.LayoutParams.SOFT_INPUT_ADJUST_PAN
        );
        Log.i(TAG, "softInputMode configurado como adjustPan");

        WebView webView = null;
        try {
            webView = getBridge().getWebView();
            Log.i(TAG, "WebView obtida");
        } catch (Throwable t) {
            Log.w(TAG, "Falha ao obter WebView: " + t.getMessage());
        }

        if (webView != null) {
            webView.setFocusable(true);
            webView.setFocusableInTouchMode(true);
            webView.requestFocus(View.FOCUS_DOWN);
            webView.setOnFocusChangeListener((view, hasFocus) ->
                Log.i(TAG, "WebView focus=" + hasFocus)
            );
            Log.i(TAG, "WebView preparado para entrada de texto");

            // Desativa integração nativa de Autofill no WebView (evita loop de
            // AutofillSession em IMEs de terceiros no Android).
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                webView.setImportantForAutofill(
                    View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
                );
                Log.i(TAG, "Autofill desativado");
            }
            webView.getSettings().setSaveFormData(false);
        }
    }
}
