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

@Service
class DashboardEventService {
    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();
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

    SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(0L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(error -> emitters.remove(emitter));
        send(emitter, "connected", Map.of("status", "ok"));
        return emitter;
    }

    void publishDashboardChanged() {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publishAsync();
                }
            });
            return;
        }
        publishAsync();
    }

    private void publishAsync() {
        executor.execute(() -> {
            try {
                publishNow();
            } catch (RuntimeException ignored) {
                // A broken browser/event stream must never fail the request that changed data.
            }
        });
    }

    private void publishNow() {
        Map<String, String> payload = Map.of(
            "type", "DASHBOARD_CHANGED",
            "at", Instant.now().toString()
        );
        for (SseEmitter emitter : emitters) {
            send(emitter, "dashboard-changed", payload);
        }
    }

    private void publishHeartbeat() {
        if (emitters.isEmpty()) {
            return;
        }
        Map<String, String> payload = Map.of(
            "type", "HEARTBEAT",
            "at", Instant.now().toString()
        );
        for (SseEmitter emitter : emitters) {
            send(emitter, "heartbeat", payload);
        }
    }

    private void send(SseEmitter emitter, String name, Object payload) {
        try {
            emitter.send(SseEmitter.event().name(name).data(payload));
        } catch (IOException | RuntimeException ex) {
            emitters.remove(emitter);
            try {
                emitter.complete();
            } catch (RuntimeException ignored) {
                // Connection is already gone.
            }
        }
    }
}
