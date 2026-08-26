package com.apois.motorista;

import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.UUID;

@CapacitorPlugin(name = "DriverVoice")
public class DriverVoicePlugin extends Plugin implements TextToSpeech.OnInitListener {
    private static final String GOOGLE_TTS_ENGINE = "com.google.android.tts";
    private static final Locale PT_BR = new Locale("pt", "BR");

    private TextToSpeech tts;
    private boolean ready = false;
    private String activeEngine = "default";

    @Override
    public void load() {
        super.load();
        initTts();
    }

    private boolean hasGoogleTts() {
        try {
            getContext().getPackageManager().getPackageInfo(GOOGLE_TTS_ENGINE, 0);
            return true;
        } catch (PackageManager.NameNotFoundException ignored) {
            return false;
        }
    }

    private void initTts() {
        if (tts != null) return;
        getActivity().runOnUiThread(() -> {
            if (tts != null) return;
            if (hasGoogleTts()) {
                activeEngine = GOOGLE_TTS_ENGINE;
                tts = new TextToSpeech(getContext(), this, GOOGLE_TTS_ENGINE);
            } else {
                activeEngine = "default";
                tts = new TextToSpeech(getContext(), this);
            }
        });
    }

    @Override
    public void onInit(int status) {
        if (status != TextToSpeech.SUCCESS || tts == null) {
            ready = false;
            return;
        }

        int language = tts.setLanguage(PT_BR);
        ready = language != TextToSpeech.LANG_MISSING_DATA && language != TextToSpeech.LANG_NOT_SUPPORTED;
        tts.setSpeechRate(0.98f);
        tts.setPitch(1.0f);
        tts.setAudioAttributes(
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ASSISTANCE_NAVIGATION_GUIDANCE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                .build()
        );
    }

    private void resolvePrime(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ready", ready);
        result.put("engine", activeEngine);
        result.put("language", "pt-BR");
        call.resolve(result);
    }

    @PluginMethod
    public void prime(PluginCall call) {
        initTts();
        if (ready) {
            resolvePrime(call);
            return;
        }
        new Handler(Looper.getMainLooper()).postDelayed(() -> resolvePrime(call), 900L);
    }

    private void performSpeak(PluginCall call, String text, boolean interrupt) {
        if (!ready || tts == null) {
            call.reject("Voz de navegação pt-BR indisponível no aparelho.");
            return;
        }

        int queueMode = interrupt ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD;
        int result = tts.speak(text, queueMode, null, "apois-nav-" + UUID.randomUUID());
        if (result == TextToSpeech.ERROR) {
            call.reject("Falha ao reproduzir voz de navegação.");
            return;
        }

        JSObject response = new JSObject();
        response.put("spoken", true);
        response.put("engine", activeEngine);
        call.resolve(response);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "").trim();
        boolean interrupt = Boolean.TRUE.equals(call.getBoolean("interrupt", false));
        if (text.isEmpty()) {
            call.resolve();
            return;
        }

        initTts();
        if (ready) {
            performSpeak(call, text, interrupt);
            return;
        }

        new Handler(Looper.getMainLooper()).postDelayed(() -> performSpeak(call, text, interrupt), 900L);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }
}
