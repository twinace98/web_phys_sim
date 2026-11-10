// Hash routes: '#/' (contents) and '#/ch/02?s=scene&lang=en&param=value'.

export type Route = { page: 'home'; query: URLSearchParams } | { page: 'chapter'; ch: number; query: URLSearchParams };

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [path, qs = ''] = raw.split('?');
  const query = new URLSearchParams(qs);
  const m = /^\/ch\/(\d{1,2})\/?$/.exec(path);
  if (m) return { page: 'chapter', ch: Number(m[1]), query };
  return { page: 'home', query };
}

export function chapterHash(ch: number, query: Record<string, string> = {}): string {
  const qs = new URLSearchParams(query).toString();
  return `#/ch/${String(ch).padStart(2, '0')}${qs ? `?${qs}` : ''}`;
}

export function homeHash(query: Record<string, string> = {}): string {
  const qs = new URLSearchParams(query).toString();
  return `#/${qs ? `?${qs}` : ''}`;
}
