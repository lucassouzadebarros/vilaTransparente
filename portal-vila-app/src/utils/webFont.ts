import { Platform } from 'react-native';
import { Asset } from 'expo-asset';

// Inter, the typeface of the app on the web. The files come with the @expo-google-fonts/inter package and are served
// with the app; `font-display: swap` shows the text in the system font at once and switches when Inter has loaded.
const faces: Array<[number, number]> = [
  [400, require('@expo-google-fonts/inter/400Regular/Inter_400Regular.ttf')],
  [500, require('@expo-google-fonts/inter/500Medium/Inter_500Medium.ttf')],
  [600, require('@expo-google-fonts/inter/600SemiBold/Inter_600SemiBold.ttf')],
  [700, require('@expo-google-fonts/inter/700Bold/Inter_700Bold.ttf')]
];

/** Web only: declares the Inter faces and makes every piece of text use them. Phones keep their own system font. */
export function setupWebFont() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || document.getElementById('vila-font')) {
    return;
  }
  const rules = faces
    .map(
      ([weight, module]) =>
        `@font-face{font-family:'Inter';font-style:normal;font-weight:${weight};font-display:swap;src:url('${Asset.fromModule(module).uri}') format('truetype');}`
    )
    .join('\n');
  const style = document.createElement('style');
  style.id = 'vila-font';
  style.textContent = `${rules}
body, body h1, body h2, body h3, body h4, body h5, body h6, body p, body div, body span, body input, body textarea, body button, body a, body label {
  font-family: 'Inter', -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
}`;
  document.head.appendChild(style);
}
