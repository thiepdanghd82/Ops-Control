# Internal Trust Setup — Free signing alternatives

**Mục tiêu:** Cài Ops Control trên máy nội bộ KHÔNG bị Windows SmartScreen / macOS Gatekeeper cảnh báo, mà KHÔNG mua cert (tiết kiệm 389 USD/năm).

**Đối tượng đọc:** IT của khách hàng (CCL Design Vietnam) — người setup môi trường + push GPO 1 lần.

**Kết quả:**
- 50 máy Windows nhận GPO → cài Ops Control mượt, không có dấu chấm than vàng SmartScreen
- macOS distribute qua file share / Jamf / USB → cài mượt, không có "App is damaged" / "Right-click → Open"
- Auto-update vẫn signed bằng cùng cert → chu trình release/rollout không đổi

---

## Phần 1 — Windows: Self-signed cert + GPO Trusted Publishers

### 1.1 Generate cert (vendor side, 1 lần)

Trên build machine của vendor (CCL Design dev/build server, Windows 10+):

```powershell
pwsh -File scripts/sign-windows.ps1 -InstallerPath "desktop/dist-electron/Ops-Control-Setup-1.1.0.exe"
```

Lần đầu, script tự generate self-signed cert hợp lệ **10 năm**, output 2 file:

```
desktop/build/internal-cert.pfx   # PRIVATE — không share, dùng để sign
desktop/build/internal-cert.cer   # PUBLIC — gửi cho IT để push GPO
```

Random password 24 ký tự được sinh → **lưu vào password manager** (1Password / Bitwarden) cho lần build kế. Set vào env `OPS_CERT_PASSWORD` để CI sign tự động.

Cert subject mặc định: `CN=CCL Design Vietnam - Ops Control, O=CCL Design Vietnam, C=VN`.

### 1.2 IT push cert qua GPO (IT side, 1 lần cho toàn domain)

IT nhận file `internal-cert.cer` từ vendor. Trên Domain Controller:

#### Step 1: Mở Group Policy Management

```
Server Manager → Tools → Group Policy Management
```

Tạo (hoặc sửa) GPO áp dụng cho OU chứa máy trạm Ops Control. Ví dụ tên `Ops-Control-Trust`.

#### Step 2: Edit GPO → Computer Configuration → Policies → Windows Settings → Security Settings → Public Key Policies

Push cert vào **2 store**:

**A. Trusted Publishers** (bypass SmartScreen "Unknown publisher"):
- Right-click `Trusted Publishers` → `Import...`
- Chọn file `internal-cert.cer`
- Place in: `Trusted Publishers`

**B. Trusted Root Certification Authorities** (cho phép cert chain validation):
- Right-click `Trusted Root Certification Authorities` → `Import...`
- Chọn file `internal-cert.cer`
- Place in: `Trusted Root Certification Authorities`

#### Step 3: Link GPO + force refresh

```cmd
# Link GPO vào OU "OpsControl-Workstations"
gpupdate /force

# Trên máy trạm, verify cert đã được push:
certutil -store -enterprise "Trusted Publishers"
```

Phải thấy entry `CN=CCL Design Vietnam - Ops Control` trong output.

#### Step 4: Verify SmartScreen behavior

Trên máy trạm (đã nhận GPO):
1. Copy `Ops-Control-Setup-1.1.0.exe` về Desktop
2. Right-click → Properties → kiểm tra mục **Digital Signatures** tab — phải hiện "Signed by CCL Design Vietnam — Ops Control" ✓
3. Double-click cài — **KHÔNG có dialog "Windows protected your PC"**

Nếu vẫn còn dialog → kiểm tra:
- `gpresult /h gpo-report.html` → confirm GPO Ops-Control-Trust đã apply
- Cert đã import vào CẢ Trusted Publishers + Trusted Root CAs (mỗi store độc lập)

### 1.3 Manual install workaround (cho máy không nằm trong OU GPO)

Nếu IT có vài máy không thuộc domain (ví dụ máy laptop sales đi lại), user có thể tự trust cert 1 lần:

```cmd
:: Right-click → Run as Administrator
certutil -addstore -f "TrustedPublisher" internal-cert.cer
certutil -addstore -f "Root" internal-cert.cer
```

Hoặc UI: Right-click `internal-cert.cer` → **Install Certificate** → **Local Machine** → **Place all certificates in the following store** → Browse → `Trusted Root Certification Authorities`. Lặp lại cho `Trusted Publishers`.

### 1.4 Cert renewal (sau 10 năm)

Year 9: vendor regenerate cert (cùng script), gửi `.cer` mới cho IT, IT update GPO. Trong khi rollout cert mới, cả 2 cert có thể coexist trong store — không downtime.

---

## Phần 2 — macOS: Ad-hoc sign + IT-distributed (no quarantine)

### 2.1 Ad-hoc sign khi build (vendor side, mỗi release)

Trong `release.sh` đã wire sẵn:

```bash
# Sau khi electron-builder tạo .app
./scripts/sign-macos.sh "desktop/dist-electron/mac-arm64/Ops Control.app"

# Xong mới repackage thành DMG
```

Ad-hoc signature (`codesign --sign -`):
- Cung cấp **code integrity check** — file không bị sửa sau build
- KHÔNG có "trusted signer" → Gatekeeper block khi user download qua browser
- ĐƯỢC bypass khi file không có quarantine attribute

### 2.2 Distribution qua kênh không gắn quarantine (IT side)

`com.apple.quarantine` attribute chỉ được set bởi:
- Browsers (Safari/Chrome/Firefox/Edge)
- Apple Mail attachment download
- AirDrop từ máy chưa trusted

Các kênh KHÔNG set quarantine:
- ✅ **File share LAN** (smb://, afp://) — copy về local
- ✅ **MDM** (Jamf Pro / Mosyle / Kandji) — push install
- ✅ **Internal pkg installer** với `pkgbuild`
- ✅ **scp / rsync / sftp** từ Linux/Mac
- ✅ **USB stick** (nếu format không phải FAT32 — APFS/HFS+ ổn)
- ✅ **Git clone** (nếu IT clone repo build artifact)

### 2.3 Khuyến nghị deploy macOS qua Jamf Pro / Mosyle

Nếu công ty có MDM, đây là cách tốt nhất:

1. Convert .dmg → .pkg installer (xem section 2.4)
2. Upload .pkg lên MDM server
3. Tạo policy "Install Ops Control" → trigger install ngay khi máy enroll

Khi MDM push install, app KHÔNG bao giờ chạm browser → không quarantine → mở mượt.

### 2.4 Convert DMG → PKG (cho MDM hoặc file share)

```bash
# Sau khi có dmg unsigned, mount + extract .app rồi pkgbuild
hdiutil attach "Ops Control-1.1.0-arm64.dmg" -nobrowse -mountpoint /tmp/opsmount
mkdir -p /tmp/pkgroot/Applications
cp -R "/tmp/opsmount/Ops Control.app" /tmp/pkgroot/Applications/
hdiutil detach /tmp/opsmount

# Build pkg với postinstall script clear quarantine
mkdir -p /tmp/pkgscripts
cat > /tmp/pkgscripts/postinstall <<'EOF'
#!/bin/bash
# Clear quarantine on installed app (defensive — should not be needed
# if pkg distributed via MDM, but safe to do anyway)
xattr -cr "/Applications/Ops Control.app" 2>/dev/null || true
exit 0
EOF
chmod +x /tmp/pkgscripts/postinstall

pkgbuild --root /tmp/pkgroot \
         --identifier vn.ccldesign.opscontrol \
         --version 1.1.0 \
         --install-location / \
         --scripts /tmp/pkgscripts \
         --sign - \
         "Ops-Control-1.1.0.pkg"

rm -rf /tmp/pkgroot /tmp/pkgscripts
```

### 2.5 Manual workaround (nếu user vẫn dùng browser download)

Trong DESKTOP_DEPLOYMENT.md đã có section troubleshooting. Quick fix:

```bash
# User chạy 1 lần sau khi cài
xattr -cr "/Applications/Ops Control.app"
open "/Applications/Ops Control.app"
```

Hoặc UI: Right-click `Ops Control.app` → `Open` → Gatekeeper sẽ hỏi 1 lần "Are you sure?" → click `Open`. Sau lần đầu, app remember và mở mượt mãi mãi.

---

## Phần 3 — Auto-update với self-signed cert

`electron-updater` mặc định verify code signature của file installer mới trước khi install. Với self-signed cert:

### 3.1 Windows

Trong `desktop/package.json`:
```json
"build": {
  "win": {
    "verifyUpdateCodeSignature": false  // hoặc true, xem dưới
  }
}
```

**Khuyến nghị:** Đặt `verifyUpdateCodeSignature: true` + ship cert thumbprint:

```json
"win": {
  "verifyUpdateCodeSignature": true,
  "publisherName": ["CCL Design Vietnam - Ops Control"]
}
```

electron-updater sẽ verify installer được sign bởi cùng publisher name → block kẻ tấn công thay file.

### 3.2 macOS

Cũng tương tự — ad-hoc sign nhưng verify identity matches:

```json
"mac": {
  "identity": "-",          // ad-hoc
  "verifyUpdateCodeSignature": false  // ad-hoc không thể verify chain
}
```

Trade-off: Auto-update không có signature verification trên Mac. Mitigation: serve `latest-mac.yml` qua HTTPS (cert nội bộ hoặc Let's Encrypt), client pin server cert.

---

## Phần 4 — Tổng kết chi phí

| Item | Trước (paid) | Sau (free alternative) |
|---|---|---|
| Windows code signing | EV cert Sectigo $290/năm | Self-signed + GPO push (1 lần setup) |
| macOS notarization | Apple Dev ID $99/năm | Ad-hoc sign + IT distribution |
| Domain (cho HTTPS internal) | $12/năm | Self-signed CA hoặc IP literal |
| **Tổng** | **$401/năm** | **$0/năm** |

**Trade-offs (acceptable cho deploy nội bộ 50 máy):**
- ✗ Không phân phối public được (nhưng app này internal-only)
- ✗ User ngoài 50 máy GPO sẽ thấy SmartScreen warning
- ✗ Cert renewal mỗi 10 năm (vs auto-renew của Sectigo)
- ✓ $0/năm
- ✓ Không bị Sectigo backlog 1-2 tuần khi cần ship gấp
- ✓ Hoàn toàn tự chủ — không phụ thuộc CA bên ngoài
- ✓ Cert key trong tay vendor — chống incident leak ở CA

---

## Phần 5 — Migration path nếu sau này cần paid cert

Nếu công ty mở rộng phân phối (vd ship cho khách hàng B2B khác), có thể migrate sang paid cert mà KHÔNG phá deploy hiện tại:

1. Mua EV cert
2. Sign installer mới bằng EV cert thay vì self-signed
3. Push GPO mới: thêm EV cert vào Trusted Publishers (KHÔNG xóa self-signed cert cũ)
4. Auto-update sẽ ship installer EV-signed → user mới install + update mượt
5. Sau 1 release cycle, có thể remove self-signed khỏi GPO

Không downtime, không buộc user reinstall.
