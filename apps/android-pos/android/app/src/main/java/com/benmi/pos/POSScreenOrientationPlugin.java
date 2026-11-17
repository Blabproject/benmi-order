package com.benmi.pos;

import android.app.Activity;
import android.content.Context;
import android.content.pm.ActivityInfo;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Device preference shared by the launcher and the remote/bundled POS settings. */
@CapacitorPlugin(name = "POSScreenOrientation")
public class POSScreenOrientationPlugin extends Plugin {
    private static final String PREFERENCES = "pos_display";
    private static final String MODE_KEY = "screen_orientation";
    private static final String DEFAULT_MODE = "landscape";

    private static boolean isValidMode(String mode) {
        return "auto".equals(mode) || "portrait".equals(mode) || "landscape".equals(mode);
    }

    private static String readMode(Context context) {
        String mode = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(MODE_KEY, DEFAULT_MODE);
        return isValidMode(mode) ? mode : DEFAULT_MODE;
    }

    private static int requestedOrientation(String mode) {
        if ("auto".equals(mode)) return ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR;
        if ("portrait".equals(mode)) return ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT;
        return ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE;
    }

    public static void restore(Activity activity) {
        activity.setRequestedOrientation(requestedOrientation(readMode(activity)));
    }

    @PluginMethod
    public void getMode(PluginCall call) {
        JSObject result = new JSObject();
        result.put("mode", readMode(getContext()));
        call.resolve(result);
    }

    @PluginMethod
    public void setMode(PluginCall call) {
        String mode = call.getString("mode");
        if (!isValidMode(mode)) {
            call.reject("Unsupported screen orientation", "INVALID_ORIENTATION");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity is unavailable", "ACTIVITY_UNAVAILABLE");
            return;
        }
        activity.runOnUiThread(() -> {
            try {
                activity.setRequestedOrientation(requestedOrientation(mode));
                activity.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
                    .edit().putString(MODE_KEY, mode).apply();
                JSObject result = new JSObject();
                result.put("mode", mode);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Unable to change screen orientation", "ORIENTATION_FAILED", error);
            }
        });
    }
}
