package com.benmi.pos;

import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        android.webkit.WebView.enableSlowWholeDocumentDraw();
        registerPlugin(ThermalPrinterPlugin.class);
        registerPlugin(POSScreenOrientationPlugin.class);
        super.onCreate(savedInstanceState);
        POSScreenOrientationPlugin.restore(this);

        // Keep screen on continuously during store operating hours
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
}
