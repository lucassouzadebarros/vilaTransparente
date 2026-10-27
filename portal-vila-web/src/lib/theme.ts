import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'vila-plataforma-tema';
const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)');

function saved(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'auto' && systemDark().matches);
  document.documentElement.classList.toggle('dark', dark);
}

/** Light, dark, or whatever the computer uses ("auto"); remembered in this browser. */
export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(saved);

  useEffect(() => {
    apply(choice);
    if (choice !== 'auto') return;
    const media = systemDark();
    const follow = () => apply('auto');
    media.addEventListener('change', follow);
    return () => media.removeEventListener('change', follow);
  }, [choice]);

  const choose = useCallback((next: ThemeChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice lasts until the page is closed.
    }
    setChoice(next);
  }, []);

  return { choice, choose };
}
