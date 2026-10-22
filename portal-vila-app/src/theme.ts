import { Appearance, Platform } from 'react-native';

// A calm, civic palette: one deep teal for actions, warm neutrals for surfaces, and color only where it carries meaning
// (green is money in or done, amber is waiting, red is a problem). Every text pair reaches WCAG AA (4.5:1) on its own
// background, in the light and in the dark palette; `borderStrong` reaches 3:1 for the edges of form fields (WCAG 1.4.11).
// The key names are the same in both, so a screen never has to know which one is in use. (`blue` is the brand teal.)
const lightColors = {
  bg: '#F4F5F3',
  surface: '#FFFFFF',
  surfaceAlt: '#F2F4F2',
  ink: '#16202A',
  muted: '#4F5B66',
  border: '#DCE1DE',
  borderStrong: '#7F8A84',
  track: '#E3E8E5',
  pressed: '#EEF1EF',
  green: '#16703F',
  greenSoft: '#E4F3EA',
  greenBorder: '#B8E2D1',
  blue: '#0B5C6B',
  blueSoft: '#E2F0F2',
  blueBorder: '#C8E0E4',
  amber: '#8A5200',
  amberSoft: '#FBF0DA',
  red: '#B42318',
  redSoft: '#FCE8E5',
  dangerBorder: '#F0C4BF',
  teal: '#0B5C6B',
  lilac: '#5B52A8'
};

const darkColors: typeof lightColors = {
  bg: '#0F161C',
  surface: '#18212A',
  surfaceAlt: '#1F2A34',
  ink: '#E8EDF1',
  muted: '#A9B4BE',
  border: '#2B3742',
  borderStrong: '#7B8794',
  track: '#2B3742',
  pressed: '#202C37',
  green: '#5BC48B',
  greenSoft: '#16352A',
  greenBorder: '#2C5E47',
  blue: '#5CB8C9',
  blueSoft: '#173842',
  blueBorder: '#285560',
  amber: '#F0B35C',
  amberSoft: '#3B2E14',
  red: '#F28B82',
  redSoft: '#3E1D1B',
  dangerBorder: '#6B2E2A',
  teal: '#5CB8C9',
  lilac: '#A79BF0'
};

export type ThemeChoice = 'auto' | 'light' | 'dark';

const STORAGE_KEY = 'vila-theme';

/** What the person picked on the web ("auto" follows the system); phones always follow the system. */
export function savedThemeChoice(): ThemeChoice {
  if (Platform.OS === 'web') {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') {
        return saved;
      }
    } catch {
      // storage can be blocked; the system preference decides then
    }
  }
  return 'auto';
}

function systemPrefersDark() {
  if (Platform.OS === 'web') {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  return Appearance.getColorScheme() === 'dark';
}

const choice = savedThemeChoice();

/** The palette is picked once, when the app opens, so every style in the app is built from the same one. */
export const isDark = choice === 'dark' || (choice === 'auto' && systemPrefersDark());

export const colors = isDark ? darkColors : lightColors;

/** Web only: remembers the choice and reloads, because the styles are built from the palette when the app starts. */
export function setThemeChoice(next: ThemeChoice) {
  if (Platform.OS !== 'web') {
    return;
  }
  try {
    if (next === 'auto') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  } catch {
    // nothing to remember the choice in; the page still reloads with the system preference
  }
  window.location.reload();
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24
};

/** Smallest comfortable touch/click target, in px. */
export const TOUCH_TARGET = 44;

/** Corner radius of cards and of controls. */
export const radius = {
  card: 12,
  control: 10
};
