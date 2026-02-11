import { logger } from '@/lib/logger';

// ── Types ───────────────────────────────────────────────────────────

/**
 * Standard result shape for all server actions.
 * `data` carries any extra fields specific to the action.
 */
export type ActionResult<T = Record<string, never>> =
    | ({ success: true; message: string } & T)
    | ({ success: false; message: string } & Partial<T>);

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Extract a human-readable error message from an unknown `catch` value.
 */
export function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'An unknown error occurred.';
}

/**
 * Standard error handler for server actions that **return** a failure result.
 *
 * Usage:
 * ```ts
 * } catch (error) {
 *   return handleActionError('Failed to update product', error);
 * }
 * ```
 */
export function handleActionError(
    context: string,
    error: unknown
): { success: false; message: string } {
    const message = getErrorMessage(error);
    logger.error(`${context}:`, error);
    return { success: false, message };
}

/**
 * Standard error handler for server actions that **throw** on failure.
 *
 * Usage:
 * ```ts
 * } catch (error) {
 *   throwActionError('Failed to fetch product', error);
 * }
 * ```
 */
export function throwActionError(context: string, error: unknown): never {
    const message = getErrorMessage(error);
    logger.error(`${context}:`, error);
    throw new Error(message);
}
