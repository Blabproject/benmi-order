package com.benmi.pos;

import org.junit.Test;
import java.io.Closeable;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

public class BoundedPrinterIoTest {
    @Test public void blockedIoClosesActualConnectionBeforeReturning() throws Exception {
        CountDownLatch closed = new CountDownLatch(1);
        AtomicBoolean stopped = new AtomicBoolean(false);
        Closeable socket = closed::countDown;
        try {
            BoundedPrinterIo.run(socket, 30, () -> {
                assertTrue(closed.await(2, TimeUnit.SECONDS));
                stopped.set(true);
                throw new IOException("socket closed");
            });
            fail("Expected cancellation");
        } catch (IOException expected) {
            assertTrue(stopped.get());
            assertEquals(0, closed.getCount());
        }
        // A new connection is independent of the failed one.
        AtomicBoolean nextClosed = new AtomicBoolean(false);
        BoundedPrinterIo.run(() -> nextClosed.set(true), 100, () -> {});
        assertFalse(nextClosed.get());
    }

    @Test public void completedOperationIsNeverClosedByItsOldTimer() throws Exception {
        CountDownLatch unexpectedlyClosed = new CountDownLatch(1);
        BoundedPrinterIo.run(unexpectedlyClosed::countDown, 30, () -> {});
        assertFalse(unexpectedlyClosed.await(100, TimeUnit.MILLISECONDS));
    }

    @Test public void longReceiptUsesProgressDeadlinesInsteadOfTotalDuration() throws Exception {
        AtomicBoolean closed = new AtomicBoolean(false);
        Closeable socket = () -> closed.set(true);
        for (int chunk = 0; chunk < 5; chunk++) {
            BoundedPrinterIo.run(socket, 250, () -> Thread.sleep(80));
        }
        assertFalse(closed.get());
    }

    @Test public void returningAfterCancellationStillReportsFailure() throws Exception {
        CountDownLatch closed = new CountDownLatch(1);
        try {
            BoundedPrinterIo.run(closed::countDown, 30, () -> assertTrue(closed.await(2, TimeUnit.SECONDS)));
            fail("Late completion must not report success");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("deadline"));
        }
    }
}
