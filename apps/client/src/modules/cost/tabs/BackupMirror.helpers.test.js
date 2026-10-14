import test from 'node:test';
import assert from 'node:assert/strict';
import {
  fmtBytes,
  mirrorErrorKey,
  buildTargetOptions,
  canBrowseFolder,
} from './BackupMirror.helpers.js';

test('fmtBytes is coarse and handles unknown sizes', () => {
  assert.equal(fmtBytes(null), '—');
  assert.equal(fmtBytes(512 * 1024 * 1024), '512 MB');
  assert.equal(fmtBytes(64.8e9), '60.3 GB'); // 64.8e9 / 1024^3 = 60.35
});

test('mirrorErrorKey maps server codes and falls back', () => {
  assert.equal(mirrorErrorKey('inside_data'), 'set.mirror.err.inside_data');
  assert.equal(mirrorErrorKey('something_new'), 'set.mirror.err.generic');
  assert.equal(mirrorErrorKey(undefined), 'set.mirror.err.generic');
});

test('buildTargetOptions lists volumes and keeps a custom saved folder visible', () => {
  const targets = [
    {
      name: 'Henry_USB',
      path: '/Volumes/Henry_USB',
      writable: true,
      sameDiskAsData: false,
      freeBytes: 1e9,
      totalBytes: 2e9,
    },
    {
      name: 'RO',
      path: '/Volumes/RO',
      writable: false,
      sameDiskAsData: false,
      freeBytes: 0,
      totalBytes: 1,
    },
  ];
  const a = buildTargetOptions(targets, '/Volumes/Henry_USB');
  assert.equal(a.options.length, 2);
  assert.equal(a.options[0].selected, true);
  assert.equal(a.options[1].disabled, true, 'a read-only volume cannot be picked');
  assert.equal(a.customSelected, false);

  // A saved folder on the Mac's own disk is not a volume: it must still show,
  // or the operator would see nothing selected for the destination in use.
  const b = buildTargetOptions(targets, '/Users/henry/Backups');
  assert.equal(b.customSelected, true);
  assert.ok(b.options.every((o) => !o.selected));
});

test('the folder picker is offered only on the server machine inside the app', () => {
  assert.equal(canBrowseFolder({ isElectron: true, hostname: '127.0.0.1' }), true);
  assert.equal(canBrowseFolder({ isElectron: true, hostname: 'localhost' }), true);
  // A thin client would open a dialog on ITS disk, while the mirror runs on the server.
  assert.equal(canBrowseFolder({ isElectron: true, hostname: '10.102.3.61' }), false);
  assert.equal(canBrowseFolder({ isElectron: false, hostname: '127.0.0.1' }), false);
});
