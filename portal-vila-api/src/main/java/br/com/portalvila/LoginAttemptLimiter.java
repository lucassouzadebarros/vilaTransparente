package br.com.portalvila;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Slows down password guessing: after {@value #MAX_FAILURES} wrong answers in {@link #WINDOW} the same e-mail from the
 * same address is refused for the rest of the window. The key includes the address so a stranger cannot lock the
 * real owner out. Kept in memory: the API runs as a single instance.
 */
@Component
class LoginAttemptLimiter {
    static final int MAX_FAILURES = 5;
    static final Duration WINDOW = Duration.ofMinutes(10);
    private static final int CLEANUP_THRESHOLD = 5_000;

    private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();
    private final Clock clock;

    LoginAttemptLimiter() {
        this(Clock.systemUTC());
    }

    LoginAttemptLimiter(Clock clock) {
        this.clock = clock;
    }

    static String key(String scope, String email, HttpServletRequest request) {
        return scope + "|" + (email == null ? "" : email.trim().toLowerCase()) + "|" + clientAddress(request);
    }

    /** The last X-Forwarded-For entry is the one the platform's proxy added; the first can be forged by the caller. */
    static String clientAddress(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            String[] parts = forwarded.split(",");
            return parts[parts.length - 1].trim();
        }
        return request.getRemoteAddr();
    }

    void check(String key) {
        Deque<Instant> recent = failures.get(key);
        if (recent == null) {
            return;
        }
        int count;
        synchronized (recent) {
            prune(recent);
            count = recent.size();
        }
        if (count >= MAX_FAILURES) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Muitas tentativas. Aguarde alguns minutos e tente de novo.");
        }
    }

    void fail(String key) {
        if (failures.size() > CLEANUP_THRESHOLD) {
            failures.entrySet().removeIf(entry -> {
                synchronized (entry.getValue()) {
                    prune(entry.getValue());
                    return entry.getValue().isEmpty();
                }
            });
        }
        Deque<Instant> recent = failures.computeIfAbsent(key, ignored -> new ArrayDeque<>());
        synchronized (recent) {
            prune(recent);
            recent.addLast(clock.instant());
        }
    }

    void succeed(String key) {
        failures.remove(key);
    }

    private void prune(Deque<Instant> recent) {
        Instant limit = clock.instant().minus(WINDOW);
        while (!recent.isEmpty() && recent.peekFirst().isBefore(limit)) {
            recent.removeFirst();
        }
    }
}
