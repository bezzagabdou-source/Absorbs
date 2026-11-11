export class AppError extends Error {
  constructor(public code: string, public status = 400, public fields?: Record<string, string[]>) { super(code); }
}
export function assertFound<T>(value: T | undefined | null, code = "not_found"): asserts value is T {
  if (value == null) throw new AppError(code, 404);
}
