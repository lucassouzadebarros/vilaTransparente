// A calm, civic palette: one deep teal for actions, warm neutrals for surfaces, and color only where it carries meaning
// (green is money in or done, amber is waiting, red is a problem). Every text pair reaches WCAG AA (4.5:1) on its own
// background; `borderStrong` reaches 3:1 for the edges of form fields (WCAG 1.4.11). The key names stay the same as
// before (`blue` is now the brand teal) so every screen picks the new look up from here.
export const colors = {
  bg: '#F4F5F3',
  surface: '#FFFFFF',
  ink: '#16202A',
  muted: '#4F5B66',
  border: '#DCE1DE',
  borderStrong: '#7F8A84',
  green: '#16703F',
  greenSoft: '#E4F3EA',
  blue: '#0B5C6B',
  blueSoft: '#E2F0F2',
  amber: '#8A5200',
  amberSoft: '#FBF0DA',
  red: '#B42318',
  redSoft: '#FCE8E5',
  teal: '#0B5C6B',
  lilac: '#5B52A8'
};

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
