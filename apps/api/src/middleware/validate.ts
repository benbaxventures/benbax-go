import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject } from 'zod';
import { badRequest } from '../utils/http';

export function validate(schema: AnyZodObject) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      return next(
        badRequest('Validation failed', {
          issues: result.error.flatten(),
        })
      );
    }

    req.body = result.data.body ?? req.body;
    req.query = result.data.query ?? req.query;
    req.params = result.data.params ?? req.params;
    return next();
  };
}
