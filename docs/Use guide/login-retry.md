# Login retry behaviour / Hành vi thử lại đăng nhập

**Audience**: end-user operators of Ops Control v1.2
**Effective**: Sprint S-P0-FIX-3 (2026-05-03)

---

## English

If you sign in with a wrong username or password, the system shows a
single message:

> **Invalid credentials**

The same message appears whether the username does not exist or the
password is wrong. This is intentional — it stops attackers from
testing whether a username is valid.

If you fail to sign in **5 times in a row** with the same username,
the system temporarily blocks login attempts on that account for
**5 minutes**. After **10 failed attempts**, the block extends to
**30 minutes**.

During the block, you will keep seeing the same "Invalid credentials"
message even if you type the correct password. Wait the displayed
back-off period and try again. The block clears automatically; no
admin action is required for normal use.

If you remain unable to sign in after waiting:

1. Confirm Caps Lock is off.
2. Confirm you are using the right username (ask a coworker if unsure).
3. If you forgot your password, contact your administrator. The
   admin will reset it from **Settings → Account Control → Users**.

The system logs every login attempt (success or failure) with your
username and IP for audit purposes. Repeated failures may trigger a
notice to the administrator.

---

## Tiếng Việt

Khi bạn đăng nhập với tên đăng nhập hoặc mật khẩu sai, hệ thống chỉ
hiển thị một thông báo duy nhất:

> **Thông tin đăng nhập không hợp lệ**

Thông báo giống nhau dù tên đăng nhập không tồn tại hay mật khẩu sai.
Đây là cách bảo vệ tài khoản — kẻ tấn công không thể dò xem tên
đăng nhập nào có trong hệ thống.

Nếu bạn nhập sai **5 lần liên tiếp** với cùng một tên đăng nhập, hệ
thống tạm thời khóa tài khoản đó trong **5 phút**. Nếu tiếp tục sai
đến **10 lần**, thời gian khóa kéo dài lên **30 phút**.

Trong thời gian khóa, bạn vẫn thấy thông báo "Thông tin đăng nhập
không hợp lệ" ngay cả khi đã nhập đúng mật khẩu. Vui lòng đợi đủ
thời gian khóa rồi thử lại. Khóa tự gỡ — không cần quản trị viên
can thiệp với trường hợp dùng bình thường.

Nếu sau khi đợi vẫn không đăng nhập được:

1. Kiểm tra phím **Caps Lock** đã tắt chưa.
2. Xác nhận tên đăng nhập đúng (hỏi đồng nghiệp nếu cần).
3. Nếu quên mật khẩu, liên hệ quản trị viên. Quản trị có thể đặt
   lại tại **Cài đặt → Quản lý Tài khoản → Người dùng**.

Hệ thống ghi log mỗi lần đăng nhập (thành công hay thất bại) cùng
tên đăng nhập + địa chỉ IP để phục vụ audit. Thất bại nhiều lần
liên tiếp có thể kích hoạt cảnh báo gửi đến quản trị viên.

---

## Reference (engineering)

The unified response posture follows **OWASP ASVS V4.0 §6.2.4** —
verify that information enumeration is not possible via login,
password reset, or forgot-account functionality.

The technical implementation is in
[`server/routes/costApi.js:483-583`](../../server/routes/costApi.js)
(login route) and
[`server/services/authService.js`](../../server/services/authService.js)
(`equalizeTimingForUnknownUser` + per-username lockout state). Per-IP
rate-limit stays unchanged (10 attempts / 60 s window) because IP-bound
limits do not leak username existence.
