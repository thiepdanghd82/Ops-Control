/**
 * Review-mirror directory for the generated help DOCX files (and the
 * self-check report). Lives in the workspace next to the repo
 * (`../workspace/Claude-output`), outside git. Override with
 * OPS_DOCS_MIRROR_DIR.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export const REVIEW_MIRROR_DIR = process.env.OPS_DOCS_MIRROR_DIR
  ? path.resolve(process.env.OPS_DOCS_MIRROR_DIR)
  : path.resolve(REPO_ROOT, '..', 'workspace', 'Claude-output');
