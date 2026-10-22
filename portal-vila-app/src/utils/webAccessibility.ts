import { Platform } from 'react-native';
import { colors, isDark } from '../theme';

/**
 * Web-only accessibility setup that React Native for Web does not do on its own:
 * the page language, a visible focus ring on every control, and less motion for people who ask for it.
 */
export function setupWebAccessibility() {
  if (Platform.OS !== 'web' || typeof document === 'undefined') {
    return;
  }
  document.documentElement.lang = 'pt-BR';
  // Lets the browser draw scrollbars and form controls to match the palette in use.
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  document.body.style.backgroundColor = colors.bg;

  if (document.getElementById('vila-a11y')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'vila-a11y';
  // React Native for Web switches the browser's own focus outline off, so keyboard users cannot see where they are.
  style.textContent = `
[role="button"]:focus-visible, [role="radio"]:focus-visible, [role="tab"]:focus-visible, [role="link"]:focus-visible,
button:focus-visible, a:focus-visible, [tabindex="0"]:focus-visible {
  outline: 3px solid ${colors.blue} !important;
  outline-offset: 2px !important;
}
input:focus-visible, textarea:focus-visible {
  outline: 3px solid ${colors.blue} !important;
  outline-offset: 1px !important;
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
}`;
  document.head.appendChild(style);
}
