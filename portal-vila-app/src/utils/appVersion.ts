// The web app is a single page: refetching data never loads newly deployed code. A published build has a
// content-hashed script name, so comparing it with the script this page is running tells us if a new
// version is available and the page should reload.
export async function reloadIfNewVersion(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined' || typeof fetch !== 'function') {
    return false;
  }
  try {
    const running = document.querySelector('script[src*="/_expo/static/js/web/"]')?.getAttribute('src');
    if (!running) {
      return false;
    }
    const response = await fetch('/', { cache: 'no-store' });
    const html = await response.text();
    const latest = html.match(/\/_expo\/static\/js\/web\/[^"']+\.js/)?.[0];
    if (latest && latest !== running) {
      window.location.reload();
      return true;
    }
  } catch {
    // offline or blocked: the caller just refreshes the data
  }
  return false;
}
