package br.com.portalvila;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs by the clock, in São Paulo time: votings whose deadline has passed close by themselves (every hour, so a
 * voting never stays open for long after the last day), and the houses that have not voted are reminded at 9 a.m.
 * Each active condominium in turn, each in its own transaction; one that fails does not stop the others.
 */
@Component
class VotingSchedule {
    private static final Logger log = LoggerFactory.getLogger(VotingSchedule.class);

    private final BudgetVotingService voting;
    private final CondominiumRepository condominiums;

    VotingSchedule(BudgetVotingService voting, CondominiumRepository condominiums) {
        this.voting = voting;
        this.condominiums = condominiums;
    }

    @Scheduled(cron = "0 10 * * * *", zone = "America/Sao_Paulo")
    void closeExpiredVotings() {
        for (Condominium condominium : condominiums.findByStatusOrderByIdAsc(Condominium.ACTIVE)) {
            try {
                int closed = TenantContext.callAs(condominium.id, () -> voting.expireDue(BudgetVotingService.today()));
                if (closed > 0) {
                    log.info("{} voting(s) closed by deadline in condominium {}", closed, condominium.id);
                }
            } catch (RuntimeException e) {
                log.warn("Could not close expired votings in condominium {}: {}", condominium.id, e.toString());
            }
        }
    }

    @Scheduled(cron = "0 0 9 * * *", zone = "America/Sao_Paulo")
    void remindPendingHouses() {
        for (Condominium condominium : condominiums.findByStatusOrderByIdAsc(Condominium.ACTIVE)) {
            try {
                TenantContext.callAs(condominium.id, () -> voting.remindPending(BudgetVotingService.today()));
            } catch (RuntimeException e) {
                log.warn("Could not send voting reminders in condominium {}: {}", condominium.id, e.toString());
            }
        }
    }
}
