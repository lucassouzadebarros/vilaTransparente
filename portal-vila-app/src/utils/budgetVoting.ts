import { Budget, BudgetVoteChoice, BudgetVoting } from '../types';

/** Status shown on the badge: a budget under review is waiting for the houses' vote. */
export function budgetBadgeStatus(status: Budget['status']) {
  return status === 'EM_ANALISE' ? 'EM_VOTACAO' : status;
}

/** The cheapest quote still in the race (refused and cancelled ones do not count). */
export function lowestQuoteId(quotes: Budget[]) {
  const live = quotes.filter((quote) => quote.status === 'EM_ANALISE' || quote.status === 'APROVADO');
  return [...live].sort((a, b) => a.amount - b.amount)[0]?.id;
}

export function voteLabel(vote?: BudgetVoteChoice | null) {
  return vote === 'APROVAR' ? 'Aprovar' : vote === 'RECUSAR' ? 'Recusar' : '';
}

export function awaitingMyVote(voting?: BudgetVoting | null) {
  return Boolean(voting?.open && voting.canVote && !voting.myVote);
}

/** One-line score, e.g. "2 aprovam · 1 recusa · 1 aguardando". */
export function votingScore(voting: BudgetVoting) {
  const parts = [
    `${voting.approveVotes} ${voting.approveVotes === 1 ? 'aprova' : 'aprovam'}`,
    `${voting.rejectVotes} ${voting.rejectVotes === 1 ? 'recusa' : 'recusam'}`
  ];
  if (voting.open) {
    parts.push(`${voting.pendingVotes} aguardando`);
  }
  return parts.join(' · ');
}

/** What the result would be if the admin closed the voting now. */
export function closingResult(voting: BudgetVoting) {
  const voted = voting.approveVotes + voting.rejectVotes;
  return voted >= voting.votesToApprove && voting.approveVotes > voting.rejectVotes ? 'Aprovado' : 'Recusado';
}

/**
 * What the deadline of an open voting means today: "Vota até 28/10 (faltam 3 dias)", "Último dia para votar: hoje".
 * Empty when there is no deadline.
 */
export function deadlineLabel(deadline?: string | null, today: Date = new Date()) {
  if (!deadline) {
    return '';
  }
  const [year, month, day] = deadline.slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) {
    return '';
  }
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const left = Math.round((new Date(year, month - 1, day).getTime() - startOfToday) / 86_400_000);
  const date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}`;
  if (left < 0) {
    return `Prazo terminou em ${date}`;
  }
  if (left === 0) {
    return 'Último dia para votar: hoje';
  }
  if (left === 1) {
    return `Vota até amanhã (${date})`;
  }
  return `Vota até ${date} (faltam ${left} dias)`;
}

export function formatVotingDate(value?: string | null) {
  if (!value) {
    return '';
  }
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
