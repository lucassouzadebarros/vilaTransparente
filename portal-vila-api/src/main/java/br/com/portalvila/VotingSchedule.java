package br.com.portalvila;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs by the clock, in São Paulo time: votings whose deadline has passed close by themselves (every hour, so a
 * voting never stays open for long after the last day), and the houses that have not voted are reminded at 9 a.m.
 */
@Component
class VotingSchedule {
    private static final Logger log = LoggerFactory.getLogger(VotingSchedule.class);

    private final BudgetVotingService voting;

    VotingSchedule(BudgetVotingService voting) {
        this.voting = voting;
    }

    @Scheduled(cron = "0 10 * * * *", zone = "America/Sao_Paulo")
    void closeExpiredVotings() {
        try {
            int closed = voting.expireDue(BudgetVotingService.today());
            if (closed > 0) {
                log.info("{} voting(s) closed by deadline", closed);
            }
        } catch (RuntimeException e) {
            log.warn("Could not close expired votings: {}", e.toString());
        }
    }

    @Scheduled(cron = "0 0 9 * * *", zone = "America/Sao_Paulo")
    void remindPendingHouses() {
        try {
            voting.remindPending(BudgetVotingService.today());
        } catch (RuntimeException e) {
            log.warn("Could not send voting reminders: {}", e.toString());
        }
    }
}
