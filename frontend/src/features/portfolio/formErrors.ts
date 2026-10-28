import { ApiError } from '../../lib/api/client';

/**
 * Splits a failed save into messages beside fields and one message for the form.
 *
 * - `422 VALIDATION_FAILED`: each `details[].field` the form shows goes beside its input
 *   (after `prefix` is stripped — the move-in sheet's new tenant arrives as `tenant.phone`).
 *   Fields the form does not show are kept in the general message rather than lost.
 * - A conflict listed in `conflicts` (`PHONE_TAKEN` → `phone`) goes beside that field,
 *   worded by `describe`.
 * - Anything else becomes the general message via `describe`.
 */
export function splitFormError(
  error: unknown,
  {
    fields,
    conflicts = {},
    prefix = '',
    describe,
  }: {
    fields: readonly string[];
    conflicts?: Record<string, string>;
    prefix?: string;
    describe: (error: unknown) => string;
  },
): { fieldErrors: Record<string, string>; general: string | null } {
  const fieldErrors: Record<string, string> = {};

  if (error instanceof ApiError && error.code === 'VALIDATION_FAILED') {
    const leftover: string[] = [];
    for (const { field, message } of error.details) {
      const name = prefix && field.startsWith(prefix) ? field.slice(prefix.length) : field;
      if (fields.includes(name)) {
        if (!(name in fieldErrors)) fieldErrors[name] = message;
      } else {
        leftover.push(`${field}: ${message}`);
      }
    }
    const general = leftover.length > 0 || error.details.length === 0
      ? [error.message, ...leftover].join(' ')
      : null;
    return { fieldErrors, general };
  }

  const conflict = error instanceof ApiError ? conflicts[error.code] : undefined;
  if (conflict && fields.includes(conflict)) {
    fieldErrors[conflict] = describe(error);
    return { fieldErrors, general: null };
  }

  return { fieldErrors, general: error ? describe(error) : null };
}
