/**
 * BackupMirrorCard — Settings → Backup/Restore → Mirror.
 *
 * Picks where the off-site mirror goes (a mounted drive such as a USB stick,
 * or a folder on this machine), whether it runs after each nightly backup,
 * and runs it on demand. The copy itself runs on the server
 * (server/services/backupMirror.js); this card only configures and reports.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { costApi } from '../../../services/api';
import { desktop, isElectron } from '../../../services/desktopBridge';
import { useI18n } from '../../../utils/useI18n';
import { showToast } from '../../../utils/toast';
import { offsiteLine } from './Settings.offsite.js';
import {
  fmtBytes,
  mirrorErrorKey,
  buildTargetOptions,
  canBrowseFolder,
} from './BackupMirror.helpers.js';
import './BackupMirrorCard.css';

const CUSTOM = '__custom__';

export default function BackupMirrorCard() {
  const { t } = useI18n();
  const [info, setInfo] = useState(null);
  const [choice, setChoice] = useState(null); // a volume path or CUSTOM
  const [customPath, setCustomPath] = useState('');
  const [auto, setAuto] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await costApi.getBackupMirror();
      setInfo(r);
      return r;
    } catch (e) {
      setError(mirrorErrorKey(e?.body?.code));
      return null;
    }
  }, []);

  // First load seeds the form from the saved config.
  useEffect(() => {
    load().then((r) => {
      if (!r) return;
      const { options, customSelected } = buildTargetOptions(r.targets, r.config.dest);
      if (customSelected) {
        setChoice(CUSTOM);
        setCustomPath(r.config.dest);
      } else {
        setChoice(options.find((o) => o.selected)?.path || null);
      }
      setAuto(r.config.auto !== false);
    });
  }, [load]);

  // Poll while a run is in progress so the status line moves on its own.
  const running = !!info?.running;
  useEffect(() => {
    if (!running) return undefined;
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [running, load]);

  const { options } = useMemo(() => buildTargetOptions(info?.targets, info?.config?.dest), [info]);
  const browse = canBrowseFolder({ isElectron, hostname: window.location.hostname });
  const dest = choice === CUSTOM ? customPath.trim() : choice;
  const savedDest = info?.config?.dest || null;
  const dirty = !!info && ((dest || null) !== savedDest || auto !== (info.config.auto !== false));
  const line = offsiteLine(info?.health, t);

  async function pickFolder() {
    const r = await desktop.fs.showOpenDialog({ directory: true, title: t('set.mirror.pick') });
    if (r?.canceled || !r?.filePaths?.[0]) return;
    setChoice(CUSTOM);
    setCustomPath(r.filePaths[0]);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await costApi.setBackupMirror({ dest: dest || '', auto });
      showToast(t('set.mirror.saved'), 'success');
      await load();
    } catch (e) {
      setError(mirrorErrorKey(e?.body?.code));
    } finally {
      setBusy(false);
    }
  }

  async function runNow() {
    setError(null);
    try {
      await costApi.runBackupMirror();
      await load();
    } catch (e) {
      setError(mirrorErrorKey(e?.body?.code));
    }
  }

  if (!info) {
    return (
      <div className="bm-card">
        <div className="bm-title">{t('set.mirror.title')}</div>
        {error ? <div className="bm-error">{t(error)}</div> : null}
      </div>
    );
  }

  const selected = options.find((o) => o.path === dest);

  return (
    <div className="bm-card">
      <div className="bm-head">
        <div>
          <div className="bm-title">{t('set.mirror.title')}</div>
          <div className="bm-sub">{t('set.mirror.sub')}</div>
        </div>
        <div className={`bk-offsite bk-offsite-${line.tone}`} title={line.title}>
          {running ? t('set.mirror.running') : line.text}
        </div>
      </div>

      <div className="bm-label">{t('set.mirror.dest')}</div>
      <div className="bm-targets" role="radiogroup" aria-label={t('set.mirror.dest')}>
        {options.map((o) => (
          <label key={o.path} className={`bm-target${o.disabled ? ' is-disabled' : ''}`}>
            <input
              type="radio"
              name="bm-dest"
              checked={choice === o.path}
              disabled={o.disabled}
              onChange={() => setChoice(o.path)}
            />
            <span className="bm-target-name">{o.name}</span>
            <span className="bm-target-size">
              {fmtBytes(o.freeBytes)} {t('set.mirror.free_of')} {fmtBytes(o.totalBytes)}
            </span>
            {o.sameDiskAsData ? <span className="bm-warn">{t('set.mirror.same_disk')}</span> : null}
            {o.disabled ? <span className="bm-warn">{t('set.mirror.read_only')}</span> : null}
          </label>
        ))}
        {options.length === 0 ? <div className="bm-empty">{t('set.mirror.no_drives')}</div> : null}
        <label className="bm-target">
          <input
            type="radio"
            name="bm-dest"
            checked={choice === CUSTOM}
            onChange={() => setChoice(CUSTOM)}
          />
          <span className="bm-target-name">{t('set.mirror.folder')}</span>
        </label>
        {choice === CUSTOM ? (
          <div className="bm-folder">
            <input
              type="text"
              className="bm-folder-input"
              value={customPath}
              placeholder="/Users/…/Backups"
              onChange={(e) => setCustomPath(e.target.value)}
              aria-label={t('set.mirror.folder')}
            />
            {browse ? (
              <button
                type="button"
                className="op-btn op-btn-secondary op-btn-sm"
                onClick={pickFolder}
              >
                {t('set.mirror.pick')}
              </button>
            ) : null}
          </div>
        ) : null}
        {choice === CUSTOM && info.destCheck?.sameDiskAsData && customPath === info.config.dest ? (
          <div className="bm-warn">{t('set.mirror.same_disk_long')}</div>
        ) : null}
        {selected?.sameDiskAsData ? (
          <div className="bm-warn">{t('set.mirror.same_disk_long')}</div>
        ) : null}
      </div>

      <label className="bm-auto">
        <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
        {t('set.mirror.auto')}
      </label>

      {error ? <div className="bm-error">{t(error)}</div> : null}

      <div className="bm-actions">
        <button
          type="button"
          className="op-btn op-btn-primary op-btn-sm"
          disabled={busy || !dirty}
          onClick={save}
        >
          {t('set.mirror.save')}
        </button>
        <button
          type="button"
          className="op-btn op-btn-secondary op-btn-sm"
          disabled={running || !info.config.dest || dirty}
          title={dirty ? t('set.mirror.save_first') : ''}
          onClick={runNow}
        >
          {running ? t('set.mirror.running') : t('set.mirror.run')}
        </button>
        {info.health?.dest ? <span className="bm-path">{info.health.dest}</span> : null}
      </div>
    </div>
  );
}
