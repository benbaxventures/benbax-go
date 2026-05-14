import type { Response } from 'express';

type ApiResponse<T> =
  | {
      ok: true;
      data: T;
      meta?: Record<string, unknown>;
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
      };
    };

export function ok<T>(res: Response, data: T, meta?: Record<string, unknown>) {
  const body: ApiResponse<T> = meta ? { ok: true, data, meta } : { ok: true, data };
  return res.json(body);
}

export function created<T>(res: Response, data: T) {
  const body: ApiResponse<T> = { ok: true, data };
  return res.status(201).json(body);
}
