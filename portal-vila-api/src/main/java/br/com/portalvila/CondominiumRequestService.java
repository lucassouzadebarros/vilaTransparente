package br.com.portalvila;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

/**
 * Requests from the public form "Quero cadastrar meu condomínio". A request creates nothing: the platform approves it
 * (which creates the condominium and invites its administration) or turns it down.
 */
@Service
class CondominiumRequestService {
    static final Set<String> STATES = Set.of(
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
        "RS", "RO", "RR", "SC", "SP", "SE", "TO");
    private static final Set<String> ASAAS_ANSWERS = Set.of("SIM", "NAO", "NAO_SEI");

    private final CondominiumRequestRepository requests;
    private final LoginAttemptLimiter limiter;

    CondominiumRequestService(CondominiumRequestRepository requests, LoginAttemptLimiter limiter) {
        this.requests = requests;
        this.limiter = limiter;
    }

    /**
     * From anyone on the internet: checked, limited per address (a few a few minutes apart) and stored. A form whose
     * hidden field was filled was sent by a robot: it is answered the same way and not stored.
     */
    void submit(CondominiumRequestForm form, HttpServletRequest http) {
        String key = LoginAttemptLimiter.key("pedido-condominio", null, http);
        limiter.check(key);
        limiter.fail(key);
        if (form.website() != null && !form.website().isBlank()) {
            return;
        }
        CondominiumRequest request = new CondominiumRequest();
        request.condominiumName = text(form.condominiumName(), 3, 140, "Informe o nome do condomínio.");
        request.city = text(form.city(), 2, 80, "Informe a cidade.");
        String state = form.state() == null ? "" : form.state().trim().toUpperCase();
        if (!STATES.contains(state)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escolha o estado (UF).");
        }
        request.state = state;
        if (form.units() == null || form.units() < 1 || form.units() > PlatformService.MAX_UNITS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Informe quantas unidades o condomínio tem (de 1 a " + PlatformService.MAX_UNITS + ").");
        }
        request.units = form.units();
        request.contactName = ManagerInviteService.cleanName(form.contactName());
        request.contactEmail = ManagerInviteService.cleanEmail(form.contactEmail());
        String phone = form.contactPhone() == null ? "" : form.contactPhone().replaceAll("[^0-9+]", "");
        if (!phone.isEmpty() && (phone.length() < 10 || phone.length() > 16)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Confira o telefone (com DDD).");
        }
        request.contactPhone = phone.isEmpty() ? null : phone;
        request.hasAsaas = form.hasAsaas() != null && ASAAS_ANSWERS.contains(form.hasAsaas()) ? form.hasAsaas() : "NAO_SEI";
        String message = form.message() == null ? "" : form.message().trim();
        if (message.length() > 1000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A mensagem pode ter até 1000 caracteres.");
        }
        request.message = message.isEmpty() ? null : message;
        requests.save(request);
    }

    List<CondominiumRequest> list(String status) {
        return status == null || status.isBlank() || "ALL".equals(status)
            ? requests.findAllByOrderByCreatedAtDesc()
            : requests.findByStatusOrderByCreatedAtDesc(status);
    }

    long pending() {
        return requests.countByStatus(CondominiumRequest.PENDING);
    }

    CondominiumRequest pendingRequest(Long id) {
        CondominiumRequest request = requests.findById(id)
            .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Pedido não encontrado."));
        if (!CondominiumRequest.PENDING.equals(request.status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Este pedido já foi respondido.");
        }
        return request;
    }

    CondominiumRequest reject(Long id, String note) {
        CondominiumRequest request = pendingRequest(id);
        decide(request, CondominiumRequest.REJECTED, note == null || note.isBlank() ? null : note.trim());
        return requests.save(request);
    }

    CondominiumRequest approved(CondominiumRequest request, Long condominiumId) {
        request.condominiumId = condominiumId;
        decide(request, CondominiumRequest.APPROVED, null);
        return requests.save(request);
    }

    private static void decide(CondominiumRequest request, String status, String note) {
        if (note != null && note.length() > 500) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A observação pode ter até 500 caracteres.");
        }
        request.status = status;
        request.decidedAt = LocalDateTime.now();
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        request.decidedBy = authentication == null ? null : authentication.getName();
        request.decisionNote = note;
    }

    private static String text(String raw, int min, int max, String message) {
        String value = raw == null ? "" : raw.trim().replaceAll("\\s+", " ");
        if (value.length() < min || value.length() > max) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
        }
        return value;
    }
}
