package com.benmi.pos;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Base64;
import androidx.core.app.ActivityCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * ThermalPrinterPlugin
 * Native Capacitor Plugin for direct, silent ESC/POS thermal printing over local TCP Sockets (Port 9100)
 * and Bluetooth Classic Serial Port Profile (SPP RFCOMM).
 */
@CapacitorPlugin(
    name = "ThermalPrinter",
    permissions = {
        @Permission(strings = { Manifest.permission.BLUETOOTH_CONNECT, Manifest.permission.BLUETOOTH_SCAN }, alias = "bluetooth")
    }
)
public class ThermalPrinterPlugin extends Plugin {
    private final ExecutorService executor = Executors.newFixedThreadPool(3);
    private static final UUID SPP_UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final java.util.concurrent.locks.ReentrantLock BT_PRINT_LOCK = new java.util.concurrent.locks.ReentrantLock();

    /**
     * Send raw ESC/POS byte data over TCP socket.
     * Arguments:
     * - ip: string (Printer IP address, e.g. "192.168.1.100")
     * - port: int (default: 9100)
     * - data: string (Base64 encoded ESC/POS byte stream)
     * - timeoutMs: int (Socket timeout in milliseconds, default: 4000)
     */
    @PluginMethod
    public void printTcp(PluginCall call) {
        String ip = call.getString("ip");
        Integer port = call.getInt("port", 9100);
        String base64Data = call.getString("data");
        Integer timeoutMs = call.getInt("timeoutMs", 4000);

        if (ip == null || ip.trim().isEmpty() || base64Data == null || base64Data.trim().isEmpty()) {
            call.reject("IP address and base64 print data are required.");
            return;
        }

        executor.execute(() -> {
            Socket socket = null;
            try {
                byte[] rawBytes = Base64.decode(base64Data, Base64.DEFAULT);
                socket = new Socket();
                socket.connect(new InetSocketAddress(ip.trim(), port), timeoutMs);
                socket.setSoTimeout(timeoutMs);

                OutputStream outputStream = socket.getOutputStream();
                outputStream.write(rawBytes);
                outputStream.flush();

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("ip", ip);
                ret.put("bytesWritten", rawBytes.length);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to print to " + ip + ":" + port + " - " + e.getMessage(), e);
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
            }
        });
    }

    /**
     * Convert and print an HTML canvas / base64 image as 1-bit monochrome raster bitmap (GS v 0).
     * Arguments:
     * - ip: string (Printer IP address)
     * - port: int (default: 9100)
     * - base64Image: string (Base64 encoded PNG or JPEG image)
     * - paperWidth: int (80 or 58, default: 80)
     * - autoCut: boolean (default: true)
     * - timeoutMs: int (default: 5000)
     */
    @PluginMethod
    public void printBitmap(PluginCall call) {
        String ip = call.getString("ip");
        Integer port = call.getInt("port", 9100);
        String base64Image = call.getString("base64Image");
        String protocol = call.getString("protocol", "esc_pos");
        Integer paperWidth = call.getInt("paperWidth", 80);
        Boolean autoCut = call.getBoolean("autoCut", true);
        Double feedBeforeCutMm = call.getDouble("feedBeforeCutMm", 80.0);
        Integer labelWidthMm = call.getInt("labelWidthMm", 100);
        Integer labelHeightMm = call.getInt("labelHeightMm", 150);
        Integer dpi = call.getInt("dpi", 203);
        Double xOffsetMm = call.getDouble("xOffsetMm", 0.0);
        Double yOffsetMm = call.getDouble("yOffsetMm", 0.0);
        Integer timeoutMs = call.getInt("timeoutMs", 5000);

        if (ip == null || ip.trim().isEmpty() || base64Image == null || base64Image.trim().isEmpty()) {
            call.reject("IP address and base64 image data are required.");
            return;
        }

        executor.execute(() -> {
            Socket socket = null;
            try {
                String cleanBase64 = base64Image;
                if (cleanBase64.contains(",")) {
                    cleanBase64 = cleanBase64.split(",")[1];
                }
                byte[] decodedString = Base64.decode(cleanBase64, Base64.DEFAULT);
                Bitmap decodedBitmap = BitmapFactory.decodeByteArray(decodedString, 0, decodedString.length);
                if (decodedBitmap == null) {
                    call.reject("Failed to decode base64 image into Bitmap.");
                    return;
                }

                byte[] printBytes;
                if ("tspl".equalsIgnoreCase(protocol)) {
                    printBytes = TsplBitmapConverter.convertBitmapToTsplRaster(
                        decodedBitmap, 
                        labelWidthMm, 
                        labelHeightMm, 
                        dpi != null ? dpi : 203, 
                        xOffsetMm != null ? xOffsetMm : 0.0, 
                        yOffsetMm != null ? yOffsetMm : 0.0
                    );
                } else {
                    printBytes = EscPosBitmapConverter.convertBitmapToEscPosRaster(decodedBitmap, paperWidth, autoCut, feedBeforeCutMm != null ? feedBeforeCutMm : 80.0);
                }

                socket = new Socket();
                socket.connect(new InetSocketAddress(ip.trim(), port), timeoutMs);
                socket.setSoTimeout(timeoutMs);

                OutputStream outputStream = socket.getOutputStream();
                outputStream.write(printBytes);
                outputStream.flush();

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("ip", ip);
                ret.put("protocol", protocol);
                ret.put("bytesWritten", printBytes.length);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to print bitmap to " + ip + ":" + port + " - " + e.getMessage(), e);
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
            }
        });
    }

    /**
     * Convert and print an HTML snippet directly using Native Android WebView rendering into 1-bit ESC/POS bitmap.
     * This avoids any Chromium Canvas Tainting / SecurityError restrictions.
     */
    @PluginMethod
    public void printHtml(PluginCall call) {
        String ip = call.getString("ip");
        Integer port = call.getInt("port", 9100);
        String html = call.getString("html");
        Integer paperWidth = call.getInt("paperWidth", 80);
        Boolean autoCut = call.getBoolean("autoCut", true);
        Integer timeoutMs = call.getInt("timeoutMs", 5000);

        if (ip == null || ip.trim().isEmpty() || html == null || html.trim().isEmpty()) {
            call.reject("IP address and HTML content are required.");
            return;
        }

        final int targetWidthPx = (paperWidth == 58) ? 384 : 576;

        getActivity().runOnUiThread(() -> {
            try {
                android.webkit.WebView renderWebView = new android.webkit.WebView(getContext());
                renderWebView.getSettings().setJavaScriptEnabled(true);
                renderWebView.getSettings().setDefaultTextEncodingName("UTF-8");
                renderWebView.setLayerType(android.view.View.LAYER_TYPE_SOFTWARE, null);

                renderWebView.setWebViewClient(new android.webkit.WebViewClient() {
                    @Override
                    public void onPageFinished(android.webkit.WebView view, String url) {
                        // Delay slightly to ensure fonts & layout are completely rasterized
                        view.postDelayed(() -> {
                            try {
                                float scale = getContext().getResources().getDisplayMetrics().density;
                                int contentHeight = Math.max(300, (int) (view.getContentHeight() * scale));
                                
                                view.measure(
                                    android.view.View.MeasureSpec.makeMeasureSpec(targetWidthPx, android.view.View.MeasureSpec.EXACTLY),
                                    android.view.View.MeasureSpec.makeMeasureSpec(contentHeight, android.view.View.MeasureSpec.EXACTLY)
                                );
                                view.layout(0, 0, targetWidthPx, contentHeight);

                                Bitmap bitmap = Bitmap.createBitmap(targetWidthPx, contentHeight, Bitmap.Config.ARGB_8888);
                                android.graphics.Canvas canvas = new android.graphics.Canvas(bitmap);
                                canvas.drawColor(android.graphics.Color.WHITE);
                                view.draw(canvas);

                                executor.execute(() -> {
                                    Socket socket = null;
                                    try {
                                        byte[] escPosBytes = EscPosBitmapConverter.convertBitmapToEscPosRaster(bitmap, paperWidth, autoCut);

                                        socket = new Socket();
                                        socket.connect(new InetSocketAddress(ip.trim(), port), timeoutMs);
                                        socket.setSoTimeout(timeoutMs);

                                        OutputStream outputStream = socket.getOutputStream();
                                        outputStream.write(escPosBytes);
                                        outputStream.flush();

                                        JSObject ret = new JSObject();
                                        ret.put("success", true);
                                        ret.put("ip", ip);
                                        ret.put("bytesWritten", escPosBytes.length);
                                        call.resolve(ret);
                                    } catch (Exception e) {
                                        call.reject("Failed to print HTML to " + ip + ":" + port + " - " + e.getMessage(), e);
                                    } finally {
                                        if (socket != null) {
                                            try { socket.close(); } catch (Exception ignored) {}
                                        }
                                    }
                                });
                            } catch (Exception e) {
                                call.reject("Failed to capture rendered receipt: " + e.getMessage(), e);
                            }
                        }, 250);
                    }
                });

                String styledHtml = "<!DOCTYPE html><html><head><meta charset='UTF-8'>" +
                    "<meta name='viewport' content='width=" + targetWidthPx + ", initial-scale=1.0, maximum-scale=1.0, user-scalable=no'>" +
                    "<style>" +
                    "body { margin: 0; padding: 0; background: #ffffff !important; color: #000000 !important; font-family: sans-serif; } " +
                    "* { box-sizing: border-box; color: #000000 !important; border-color: #000000 !important; }" +
                    "</style>" +
                    "</head><body><div style='width:" + targetWidthPx + "px; background:#ffffff; color:#000000; padding: 8px;'>" + html + "</div></body></html>";

                renderWebView.loadDataWithBaseURL("https://localhost", styledHtml, "text/html", "UTF-8", null);
            } catch (Exception e) {
                call.reject("Failed to initialize HTML rendering: " + e.getMessage(), e);
            }
        });
    }

    /**
     * Test network connection to a thermal printer IP and Port.
     * Arguments:
     * - ip: string (Printer IP)
     * - port: int (default: 9100)
     * - timeoutMs: int (default: 2000)
     */
    @PluginMethod
    public void testConnection(PluginCall call) {
        String ip = call.getString("ip");
        Integer port = call.getInt("port", 9100);
        Integer timeoutMs = call.getInt("timeoutMs", 2000);

        if (ip == null || ip.trim().isEmpty()) {
            call.reject("Printer IP is required.");
            return;
        }

        executor.execute(() -> {
            Socket socket = null;
            try {
                socket = new Socket();
                socket.connect(new InetSocketAddress(ip.trim(), port), timeoutMs);
                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("ip", ip);
                ret.put("port", port);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Connection failed to " + ip + ":" + port + " - " + e.getMessage(), e);
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
            }
        });
    }

    /**
     * Retrieve list of bonded/paired Bluetooth devices on Android OS.
     * Returns:
     * - supported: boolean
     * - enabled: boolean
     * - devices: Array<{ name: string, address: string, type: int }>
     */
    @PluginMethod
    public void getPairedBluetoothDevices(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                requestPermissionForAlias("bluetooth", call, "bluetoothDevicesCallback");
                return;
            }
        }
        loadAndReturnBondedDevices(call);
    }

    @PermissionCallback
    private void bluetoothDevicesCallback(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED) {
                loadAndReturnBondedDevices(call);
                return;
            }
        }
        call.reject("BLUETOOTH_CONNECT permission not granted. Please allow Nearby Devices permission in App Info > Permissions.");
    }

    private void loadAndReturnBondedDevices(PluginCall call) {
        try {
            BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
            JSObject ret = new JSObject();

            if (adapter == null) {
                ret.put("supported", false);
                ret.put("enabled", false);
                ret.put("devices", new JSArray());
                call.resolve(ret);
                return;
            }

            ret.put("supported", true);
            ret.put("enabled", adapter.isEnabled());

            if (!adapter.isEnabled()) {
                ret.put("devices", new JSArray());
                call.resolve(ret);
                return;
            }

            Set<BluetoothDevice> paired = adapter.getBondedDevices();
            JSArray devicesArray = new JSArray();

            if (paired != null) {
                for (BluetoothDevice device : paired) {
                    JSObject devObj = new JSObject();
                    String devName = device.getName();
                    devObj.put("name", devName != null ? devName : "Unknown Device");
                    devObj.put("address", device.getAddress());
                    devObj.put("type", device.getType());
                    devicesArray.put(devObj);
                }
            }

            ret.put("devices", devicesArray);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to query paired Bluetooth devices: " + e.getMessage(), e);
        }
    }

    /**
     * Print raw data or raster bitmap to a Bluetooth Classic printer (SPP RFCOMM).
     * Arguments:
     * - macAddress: string (e.g. "00:11:22:33:44:55")
     * - base64Image: string (optional PNG base64)
     * - data: string (optional raw base64 byte stream)
     * - paperWidth: int (80 or 58, default: 80)
     * - autoCut: boolean (default: true)
     */
    private BluetoothSocket connectBluetooth(BluetoothDevice device, int timeoutMs) throws Exception {
        Exception lastError = null;
        // Two bounded attempts, with a short handover gap. Neither sends print
        // bytes, so a retry here cannot duplicate a receipt already transmitted.
        for (int attempt = 0; attempt < 2; attempt++) {
            BluetoothSocket candidate = null;
            try {
                if (attempt == 0) candidate = device.createRfcommSocketToServiceRecord(SPP_UUID);
                else {
                    Thread.sleep(750);
                    candidate = (BluetoothSocket) device.getClass().getMethod("createRfcommSocket", int.class).invoke(device, 1);
                }
                if (candidate == null) throw new Exception("No RFCOMM socket");
                final BluetoothSocket connection = candidate;
                BoundedPrinterIo.run(connection, timeoutMs, connection::connect);
                return candidate;
            } catch (Exception error) {
                lastError = error;
                if (candidate != null) { try { candidate.close(); } catch (Exception ignored) { } }
            }
        }
        throw new Exception("Bluetooth connection unavailable after two attempts", lastError);
    }

    private int boundedTimeout(Integer value, int fallback) {
        return value == null ? fallback : Math.max(1000, Math.min(15000, value));
    }

    @PluginMethod
    public void printBluetooth(PluginCall call) {
        final int connectTimeoutMs = boundedTimeout(call.getInt("connectTimeoutMs"), 8000);
        final int writeTimeoutMs = boundedTimeout(call.getInt("writeIdleTimeoutMs"), 10000);
        String macAddress = call.getString("macAddress");
        String base64Image = call.getString("base64Image");
        String base64Data = call.getString("data");
        String protocol = call.getString("protocol", "esc_pos");
        Integer paperWidth = call.getInt("paperWidth", 80);
        Boolean autoCut = call.getBoolean("autoCut", true);
        Double feedBeforeCutMm = call.getDouble("feedBeforeCutMm", 80.0);
        Integer labelWidthMm = call.getInt("labelWidthMm", 100);
        Integer labelHeightMm = call.getInt("labelHeightMm", 150);
        Integer dpi = call.getInt("dpi", 203);
        Double xOffsetMm = call.getDouble("xOffsetMm", 0.0);
        Double yOffsetMm = call.getDouble("yOffsetMm", 0.0);

        if (macAddress == null || macAddress.trim().isEmpty()) {
            call.reject("Bluetooth device MAC address is required.");
            return;
        }

        if ((base64Image == null || base64Image.trim().isEmpty()) && (base64Data == null || base64Data.trim().isEmpty())) {
            call.reject("Either base64Image or base64 data must be provided.");
            return;
        }

        executor.execute(() -> {
            BluetoothSocket socket = null;
            boolean locked = false;
            boolean sending = false;
            try {
                locked = BT_PRINT_LOCK.tryLock(15, TimeUnit.SECONDS);
                if (!locked) {
                    call.reject("Printer queue busy; no data sent", "BLUETOOTH_CONNECT_BUSY");
                    return;
                }
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) {
                    call.reject("Bluetooth adapter is not available or disabled.");
                    return;
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                        call.reject("BLUETOOTH_CONNECT permission not granted.");
                        return;
                    }
                }

                // Cancel active discovery to ensure maximum socket connection speed and radio stability
                adapter.cancelDiscovery();

                BluetoothDevice device = adapter.getRemoteDevice(macAddress.trim().toUpperCase());
                if (device == null) {
                    call.reject("Bluetooth device not found for address: " + macAddress);
                    return;
                }

                // Prepare print payload
                byte[] printBytes;
                if (base64Image != null && !base64Image.trim().isEmpty()) {
                    String cleanBase64 = base64Image.contains(",") ? base64Image.substring(base64Image.indexOf(",") + 1) : base64Image;
                    byte[] imageBytes = Base64.decode(cleanBase64, Base64.DEFAULT);
                    Bitmap bitmap = BitmapFactory.decodeByteArray(imageBytes, 0, imageBytes.length);
                    if (bitmap == null) {
                        call.reject("Failed to decode base64 PNG bitmap.");
                        return;
                    }
                    if ("tspl".equalsIgnoreCase(protocol)) {
                        printBytes = TsplBitmapConverter.convertBitmapToTsplRaster(
                            bitmap, 
                            labelWidthMm, 
                            labelHeightMm, 
                            dpi != null ? dpi : 203, 
                            xOffsetMm != null ? xOffsetMm : 0.0, 
                            yOffsetMm != null ? yOffsetMm : 0.0
                        );
                    } else {
                        printBytes = EscPosBitmapConverter.convertBitmapToEscPosRaster(bitmap, paperWidth, autoCut, feedBeforeCutMm != null ? feedBeforeCutMm : 80.0);
                    }
                } else {
                    printBytes = Base64.decode(base64Data, Base64.DEFAULT);
                }

                socket = connectBluetooth(device, connectTimeoutMs);
                final BluetoothSocket connection = socket;

                // 1. Warm-up delay: Allow Bluetooth SPP UART bridge on thermal printer (e.g. BK3231/CSR on Xprinter)
                // to settle baud rate and establish reliable serial handshake before transmitting first bytes
                try { Thread.sleep(250); } catch (InterruptedException ignored) {}

                OutputStream outputStream = socket.getOutputStream();

                // 2. Buffer sanitization: Send CAN (0x18) to clear any lingering corrupted bytes
                // and ESC @ (0x1B, 0x40) to guarantee clean printer initialization
                if (!"tspl".equalsIgnoreCase(protocol)) {
                    sending = true;
                    BoundedPrinterIo.run(connection, writeTimeoutMs, () -> {
                        outputStream.write(new byte[]{0x18, 0x1B, 0x40});
                        outputStream.flush();
                    });
                    try { Thread.sleep(50); } catch (InterruptedException ignored) {}
                }

                // 3. Adaptive Chunking & Pacing:
                // Transmit in 512-byte chunks with 35ms pacing to strictly stay under ~14.6 KB/s.
                // This prevents hardware UART buffer overrun on low-cost Bluetooth thermal printers (2KB-4KB FIFO)
                final int chunkSize = 512;
                for (int i = 0; i < printBytes.length; i += chunkSize) {
                    int len = Math.min(chunkSize, printBytes.length - i);
                    final int offset = i;
                    sending = true;
                    BoundedPrinterIo.run(connection, writeTimeoutMs, () -> {
                        outputStream.write(printBytes, offset, len);
                        outputStream.flush();
                    });
                    if (i + chunkSize < printBytes.length) {
                        try { Thread.sleep(35); } catch (InterruptedException ignored) {}
                    }
                }
                BoundedPrinterIo.run(connection, writeTimeoutMs, outputStream::flush);

                // 4. Drain wait: Wait for mechanical printhead to complete burning and paper feeding
                // before closing the RFCOMM connection to avoid truncating printhead buffer.
                // Scale dynamically based on payload size rather than a premature fixed cap (e.g. 6s).
                long dynamicDrainMs = (long) ((printBytes.length / 512.0) * 35.0);
                long waitTimeMs = Math.max(1500L, 1200L + dynamicDrainMs);
                waitTimeMs = Math.min(waitTimeMs, 30000L); // Generous 30s safety ceiling to prevent indefinite block
                try { Thread.sleep(waitTimeMs); } catch (InterruptedException ignored) {}

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("macAddress", macAddress);
                ret.put("bytesWritten", printBytes.length);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Bluetooth print failed to " + macAddress + " - " + e.getMessage(),
                    sending ? "BLUETOOTH_SEND_UNCERTAIN" : "BLUETOOTH_CONNECT_FAILED", e);
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
                if (locked) BT_PRINT_LOCK.unlock();
            }
        });
    }

    /**
     * Test connection to a paired Bluetooth device.
     */
    @PluginMethod
    public void testBluetoothConnection(PluginCall call) {
        String macAddress = call.getString("macAddress");
        if (macAddress == null || macAddress.trim().isEmpty()) {
            call.reject("Bluetooth MAC address is required.");
            return;
        }

        executor.execute(() -> {
            BluetoothSocket socket = null;
            boolean locked = false;
            try {
                locked = BT_PRINT_LOCK.tryLock(15, TimeUnit.SECONDS);
                if (!locked) { call.reject("Printer queue busy", "BLUETOOTH_CONNECT_BUSY"); return; }
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter == null || !adapter.isEnabled()) {
                    call.reject("Bluetooth is disabled or not available.");
                    return;
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    if (ActivityCompat.checkSelfPermission(getContext(), Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                        call.reject("BLUETOOTH_CONNECT permission not granted.");
                        return;
                    }
                }

                adapter.cancelDiscovery();
                BluetoothDevice device = adapter.getRemoteDevice(macAddress.trim().toUpperCase());

                socket = connectBluetooth(device, 8000);

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("macAddress", macAddress);
                ret.put("deviceName", device.getName());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Bluetooth connection failed to " + macAddress + " - " + e.getMessage(), e);
            } finally {
                if (socket != null) {
                    try { socket.close(); } catch (Exception ignored) {}
                }
                if (locked) BT_PRINT_LOCK.unlock();
            }
        });
    }
}
