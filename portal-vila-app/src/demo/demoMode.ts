import type { Role, Session } from '../types';

/**
 * Demonstration mode: the app answers with example data from the device and sends nothing to the server.
 * It exists so anyone (a store reviewer, a visitor) can see every screen without an account.
 */
let active = false;
let role: Role = 'ADMIN';

export const DEMO_TOKEN = 'demo-session';

export const isDemoMode = () => active;
export const demoRole = () => role;

export function startDemoMode(next: Role) {
  active = true;
  role = next;
}

export function stopDemoMode() {
  active = false;
  role = 'ADMIN';
}

/** The session of the demonstration: never stored, gone when the app is closed. */
export function demoSession(next: Role): Session {
  return {
    token: DEMO_TOKEN,
    name: next === 'ADMIN' ? 'Administração (exemplo)' : 'Morador 01 (exemplo)',
    email: 'demonstracao@exemplo.invalid',
    role: next,
    residentId: next === 'RESIDENT' ? 1 : null,
    mustChangePassword: false,
    demo: true
  };
}
