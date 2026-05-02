/**
 * RFC-7807 problem+json helper — Sprint MES-2.3.
 *
 * Single shared sender so route layers don't open-code the same
 * `res.status(N).type('application/problem+json').json({ type, status, ...x })`
 * 3 lines on every error. Mirrors the body shape MES-1.4 was already
 * emitting (verified by a 40/40 contract test re-run before/after the
 * refactor).
 *
 * Body shape:
 *   { type, status, [title], [detail], ...extras }
 * `title` and `detail` are RFC-7807 OPTIONAL — omitted when not provided
 * to keep parity with the legacy MES-1.4 envelope (which never set them).
 */

/**
 * @param {import('express').Response} res
 * @param {{
 *   status: number,
 *   type: string,
 *   title?: string,
 *   detail?: string,
 *   [extra: string]: unknown,
 * }} problem
 */
export function respondError(res, problem) {
  const { status, type, title, detail, ...extras } = problem;
  const body = { type, status, ...extras };
  if (title !== undefined) body.title = title;
  if (detail !== undefined) body.detail = detail;
  return res.status(status).type('application/problem+json').json(body);
}
