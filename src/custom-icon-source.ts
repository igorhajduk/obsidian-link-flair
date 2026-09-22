import { customIconUrl, MAX_IMPORT_BYTES } from './custom-icons';
import { iconCandidates, type IconTheme, type WebRequest, type WebResponse } from './metadata';

/** Explicit import accepts either an image or a page declaring its favicon. */
export async function importIconSource(value: string, request: WebRequest, decode: (bytes: ArrayBuffer, type: string) => Promise<string>, theme: IconTheme): Promise<string> {
  const url = customIconUrl(value);
  if (!url) throw new Error('Enter a website or image URL without embedded credentials.');
  const fetch = async (href: string): Promise<WebResponse> => {
    let timer: number | undefined;
    try {
      const response = await Promise.race([
        request(href),
        new Promise<never>((_resolve, reject) => { timer = window.setTimeout(() => reject(new Error('The request timed out. Try another website or choose a file.')), 10_000); }),
      ]);
      if (response.status < 200 || response.status >= 300) throw new Error(`The website returned ${response.status}. Try another URL or choose a file.`);
      if (response.arrayBuffer.byteLength > MAX_IMPORT_BYTES) throw new Error('The response is larger than 2 MB. Try a direct image URL or choose a file.');
      return response;
    } finally { window.clearTimeout(timer); }
  };
  const type = (response: WebResponse) => Object.entries(response.headers).find(([key]) => key.toLowerCase() === 'content-type')?.[1]?.split(';')[0]?.trim().toLowerCase() ?? '';
  let response: WebResponse;
  try { response = await fetch(url); }
  catch (error) { throw new Error(error instanceof Error ? error.message : 'Could not reach this URL. Check your connection or choose a file.'); }
  if (type(response).startsWith('image/')) return decode(response.arrayBuffer, type(response));
  if (!['text/html', 'application/xhtml+xml'].includes(type(response))) throw new Error('This URL is neither a web page nor an image. Try another URL or choose a file.');
  const doc = new DOMParser().parseFromString(response.text, 'text/html');
  const candidates = iconCandidates(doc, url, theme, true).slice(0, 3).map(candidate => candidate.href);
  candidates.push(new URL('/favicon.ico', url).href);
  for (const href of new Set(candidates)) {
    try {
      const icon = await fetch(href);
      if (!type(icon).startsWith('image/')) continue;
      return await decode(icon.arrayBuffer, type(icon));
    } catch { /* Try the next declared icon before reporting failure. */ }
  }
  throw new Error('No usable favicon found on this page. Try another website, a direct image URL, or choose a file.');
}
