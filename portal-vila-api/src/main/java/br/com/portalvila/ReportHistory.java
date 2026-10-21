package br.com.portalvila;

import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

/**
 * Writes the history of a problem report. Whoever acted is shown by role or house ("Casa 10", "Administração"),
 * never by name, because every resident can read the history.
 */
@Service
class ReportHistory {
    private static final int MESSAGE_LIMIT = 1000;

    private final ProblemReportEventRepository events;
    private final AppUserRepository users;
    private final ResidentRepository residents;
    private final HouseRepository houses;

    ReportHistory(ProblemReportEventRepository events, AppUserRepository users, ResidentRepository residents, HouseRepository houses) {
        this.events = events;
        this.users = users;
        this.residents = residents;
        this.houses = houses;
    }

    ProblemReportEvent record(Long reportId, String kind, String message) {
        ProblemReportEvent event = new ProblemReportEvent();
        event.reportId = reportId;
        event.kind = kind;
        event.author = currentAuthor();
        event.message = message.length() > MESSAGE_LIMIT ? message.substring(0, MESSAGE_LIMIT) : message;
        event.createdAt = LocalDateTime.now();
        return events.save(event);
    }

    java.util.List<ProblemReportEvent> of(Long reportId) {
        return events.findByReportIdOrderByCreatedAtAscIdAsc(reportId);
    }

    private String currentAuthor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || authentication instanceof AnonymousAuthenticationToken || authentication.getName() == null) {
            return "Sistema";
        }
        AppUser user = users.findByEmailIgnoreCase(authentication.getName()).orElse(null);
        if (user == null) {
            return "Sistema";
        }
        if ("ADMIN".equals(user.role)) {
            return "Administração";
        }
        if ("SINDICO".equals(user.role)) {
            return "Síndico";
        }
        if (user.residentId == null) {
            return "Morador";
        }
        return residents.findById(user.residentId)
            .flatMap(resident -> houses.findById(resident.houseId))
            .map(house -> house.label)
            .orElse("Morador");
    }
}
