/**
 * Typed domain errors for the planning bounded context.
 *
 * The route layer (MES-1.4) maps `BmesError` instances to RFC-7807
 * problem documents using `error.type` for the URN and `error.payload`
 * for the extension members (e.g. `allowed_from`, `forbidden_fields`).
 *
 * `BmesError` is intentionally local to the planning domain. If a second
 * domain needs the same shape later, lift it to platform/.
 */
export class BmesError extends Error {
  /**
   * @param {string} type     RFC-7807 `type` URN, e.g. 'urn:ops:wo-invalid-transition'
   * @param {object} [payload] extension members carried into the response body
   */
  constructor(type, payload = {}) {
    super(type);
    this.name = 'BmesError';
    this.type = type;
    this.payload = payload;
  }
}
