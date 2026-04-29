/**
 * File backend — delegates to the existing dataSync.js + per-file JSON
 * reads. Zero behavior change vs. pre-migration. Default backend.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  getInventory,
  getManufacturingStructures,
  getRoutingOperations,
} from '../../services/dataSync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', '..', 'data');
const LIB = path.join(DATA_DIR, 'Library');

function readJson(fp) {
  try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); }
  catch { return []; }
}

export default {
  listBom() {
    return getManufacturingStructures();
  },
  listRouting() {
    return getRoutingOperations();
  },
  listInventory() {
    const all = getInventory();
    return all.inventory || [];
  },
  listFinishedGoods() {
    const all = getInventory();
    return all.finishedGoods || [];
  },
  listRawMaterials() {
    const all = getInventory();
    return all.rawMaterials || [];
  },
  listMaterialsNpi() {
    const fp = path.join(LIB, 'MaterialCost', 'npi_materials.json');
    return fs.existsSync(fp) ? readJson(fp) : [];
  },
  listMaterialsSourcing() {
    const fp = path.join(LIB, 'MaterialCost', 'sourcing_db.json');
    return fs.existsSync(fp) ? readJson(fp) : [];
  },
  listQuotes() {
    const fp = path.join(LIB, 'QuoteHistory', 'quote_history.json');
    return fs.existsSync(fp) ? readJson(fp) : [];
  },
  listRfqTracker() {
    const fp = path.join(LIB, 'RFQTracker', 'rfq_tracker.json');
    return fs.existsSync(fp) ? readJson(fp) : [];
  },
  listSampleTracker() {
    const fp = path.join(LIB, 'SampleTracking', 'sample_tracking.json');
    return fs.existsSync(fp) ? readJson(fp) : [];
  },
};
