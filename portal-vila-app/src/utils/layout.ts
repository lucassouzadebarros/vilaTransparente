import { Platform, useWindowDimensions } from 'react-native';

/** From this window width the web app shows a side menu next to the content, as a desktop program would. */
export const WIDE_BREAKPOINT = 960;

/** True on the web when the window is wide enough for the side menu. Phones and narrow windows keep the bottom bar. */
export function useWideLayout() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_BREAKPOINT;
}

/** Widest a screen's content gets; the side menu leaves the rest of the window empty on purpose, for easy reading. */
export const CONTENT_MAX_WIDTH = 760;
