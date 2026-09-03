export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const notFound = (what = "Resource") => new HttpError(404, `${what} not found`);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const forbidden = (msg = "Forbidden") => new HttpError(403, msg);
export const unauthorized = (msg = "Unauthorized") => new HttpError(401, msg);
export const conflict = (msg: string) => new HttpError(409, msg);
