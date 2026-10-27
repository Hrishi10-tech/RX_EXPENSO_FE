/**
 * HTTP client for the Expenso API. Adds the bearer token, refreshes once on `401 token_expired`
 * (single-flight through the Session) and retries, and ends the session on `session_ended` or `deactivated`.
 * Errors come back as ApiError with the server's code, message and field details.
 */
import { Session, SessionError } from './session';

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
  /** Field messages from a `400 validation` answer, keyed by field. */
  get fields(): Record<string, string> {
    const out: Record<string, string> = {};
    if (Array.isArray(this.details)) for (const d of this.details as Array<{ field?: string; message?: string }>) if (d.field) out[d.field] = d.message ?? 'Check this field.';
    return out;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;

/** Where the API lives: same origin by default, or VITE_API_BASE (an origin, optionally with a path prefix). */
export interface ApiBase { origin: string; prefix: string; root: string; sameOrigin: boolean }
export function apiBase(raw: string | undefined, location?: { origin: string }): ApiBase {
  const loc = location ?? (typeof window !== 'undefined' ? window.location : { origin: 'http://localhost' });
  if (!raw) return { origin: loc.origin, prefix: '', root: '/api/v1', sameOrigin: true };
  const u = new URL(raw, loc.origin);
  const prefix = u.pathname.replace(/\/+$/, '');
  const sameOrigin = u.origin === loc.origin && !prefix;
  return { origin: u.origin, prefix, root: sameOrigin ? '/api/v1' : `${u.origin}${prefix}/api/v1`, sameOrigin };
}

export type Query = Record<string, string | number | boolean | null | undefined | string[]>;

export interface RequestOptions {
  body?: unknown;
  form?: FormData;
  query?: Query;
  signal?: AbortSignal;
  /** Send without a token (sign-in endpoints). */
  anonymous?: boolean;
}

export function qs(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) continue;
    p.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function toApiError(res: Response): Promise<ApiError> {
  let code = `http_${res.status}`, message = res.status >= 500 ? 'Something went wrong on the server. Try again.' : 'The request was refused.', details: unknown;
  try {
    const j = await res.json();
    if (j?.error) { code = j.error.code ?? code; message = j.error.message ?? message; details = j.error.details ?? undefined; }
  } catch { /* not JSON */ }
  if (res.status === 413) { code = code.startsWith('http_') ? 'file_too_large' : code; message = 'The file is larger than the 20 MB limit.'; }
  return new ApiError(res.status, code, message, details);
}

/** Reads the file name from Content-Disposition, preferring the UTF-8 form. */
export function filenameFrom(disposition: string | null, fallback = 'download'): string {
  if (!disposition) return fallback;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(disposition);
  if (star) { try { return decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')); } catch { /* fall through */ } }
  const plain = /filename\s*=\s*"([^"]*)"/.exec(disposition) ?? /filename\s*=\s*([^;]+)/.exec(disposition);
  return plain ? plain[1].trim() : fallback;
}

export class Api {
  readonly root: string;
  constructor(public session: Session, readonly base: ApiBase, private fetchImpl: typeof fetch = (...a) => fetch(...a)) {
    this.root = base.root;
  }

  /** Resolves "/api/v1/..." paths from API responses (attachment and export URLs) and plain "/finance/..." paths. */
  url(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    if (path.startsWith('/api/')) return this.base.sameOrigin ? path : `${this.base.origin}${this.base.prefix}${path}`;
    return `${this.root}${path}`;
  }

  private async send(method: string, path: string, o: RequestOptions, retried = false): Promise<Response> {
    const headers: Record<string, string> = {};
    let body: BodyInit | undefined;
    if (o.form) body = o.form;
    else if (o.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(o.body); }
    const used = this.session.accessToken;
    if (!o.anonymous) {
      if (!used) throw new ApiError(401, 'signed_out', 'You’re signed out. Sign in again.');
      headers.Authorization = `Bearer ${used}`;
    }
    let res: Response;
    try {
      res = await this.fetchImpl(this.url(path) + qs(o.query), { method, headers, body, signal: o.signal });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') throw e;
      throw new ApiError(0, 'network', 'Can’t reach Expenso. Check the connection and try again.');
    }
    if (res.status === 401 && !o.anonymous) {
      const err = await toApiError(res);
      if (err.code === 'token_expired' && !retried) {
        // Another request may already have refreshed while this one was in flight.
        if (this.session.accessToken && this.session.accessToken !== used) return this.send(method, path, o, true);
        try { await this.session.refresh(); } catch (e) {
          if (e instanceof SessionError) throw new ApiError(e.status, e.code, e.message, e.details);
          throw e;
        }
        return this.send(method, path, o, true);
      }
      if (err.code === 'session_ended' || err.code === 'deactivated' || err.code === 'unauthorized' || err.code === 'token_expired') {
        if (this.session.getState().status === 'signedIn') this.session.end(err.code === 'deactivated' ? 'deactivated' : 'session_ended');
      }
      throw err;
    }
    if (!res.ok) throw await toApiError(res);
    return res;
  }

  async request<T>(method: string, path: string, o: RequestOptions = {}): Promise<T> {
    const res = await this.send(method, path, o);
    if (res.status === 204) return undefined as T;
    const type = res.headers.get('content-type') ?? '';
    if (type.includes('application/json')) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  }

  get<T>(path: string, query?: Query, signal?: AbortSignal) { return this.request<T>('GET', path, { query, signal }); }
  post<T>(path: string, body?: unknown) { return this.request<T>('POST', path, { body: body ?? {} }); }
  put<T>(path: string, body?: unknown) { return this.request<T>('PUT', path, { body: body ?? {} }); }
  patch<T>(path: string, body?: unknown) { return this.request<T>('PATCH', path, { body: body ?? {} }); }
  del<T>(path: string, body?: unknown) { return this.request<T>('DELETE', path, body === undefined ? {} : { body }); }
  postForm<T>(path: string, form: FormData) { return this.request<T>('POST', path, { form }); }
  anon<T>(method: string, path: string, body?: unknown) { return this.request<T>(method, path, { body, anonymous: true }); }

  /** A protected file as a blob (attachments and exports need the bearer token), with its name. */
  async blob(path: string, query?: Query, signal?: AbortSignal): Promise<{ blob: Blob; filename: string; type: string }> {
    const res = await this.send('GET', path, { query, signal });
    const blob = await res.blob();
    return { blob, filename: filenameFrom(res.headers.get('content-disposition'), path.split('/').pop() || 'download'), type: res.headers.get('content-type') ?? blob.type };
  }
}
