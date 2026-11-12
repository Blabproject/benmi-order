# POS Bluetooth print recovery

Implemented on `codex/pos-bluetooth-recovery` for stores where Uber and Benmi run on separate devices and share a Bluetooth printer.

## Behavior

- A successful order-status response releases the POS action lock without waiting for printing or the subsequent order refresh. Failed/conflicting status changes keep the review dialog open.
- Status writes abort after 10 seconds. An ambiguous response triggers a refresh and an explanation; it never automatically repeats a status write or starts printing.
- Whole customer-order print batches run in sequence: receipt, then stickers. Repeated requests for an already queued order do not add another batch. A failed bitmap decrements the queue count once.
- Receipt and sticker results are stored separately in tenant-scoped local storage (last 100 reports). Queued/in-progress work remains visible in printer settings and the order detail. On a new WebView session, interrupted sends become uncertain; queued work requires explicit action. Reports are metadata, not a durable spool of receipt contents, and clearing app storage removes them.
- Automatic customer printing records an attempt separately from success. Partial failure never marks the whole order sent and never loops automatically. Targeted retry requires checking the paper and confirming that the selected part may contain duplicates. Staff can instead confirm that paper is complete, clearing an uncertain result without sending another print.
- “Sent to printer” means the native call completed; it is not a hardware acknowledgement that paper came out.

## Android bridge

`BoundedPrinterIo` closes the actual Bluetooth socket on a connection/write deadline. The queue lock remains held until I/O exits and the connection is closed in `finally`; JavaScript never abandons the native operation with a racing timeout.

Connection attempts use an 8-second deadline and at most two attempts (standard SPP, then RFCOMM fallback with a 750 ms gap). Each failed socket is closed before the next attempt. Lock acquisition has a 15-second limit. Writes have a 10-second deadline per chunk/flush, so a progressing long receipt is not cut off by an 8-second total limit. Existing chunk pacing and payload-based drain time are retained. No transmission is retried after the first write begins.

The connection test uses the same bounded connection path and lock acquisition. The native result distinguishes connection failure from an uncertain transmission.

The queue coordinates Benmi only. Uber is an independent device/application; there is no shared lock or verified “Uber is printing” signal. Hardware coexistence must be verified on the store's printer.

## Verification

- `npm run check` and `npm run check:cache-busters`
- `npm run test:pos-reliability`: API timeout/ambiguous results, stalled printing, partial success, restart, tenant isolation, targeted retry, serialization and Chromium/WebKit touch interaction.
- `APP_ENV=pilot ./gradlew :app:testDebugUnitTest :app:assembleDebug` in `apps/android-pos/android`: socket cancellation, canceled-timer isolation, long progressing operations and late completion.
- `npm run test:release` before release.

Pilot APK: `artifacts/pos-print-recovery-20261112/Blab-POS-Pilot-1.1.2.apk`, application ID `com.benmi.pos.pilot`, version code 30. It bundles the changed web files and can be installed beside the existing POS. It has separate settings/storage and needs its printer configuration. It uses the production backend; use designated test orders.

Physical acceptance still required: print Uber first, Benmi first, and both at once; then repeat with a long receipt, multiple stickers, printer power-off/reconnection and a WebView restart. Check that order buttons work during each case, paper is complete, completed parts do not print again automatically, and uncertain parts remain visible for staff review. No device was connected to ADB during implementation.
