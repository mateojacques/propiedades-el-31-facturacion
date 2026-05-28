/**
 * Thin fetch wrapper. All routes return JSON except export/PDF which return
 * binary blobs (handled by `descargar`).
 */

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function parseError(r: Response): Promise<ApiError> {
  let body: unknown = null;
  let msg = `HTTP ${r.status}`;
  try {
    body = await r.json();
    if (body && typeof body === 'object' && 'error' in body) {
      msg = String((body as { error: unknown }).error);
    }
  } catch {
    /* ignore */
  }
  return new ApiError(r.status, msg, body);
}

export function makeClient(apiBase: string) {
  async function get<T>(path: string, query?: Record<string, unknown>): Promise<T> {
    const qs = query
      ? '?' +
        new URLSearchParams(
          Object.entries(query)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => [k, String(v)])
        ).toString()
      : '';
    const r = await fetch(`${apiBase}${path}${qs}`);
    if (!r.ok) throw await parseError(r);
    return (await r.json()) as T;
  }

  async function send<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<T> {
    const r = await fetch(`${apiBase}${path}`, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw await parseError(r);
    if (r.status === 204) return undefined as T;
    return (await r.json()) as T;
  }

  async function uploadFile<T>(path: string, file: File): Promise<T> {
    const fd = new FormData();
    fd.append('archivo', file, file.name);
    const r = await fetch(`${apiBase}${path}`, { method: 'POST', body: fd });
    if (!r.ok) throw await parseError(r);
    return (await r.json()) as T;
  }

  /** Triggers a browser download for a binary endpoint. */
  async function descargar(path: string, query: Record<string, unknown>, nombreArchivo: string): Promise<void> {
    const qs =
      '?' +
      new URLSearchParams(
        Object.entries(query)
          .filter(([, v]) => v !== undefined && v !== null && v !== '')
          .map(([k, v]) => [k, String(v)])
      ).toString();
    const r = await fetch(`${apiBase}${path}${qs}`);
    if (!r.ok) throw await parseError(r);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return {
    get,
    post: <T>(path: string, body?: unknown) => send<T>('POST', path, body),
    patch: <T>(path: string, body?: unknown) => send<T>('PATCH', path, body),
    put: <T>(path: string, body?: unknown) => send<T>('PUT', path, body),
    del: <T>(path: string) => send<T>('DELETE', path),
    uploadFile,
    descargar,
  };
}

export type ApiClient = ReturnType<typeof makeClient>;
