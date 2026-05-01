// KioskAdmin fetchers — Sprint MES-2.7. Thin wrappers over the shared
// planner-side `api` helper so we get cookie + CSRF + JSON parsing for free.
import { api } from '../../../../services/api.js';

export const getPairings = ({ active = true } = {}) =>
  api.get(`/planning/v2/kiosks/pairings${active ? '?active=1' : ''}`);

export const issuePairing = (machineCode) =>
  api.post('/planning/v2/kiosks/pairings', { machine_code: machineCode });

export const revokePairing = (id) => api.delete(`/planning/v2/kiosks/pairings/${id}`);
