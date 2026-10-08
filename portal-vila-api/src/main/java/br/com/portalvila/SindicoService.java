package br.com.portalvila;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * One resident can be the síndico. Besides voting as a house, the síndico manages budgets and the
 * services they are linked to, like the admin. Money (Pix, expenses, finishing a service) stays with the admin.
 */
@Service
class SindicoService {
    static final String ROLE = "SINDICO";

    private final AppUserRepository users;
    private final ResidentRepository residents;
    private final HouseRepository houses;

    SindicoService(AppUserRepository users, ResidentRepository residents, HouseRepository houses) {
        this.users = users;
        this.residents = residents;
        this.houses = houses;
    }

    @Transactional(readOnly = true)
    public SindicoResponse current() {
        return users.findByRole(ROLE).stream()
            .filter(user -> user.active && user.residentId != null)
            .findFirst()
            .flatMap(user -> residents.findById(user.residentId))
            .map(resident -> new SindicoResponse(
                resident.id,
                resident.name,
                resident.houseId,
                houses.findById(resident.houseId).map(house -> house.label).orElse("Casa " + resident.houseId)
            ))
            .orElse(SindicoResponse.none());
    }

    @Transactional
    public SindicoResponse choose(Long residentId) {
        AppUser chosen = null;
        if (residentId != null) {
            Resident resident = residents.findById(residentId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Morador não encontrado."));
            if (!"ACTIVE".equals(resident.status)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Escolha um morador ativo para ser síndico.");
            }
            chosen = users.findByResidentId(resident.id)
                .filter(user -> user.active)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Este morador ainda não tem acesso ao portal."));
            if ("ADMIN".equals(chosen.role)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "A conta admin já tem essas permissões.");
            }
        }
        for (AppUser previous : users.findByRole(ROLE)) {
            if (chosen == null || !previous.id.equals(chosen.id)) {
                previous.role = "RESIDENT";
                users.save(previous);
            }
        }
        if (chosen != null) {
            chosen.role = ROLE;
            users.save(chosen);
        }
        return current();
    }
}
