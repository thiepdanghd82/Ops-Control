# v1.6 Cut-over Notification Template — Zalo / Teams

> For Henry to send via Zalo Group "Ops Control" + Hương + CCL Hai Duong Plant Manager.
> Send 7 days, 24h, and 1h before the cut-over. Three timestamps + a post-cut-over confirmation.

---

## ① T-7 days — Initial advisory (Sat 2026-07-11)

### 🇻🇳 Vietnamese

```
📢 THÔNG BÁO BẢO TRÌ HỆ THỐNG OPS CONTROL

Kính gửi anh/chị,

Hệ thống Ops Control sẽ được nâng cấp lên phiên bản v1.6 vào:
🗓️ Thứ Bảy, 2026-07-18, 22:00 ICT
⏱️ Thời lượng bảo trì dự kiến: 60 phút (22:00 — 23:00)

Trong khung giờ này, hệ thống sẽ không truy cập được. Các quote / báo giá
đang mở cần được lưu trước 21:30.

Phiên bản v1.6 đưa vào hoạt động chính thức Thứ Hai 2026-07-21 sáng,
kèm buổi training 1-2 giờ cho operator.

Cập nhật chính:
• Pricing Snapshot — giá quote đóng băng tại save time
• Copy quote workflow mới
• Báo cáo xlsx có tab audit metadata
• Bộ lọc Date / Customer / Part / Sale Owner trên Quote History

Mọi thắc mắc trước 2026-07-18 vui lòng liên hệ Henry trực tiếp.

Cảm ơn anh/chị,
Henry — Ops Control IT Lead
```

### 🇬🇧 English

```
📢 SYSTEM MAINTENANCE NOTICE — OPS CONTROL

Dear team,

Ops Control will be upgraded to version v1.6 on:
🗓️ Saturday 2026-07-18, 22:00 ICT
⏱️ Maintenance window: 60 minutes (22:00 — 23:00)

System will be unavailable during this window. Open quotes must be
saved before 21:30.

Version v1.6 officially goes live Monday morning 2026-07-21 with a
1–2 hour operator training session.

Key changes:
• Pricing Snapshot — quote prices freeze at save time
• New Copy quote workflow
• xlsx export now includes audit metadata tab
• Date / Customer / Part / Sale Owner filters on Quote History

Questions before 2026-07-18 → contact Henry directly.

Thank you,
Henry — Ops Control IT Lead
```

---

## ② T-24h — Day-before reminder (Fri 2026-07-17 evening)

### 🇻🇳

```
⏰ NHẮC LẠI — BẢO TRÌ NGÀY MAI

Ngày mai (Thứ Bảy 2026-07-18) 22:00 ICT, hệ thống Ops Control sẽ
được nâng cấp lên v1.6.

• Vui lòng lưu tất cả quote đang mở trước 21:30
• Hệ thống không truy cập được từ 22:00 — 23:00
• Sáng Thứ Hai 2026-07-21 sẽ có training session cho operator

Henry on-call suốt đêm Thứ Bảy: +84 [Henry's phone]

Cảm ơn anh/chị,
Henry
```

### 🇬🇧

```
⏰ REMINDER — MAINTENANCE TOMORROW

Tomorrow (Saturday 2026-07-18) 22:00 ICT, Ops Control will be
upgraded to v1.6.

• Please save all open quotes before 21:30
• System unavailable from 22:00 — 23:00
• Monday morning 2026-07-21 → operator training session

Henry on-call through Saturday night: +84 [Henry's phone]

Thank you,
Henry
```

---

## ③ T-1h — Start window warning (Sat 2026-07-18 21:00)

### 🇻🇳

```
🔧 BẢO TRÌ BẮT ĐẦU TRONG 1 GIỜ

22:00 ICT hôm nay (sau 60 phút nữa) hệ thống Ops Control sẽ tạm
dừng để nâng cấp lên v1.6.

Vui lòng lưu tất cả công việc đang mở NGAY BÂY GIỜ.

Hẹn gặp lại sau 23:00.

Henry
```

### 🇬🇧

```
🔧 MAINTENANCE STARTS IN 1 HOUR

At 22:00 ICT today (in 60 minutes) Ops Control will pause for the
v1.6 upgrade.

Please save all open work NOW.

See you back at 23:00.

Henry
```

---

## ④ Post cut-over — Back online (Sat 2026-07-18 ~23:00)

### Pattern A — Successful cut-over

#### 🇻🇳

```
✅ HỆ THỐNG ĐÃ TRỞ LẠI — v1.6 LIVE

Ops Control v1.6 đã chính thức online lúc 23:00 ICT.

Login bình thường. Nếu thấy lỗi gì, ping Henry ngay.

Sáng Thứ Hai (2026-07-21) 09:00 sẽ có training session 1-2 giờ
giới thiệu các tính năng mới.

Cảm ơn anh/chị đã kiên nhẫn,
Henry
```

#### 🇬🇧

```
✅ SYSTEM BACK ONLINE — v1.6 LIVE

Ops Control v1.6 went live at 23:00 ICT.

Login as normal. Ping Henry immediately if you see any issue.

Monday morning (2026-07-21) 09:00 → 1–2 hour training session
on the new features.

Thank you for your patience,
Henry
```

### Pattern B — Rollback scenario (if Phase 6 rollback procedure triggered)

#### 🇻🇳

```
⚠️ TẠM HOÃN NÂNG CẤP — QUAY VỀ v1.5.12

Trong quá trình nâng cấp v1.6 tối nay, phát hiện vấn đề kỹ thuật.
Hệ thống đã được rollback về v1.5.12 (phiên bản trước đó) — TẤT CẢ
DATA AN TOÀN, không có quote nào bị mất.

Hệ thống tiếp tục hoạt động bình thường ở v1.5.12.

Henry sẽ xác định nguyên nhân và lên lịch nâng cấp lại trong tuần.

Cảm ơn anh/chị,
Henry
```

#### 🇬🇧

```
⚠️ UPGRADE POSTPONED — REVERTED TO v1.5.12

During tonight's v1.6 upgrade we hit a technical issue. The system
has been rolled back to v1.5.12 (previous version) — ALL DATA IS
SAFE, no quotes were lost.

System continues to operate normally on v1.5.12.

Henry will identify the root cause and reschedule the upgrade
within the week.

Thank you,
Henry
```

---

## ⑤ Monday morning — Training session announcement (Mon 2026-07-21 08:00)

### 🇻🇳

```
🌅 CHÀO BUỔI SÁNG — OPS CONTROL v1.6 ĐÃ LIVE

Hôm nay (Thứ Hai 2026-07-21) chính thức là ngày đầu tiên Ops Control
v1.6 vận hành.

📌 Training session 09:00 — 10:30 ICT
📍 [Location / Zoom link]
👥 Mở cho tất cả operator

Cheatsheet 1 trang đã được dán ở workstation. Slack support channel:
#ops-control-v1-6-support

Henry sẽ on-call suốt ngày hôm nay.

Henry
```

### 🇬🇧

```
🌅 GOOD MORNING — OPS CONTROL v1.6 LIVE

Today (Monday 2026-07-21) is the official first day of Ops Control
v1.6 in production.

📌 Training session 09:00 — 10:30 ICT
📍 [Location / Zoom link]
👥 Open to all operators

1-page cheatsheet posted at every workstation. Slack support
channel: #ops-control-v1-6-support

Henry on-call all day today.

Henry
```

---

## Distribution checklist · Danh sách phân phối

For each timestamp:

- [ ] Zalo Group "Ops Control" — main operator channel
- [ ] Direct message Hương (Backup Engineer)
- [ ] Direct message CCL Hai Duong Plant Manager
- [ ] Email blast operator list (optional, redundant with Zalo)
- [ ] Pin in Slack/Teams `#ops-control` channel

## Customisation placeholders · Chỗ cần điền

Before sending:

- `[Henry's phone]` — your contact number for on-call escalation.
- `[Location / Zoom link]` — Monday training session venue or remote link.
- Adjust the 22:00 ICT start time if Plant Manager prefers a different window (off-shift confirmation per Q-Day 8 decision).

---

**Last updated · Cập nhật cuối**: 2026-06-10 (Phase 6 / S-SNAPSHOT-PHASE-6 Day 1.A)
