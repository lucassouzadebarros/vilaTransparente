package br.com.portalvila;

import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

@Service
class DashboardEventService {
    private final CopyOnWriteArrayList<SseEmitter> emitters = new CopyOnWriteArrayList<>();

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
                    publishNow();
                }
            });
            return;
        }
        publishNow();
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

    private void send(SseEmitter emitter, String name, Object payload) {
        try {
            emitter.send(SseEmitter.event().name(name).data(payload));
        } catch (IOException | IllegalStateException ex) {
            emitters.remove(emitter);
        }
    }
}
