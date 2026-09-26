import type { ApiErrorCode } from '@mrd/shared';

export interface FieldIssue {
  field: string;
  message: string;
}

/**
 * The only error type the routes throw. The error middleware turns it into the
 * documented envelope; anything else becomes a 500 with no internals leaked.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: FieldIssue[] | undefined;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static validation(message: string, details: FieldIssue[]): ApiError {
    return new ApiError(400, 'VALIDATION_ERROR', message, details);
  }

  static notFound(message: string): ApiError {
    return new ApiError(404, 'NOT_FOUND', message);
  }
}
