/**
 * MES domain i18n (v1.3 L3).
 *
 * Owns: Hardware Devices (Zebra/TSC printer, Scale, Scanner,
 * Office printer) + Connection Mode (Embedded / Thin / Smart) +
 * Server URLs panel.
 *
 * Key prefixes: hw.* (39 keys) + mode.* (51 keys) = 90 total.
 */
import { registerStrings } from '../strings.js';

registerStrings({
  // ─── Settings → Hardware Devices (v1.1) ───
  'hw.title':        { en: 'Hardware Devices', vi: 'Thiết bị phần cứng' },
  'hw.subtitle':     {
    en: 'Per-machine configuration. Saved locally — not synced to the server.',
    vi: 'Cấu hình per-máy. Lưu cục bộ, không đồng bộ về server.',
  },
  'hw.saved_at':     { en: ' · Saved {time}', vi: ' · Đã lưu {time}' },
  'hw.banner.p1':    {
    en: 'This tab is only available in the <b>Ops Control Desktop App</b>. In a regular browser, raw USB / Serial / TCP devices cannot be accessed due to browser sandbox limits.',
    vi: 'Tab này chỉ khả dụng trong <b>Ops Control Desktop App</b>. Trong trình duyệt thường, các thiết bị USB/Serial/TCP raw không truy cập được do giới hạn của browser sandbox.',
  },
  'hw.banner.p2':    {
    en: 'Please install the desktop build to use Zebra/TSC label printers, electronic scales, and barcode scanners (raw HID mode).',
    vi: 'Vui lòng tải bản desktop để dùng máy in nhãn Zebra/TSC, cân điện tử, máy quét barcode (mode HID raw).',
  },

  // Label printer card
  'hw.lp.title':       { en: '🖨 Label Printer (Zebra / TSC) — TCP:9100', vi: '🖨 Máy in nhãn (Zebra / TSC) — TCP:9100' },
  'hw.lp.host':        { en: 'Printer IP', vi: 'IP máy in' },
  'hw.lp.port':        { en: 'Port', vi: 'Port' },
  'hw.lp.pinging':     { en: 'Pinging…', vi: 'Đang ping…' },
  'hw.lp.ping':        { en: 'Ping connection', vi: 'Ping kết nối' },
  'hw.lp.send_test':   { en: 'Send test label', vi: 'Gửi nhãn test' },
  'hw.lp.test_sent':   { en: 'Test label sent — check the printer.', vi: 'Đã gửi nhãn test — kiểm tra máy in.' },
  'hw.lp.test_err':    { en: 'Send-label error: {msg}', vi: 'Lỗi gửi nhãn: {msg}' },
  'hw.lp.ok_latency':  { en: '✓ Connection OK — latency {ms} ms', vi: '✓ Kết nối OK — latency {ms} ms' },
  'hw.lp.err':         { en: '✗ Error: {err}', vi: '✗ Lỗi: {err}' },

  // Scale card
  'hw.sc.title':       { en: '⚖️ Electronic Scale — RS232 / USB-Serial', vi: '⚖️ Cân điện tử — RS232 / USB-Serial' },
  'hw.sc.com_port':    { en: 'COM Port / Device', vi: 'COM Port / Device' },
  'hw.sc.choose_port': { en: '— Choose port —', vi: '— Chọn cổng —' },
  'hw.sc.baud':        { en: 'Baud rate', vi: 'Baud rate' },
  'hw.sc.scan_ports':  { en: '↻ Scan ports', vi: '↻ Quét cổng' },
  'hw.sc.connect':     { en: 'Connect + Read realtime', vi: 'Kết nối + Đọc realtime' },
  'hw.sc.disconnect':  { en: 'Disconnect', vi: 'Ngắt' },
  'hw.sc.weight':      { en: '✓ Weight: ', vi: '✓ Trọng lượng: ' },
  'hw.sc.open_err':    { en: 'Scale open error: {msg}', vi: 'Lỗi mở cân: {msg}' },

  // Scanner card
  'hw.sn.title':         { en: '📷 Barcode Scanner — USB-HID / Keyboard Wedge', vi: '📷 Máy quét barcode — USB-HID / Keyboard Wedge' },
  'hw.sn.wedge_label':   {
    en: 'Use <b>Keyboard Wedge mode</b> (default — scanner types directly into the active field)',
    vi: 'Dùng <b>Keyboard Wedge mode</b> (mặc định — scanner gõ thẳng vào field active)',
  },
  'hw.sn.hid_device':    { en: 'HID device', vi: 'Thiết bị HID' },
  'hw.sn.choose':        { en: '— Choose —', vi: '— Chọn —' },
  'hw.sn.scan':          { en: '↻ Scan', vi: '↻ Quét' },
  'hw.sn.start_listen':  { en: 'Start listening', vi: 'Bắt đầu lắng nghe' },
  'hw.sn.stop':          { en: 'Stop', vi: 'Dừng' },
  'hw.sn.scanned':       { en: '✓ Scanned: ', vi: '✓ Quét: ' },
  'hw.sn.no_hid':        { en: 'No HID device selected', vi: 'Chưa chọn thiết bị HID' },
  'hw.sn.open_err':      { en: 'Scanner open error: {msg}', vi: 'Lỗi mở scanner: {msg}' },

  // Office printer card
  'hw.op.title':         { en: '🖨 Office Printer (A4/A3)', vi: '🖨 Máy in văn phòng (A4/A3)' },
  'hw.op.default':       { en: 'Default printer', vi: 'Máy in mặc định' },
  'hw.op.system':        { en: '— System default —', vi: '— Hệ thống —' },
  'hw.op.paper':         { en: 'Paper size', vi: 'Khổ giấy' },
  'hw.op.hint':          {
    en: 'If left unset, the app uses the OS default printer when printing PDF reports.',
    vi: 'Nếu không chọn, app sẽ dùng máy in mặc định của OS khi in PDF báo cáo.',
  },

  // ─── Settings → Connection Mode (v1.2) ───
  'mode.title':       { en: 'Connection Mode', vi: 'Chế độ kết nối' },
  'mode.banner.p1':   {
    en: 'This tab is only available in the <b>Ops Control Desktop App</b>. The web build always calls the current server (equivalent to <code>thin</code> mode).',
    vi: 'Tab này chỉ khả dụng trong <b>Ops Control Desktop App</b>. Bản web mặc định gọi server hiện tại (tương đương mode <code>thin</code>).',
  },
  'mode.loading':     { en: 'Loading configuration…', vi: 'Đang tải cấu hình…' },
  'mode.current':     { en: 'Current mode: ', vi: 'Chế độ hiện tại: ' },
  'mode.port':        { en: 'Embedded server port: ', vi: 'Embedded server port: ' },
  'mode.build':       { en: 'Build: ', vi: 'Bản cài: ' },

  // Mode cards
  'mode.embedded.title':    { en: 'Embedded', vi: 'Embedded' },
  'mode.embedded.subtitle': { en: 'In-process server · Single-user', vi: 'Server in-process · Single-user' },
  'mode.embedded.desc':     {
    en: 'Express runs inside the app, data lives in local userData. Suited for single-machine users, demos, or work-from-home. Does NOT sync with other machines.',
    vi: 'Express chạy trong app, dữ liệu local trong userData. Phù hợp cho user single-machine, demo, làm tại nhà. KHÔNG đồng bộ với máy khác.',
  },
  'mode.embedded.pro1':     { en: '100% offline', vi: 'Offline 100%' },
  'mode.embedded.pro2':     { en: 'No network needed', vi: 'Không cần network' },
  'mode.embedded.pro3':     { en: 'Zero setup', vi: 'Setup zero' },
  'mode.embedded.con1':     { en: 'Each machine has its own data', vi: 'Mỗi máy data riêng' },
  'mode.embedded.con2':     { en: 'No quote sharing', vi: 'Không share quote' },

  'mode.thin.title':    { en: 'Thin', vi: 'Thin' },
  'mode.thin.subtitle': { en: 'Remote server · Multi-user (recommended)', vi: 'Remote server · Multi-user (khuyên dùng)' },
  'mode.thin.desc':     {
    en: 'All API calls hit the central server. All 50 machines share the same database. Equivalent to SAP GUI thin client / IFS Aurena Web Client.',
    vi: 'Mọi API call đi về server tập trung. Tất cả 50 máy share cùng database. Tương đương SAP GUI thin client / IFS Aurena Web Client.',
  },
  'mode.thin.pro1':     { en: 'Single source of truth', vi: '1 source of truth' },
  'mode.thin.pro2':     { en: 'Real-time sync', vi: 'Real-time sync' },
  'mode.thin.pro3':     { en: 'Centralised backup', vi: 'Backup tập trung' },
  'mode.thin.con1':     { en: 'Requires LAN', vi: 'Cần network LAN' },
  'mode.thin.con2':     { en: 'Server crash → app stops', vi: 'Server crash → app dừng' },

  'mode.smart.title':    { en: 'Smart', vi: 'Smart' },
  'mode.smart.subtitle': { en: 'Hybrid · offline-capable', vi: 'Hybrid offline-capable' },
  'mode.smart.desc':     {
    en: 'Cache master data locally, queue writes offline + auto-sync when online. Equivalent to IFS Cloud Aurena offline mode. Live sync state shown in the TopBar badge (top-right).',
    vi: 'Cache master data local, write queue offline + auto-sync khi có mạng. Tương đương IFS Cloud Aurena offline mode. Trạng thái sync hiện ở badge TopBar góc phải.',
  },
  'mode.smart.pro1':     { en: 'Offline → Online auto-sync', vi: 'Offline → Online tự sync' },
  'mode.smart.pro2':     { en: 'Fast reads (local cache)', vi: 'Read nhanh (cache local)' },
  'mode.smart.pro3':     { en: 'Keeps working when network drops', vi: 'Mất mạng vẫn làm việc' },
  'mode.smart.con1':     { en: 'Conflict resolution: last-write-wins', vi: 'Conflict resolution: last-write-wins' },
  'mode.smart.con2':     { en: 'Per-endpoint cache wiring is incremental', vi: 'Per-endpoint cache wiring incremental' },

  'mode.pros':            { en: 'Pros', vi: 'Ưu điểm' },
  'mode.cons':            { en: 'Trade-off', vi: 'Đánh đổi' },
  'mode.active_tag':      { en: 'ACTIVE', vi: 'ĐANG DÙNG' },
  'mode.url_label':       { en: 'Remote server URL', vi: 'URL server remote' },
  'mode.apply':           { en: 'Apply', vi: 'Áp dụng' },
  'mode.applying':        { en: 'Saving…', vi: 'Đang lưu…' },
  'mode.applied':         { en: 'Applied', vi: 'Đã áp dụng' },
  'mode.cancel':          { en: 'Cancel', vi: 'Hủy' },
  'mode.saved_restart':   { en: '✅ Config saved. Restart the app to apply the new mode.', vi: '✅ Đã lưu config. Cần khởi động lại app để apply mode mới.' },
  'mode.restart_now':     { en: '↻ Restart app now', vi: '↻ Khởi động lại app ngay' },
  'mode.err':             { en: 'Error: {msg}', vi: 'Lỗi: {msg}' },
  'mode.note': {
    en: '<b>Smart mode is active:</b> sync engine pings the server every 15 s, pulls master data every 5 minutes, pushes the outbox when online. Live state in the top-right badge of TopBar (click to force sync). Local cache lives in <code>cache.db</code> inside userData. Per-tab UIs read from cache when calling <code>smartCache.cacheFirstList()</code> (incremental wiring).',
    vi: '<b>Smart mode đang chạy:</b> sync engine ping server mỗi 15s, pull master data mỗi 5 phút, push outbox khi có mạng. Trạng thái live ở badge góc phải TopBar (click để force sync ngay). Cache local nằm tại <code>cache.db</code> trong userData. Per-tab UI đọc từ cache khi gọi qua <code>smartCache.cacheFirstList()</code> (incremental wiring).',
  },

  // Server URLs (embedded mode info block)
  'mode.urls.title':      { en: '🔗 Server URL for client machines', vi: '🔗 URL server cho máy nhân viên (Client)' },
  'mode.urls.hint':       {
    en: 'Hand ONE of the URLs below to whoever installs the Client. Prefer Ethernet IPs.',
    vi: 'Đưa MỘT trong các URL dưới đây cho người cài Client. Ưu tiên IP Ethernet.',
  },
  'mode.urls.refresh':    { en: '↻ Refresh', vi: '↻ Refresh' },
  'mode.urls.refresh_tt': { en: 'Refresh — re-read the current IP list', vi: 'Refresh — đọc lại danh sách IP hiện tại' },
  'mode.urls.copy':       { en: 'Copy', vi: 'Copy' },
  'mode.urls.warn_intro': {
    en: '⚠ <b>IPs change with the LAN.</b> Each time the host machine moves networks (e.g. home Wi-Fi ↔ office Wi-Fi, or a router swap), the IPs above WILL change → old URLs on client machines will stop connecting. Risk-reduction:',
    vi: '⚠ <b>IP thay đổi theo mạng LAN.</b> Mỗi lần máy chủ chuyển mạng (vd Wi-Fi nhà ↔ Wi-Fi văn phòng, hoặc đổi router), IP ở trên SẼ đổi → URL cũ trên máy nhân viên không kết nối được nữa. Cách giảm rủi ro:',
  },
  'mode.urls.warn_li1':   {
    en: 'Recommended: configure a <b>static IP</b> or <b>DHCP reservation</b> for the host on the router (survives power loss).',
    vi: 'Khuyến nghị: cấu hình <b>static IP</b> hoặc <b>DHCP reservation</b> cho máy chủ trên router (không đổi dù mất điện).',
  },
  'mode.urls.warn_li2':   {
    en: 'If the network changes, reopen this tab → check the new IP → click Copy → send to users so they can update Client.',
    vi: 'Nếu đổi mạng, mở lại tab này → kiểm tra IP mới → bấm Copy → gửi cho người dùng để update Client.',
  },
  'mode.urls.warn_li3':   {
    en: 'After every IP change, client machines must open Settings → ⇄ Connection Mode → edit the URL → Save & restart.',
    vi: 'Mỗi lần đổi IP, máy nhân viên phải vào Settings → ⇄ Chế độ kết nối → sửa URL → Save & restart.',
  },
});
