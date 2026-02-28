import { Request, Response, NextFunction } from 'express';

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = globalThis.crypto.randomUUID();
  next();
}
