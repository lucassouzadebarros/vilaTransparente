package br.com.portalvila;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Notices on the phone through Expo's push service. A phone only has a token after the app is built for it and the
 * resident allows notices, so until then there is nobody to send to and nothing leaves the server. Sending never
 * breaks the action that caused it: a failure is only logged, and it happens after the transaction is saved.
 */
@Service
class PushService {
    private static final Logger log = LoggerFactory.getLogger(PushService.class);
    private static final int BATCH = 100;

    private final PushTokenRepository tokens;
    private final AppUserRepository users;
    private final ObjectMapper json;
    private final boolean enabled;
    private final String url;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    PushService(
        PushTokenRepository tokens,
        AppUserRepository users,
        ObjectMapper json,
        @Value("${portal.push.enabled:true}") boolean enabled,
        @Value("${portal.push.url:https://exp.host/--/api/v2/push/send}") String url
    ) {
        this.tokens = tokens;
        this.users = users;
        this.json = json;
        this.enabled = enabled;
        this.url = url;
    }

    /** Remembers a phone for the signed-in user. The same phone moves to whoever signed in last. */
    void register(Long userId, String token, String platform) {
        PushToken stored = tokens.findByToken(token).orElseGet(PushToken::new);
        stored.userId = userId;
        stored.token = token;
        stored.platform = platform;
        stored.updatedAt = java.time.LocalDateTime.now();
        tokens.save(stored);
    }

    void unregister(String token) {
        tokens.deleteByToken(token);
    }

    /** Everyone who lives in the condominium: residents and the síndico. */
    void notifyResidents(String title, String body, Map<String, Object> data) {
        List<Long> ids = users.findByCondominiumId(TenantContext.current()).stream()
            .filter(user -> user.active && user.residentId != null)
            .map(user -> user.id)
            .toList();
        send(ids, title, body, data);
    }

    void notifyUsers(List<Long> userIds, String title, String body, Map<String, Object> data) {
        send(userIds, title, body, data);
    }

    void notifyUser(Long userId, String title, String body, Map<String, Object> data) {
        if (userId != null) {
            send(List.of(userId), title, body, data);
        }
    }

    private void send(List<Long> userIds, String title, String body, Map<String, Object> data) {
        if (!enabled || userIds.isEmpty()) {
            return;
        }
        List<String> destinations = tokens.findByUserIdIn(userIds).stream().map(token -> token.token).distinct().toList();
        if (destinations.isEmpty()) {
            return;
        }
        afterCommit(() -> CompletableFuture.runAsync(() -> deliver(destinations, title, body, data)));
    }

    private void deliver(List<String> destinations, String title, String body, Map<String, Object> data) {
        try {
            for (int from = 0; from < destinations.size(); from += BATCH) {
                List<Map<String, Object>> messages = new ArrayList<>();
                for (String destination : destinations.subList(from, Math.min(destinations.size(), from + BATCH))) {
                    messages.add(Map.of("to", destination, "title", title, "body", body, "sound", "default", "data", data));
                }
                HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(messages)))
                    .build();
                HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
                if (response.statusCode() >= 300) {
                    log.warn("Push service answered {} for {} message(s)", response.statusCode(), messages.size());
                }
            }
        } catch (Exception e) {
            log.warn("Could not send push notices: {}", e.toString());
        }
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }
}
