package com.benmi.pos;

import java.io.Closeable;
import java.io.IOException;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/** Cancels the actual I/O before its caller releases the printer queue. */
final class BoundedPrinterIo {
    private static final ScheduledExecutorService TIMER = Executors.newScheduledThreadPool(2, runnable -> {
        Thread thread = new Thread(runnable, "printer-io-deadline");
        thread.setDaemon(true);
        return thread;
    });

    interface Action { void run() throws Exception; }

    static void run(Closeable connection, long timeoutMs, Action action) throws Exception {
        final Object monitor = new Object();
        final boolean[] active = { true };
        final boolean[] expired = { false };
        ScheduledFuture<?> deadline = TIMER.schedule(() -> {
            synchronized (monitor) {
                if (!active[0]) return;
                expired[0] = true;
                // Keep completion synchronized with cancellation. The old job
                // must stop using this socket before another job can start.
                try { connection.close(); } catch (IOException ignored) { }
            }
        }, timeoutMs, TimeUnit.MILLISECONDS);
        try {
            action.run();
        } finally {
            synchronized (monitor) { active[0] = false; }
            deadline.cancel(false);
        }
        if (expired[0]) throw new IOException("Printer I/O deadline exceeded");
    }
}
