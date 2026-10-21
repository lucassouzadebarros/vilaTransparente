package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/** The phone tells the server where to send notices once the resident allows them. */
@RestController
@CrossOrigin
@RequestMapping("/api/push-tokens")
class PushController {
    private final PushService push;
    private final CurrentUserService currentUser;

    PushController(PushService push, CurrentUserService currentUser) {
        this.push = push;
        this.currentUser = currentUser;
    }

    record PushTokenRequest(String token, String platform) {
    }

    @PostMapping
    Map<String, String> register(@RequestBody PushTokenRequest request) {
        String token = request == null || request.token() == null ? "" : request.token().trim();
        boolean expoToken = token.startsWith("ExponentPushToken[") || token.startsWith("ExpoPushToken[");
        if (!expoToken || token.length() > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Código de notificação inválido.");
        }
        String platform = request.platform() == null ? null : request.platform().trim();
        push.register(currentUser.current().id, token, platform != null && platform.length() > 20 ? platform.substring(0, 20) : platform);
        return Map.of("status", "REGISTRADO");
    }

    @DeleteMapping
    Map<String, String> unregister(@RequestParam String token) {
        push.unregister(token.trim());
        return Map.of("status", "REMOVIDO");
    }
}
