package br.com.portalvila;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * "Something changed, reload" for the screens that are open. Each screen listens to one condominium, and a change only
 * reaches the screens of the condominium it happened in.
 */
@Service
class DashboardEventService {
    private record Listener(long condominiumId, SseEmitter emitter) {
    }

    private final CopyOnWriteArrayList<Listener> listeners = new CopyOnWriteArrayList<>();
    private final ExecutorService executor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "dashboard-events");
        thread.setDaemon(true);
        return thread;
    });
    private final ScheduledExecutorService heartbeat = Executors.newSingleThreadScheduledExecutor(runnable -> {
        Thread thread = new Thread(runnable, "dashboard-events-heartbeat");
        thread.setDaemon(true);
        return thread;
    });

    DashboardEventService() {
        heartbeat.scheduleAtFixedRate(this::publishHeartbeat, 15, 15, TimeUnit.SECONDS);
    }

    SseEmitter subscribe(long condominiumId) {
        SseEmitter emitter = new SseEmitter(0L);
        Listener listener = new Listener(condominiumId, emitter);
        listeners.add(listener);
        emitter.onCompletion(() -> listeners.remove(listener));
        emitter.onTimeout(() -> listeners.remove(listener));
        emitter.onError(error -> listeners.remove(listener));
        send(listener, "connected", Map.of("status", "ok"));
        return emitter;
    }

    /** Tells the screens of the current condominium, after the change is committed. */
    void publishDashboardChanged() {
        long condominiumId = TenantContext.current();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publishAsync(condominiumId);
                }
            });
            return;
        }
        publishAsync(condominiumId);
    }

    private void publishAsync(long condominiumId) {
        executor.execute(() -> {
            try {
                publishNow(condominiumId);
            } catch (RuntimeException ignored) {
                // A broken browser/event stream must never fail the request that changed data.
            }
        });
    }

    private void publishNow(long condominiumId) {
        Map<String, String> payload = Map.of(
            "type", "DASHBOARD_CHANGED",
            "at", Instant.now().toString()
        );
        for (Listener listener : listeners) {
            if (listener.condominiumId() == condominiumId) {
                send(listener, "dashboard-changed", payload);
            }
        }
    }

    private void publishHeartbeat() {
        if (listeners.isEmpty()) {
            return;
        }
        Map<String, String> payload = Map.of(
            "type", "HEARTBEAT",
            "at", Instant.now().toString()
        );
        for (Listener listener : listeners) {
            send(listener, "heartbeat", payload);
        }
    }

    private void send(Listener listener, String name, Object payload) {
        try {
            listener.emitter().send(SseEmitter.event().name(name).data(payload));
        } catch (IOException | RuntimeException ex) {
            listeners.remove(listener);
            try {
                listener.emitter().complete();
            } catch (RuntimeException ignored) {
                // Connection is already gone.
            }
        }
    }
}
