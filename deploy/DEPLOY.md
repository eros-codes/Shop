# استقرار tellcall روی سرور

این راهنما یک **دموی عمومی برای پورتفولیو** را روی یک سرور ابری اوبونتو (۲۲.۰۴ یا ۲۴.۰۴) بالا می‌آورد:

| آدرس | چه چیزی |
|---|---|
| `https://shop.aboutarvin.ir` | فروشگاه |
| `https://admin.shop.aboutarvin.ir` | پنل مدیریت |

هر کدام `/api` را روی همان میزبان به بک‌اند پراکسی می‌کنند — همان کاری که Vite در توسعه می‌کند. پس کوکی‌ها first-party می‌مانند و کوکی فروشگاه و پنل از هم جدا هستند.

همه‌ی این پیکربندی قبل از نوشتن این راهنما پشت یک nginx واقعی با HTTPS و `NODE_ENV=production` تست شده است.

---

## ۰. پیش از شروع

- **سرور ابری (VPS)، نه هاست اشتراکی.** NestJS یک پروسه‌ی دائمی است و MySQL هم کنارش لازم است. برای دمو حدود **۲ گیگ رم** کافی است.
- در DNS دامنه‌ی `aboutarvin.ir` دو رکورد `A` بساز که به IP سرور اشاره کنند:
  - `shop` → IP سرور
  - `admin.shop` → IP سرور

> **یک نکته‌ی عملی:** اگر سرور به مخازن خارجی (npm، NodeSource) دسترسی محدود داشت، از mirror داخلی که میزبانت ارائه می‌دهد استفاده کن.

---

## ۱. نصب بسته‌ها

```bash
sudo apt update
sudo apt install -y nginx mysql-server git curl certbot python3-certbot-nginx

# Node.js 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt install -y nodejs
node -v   # باید v22.x باشد
```

---

## ۲. کاربر و پوشه‌ها

```bash
sudo useradd --system --create-home --shell /usr/sbin/nologin tellcall

# کد: سه پوشه‌ی backend، front، admin و همین پوشه‌ی deploy
sudo mkdir -p /srv/tellcall
# ... کد را اینجا بگذار (git clone یا آپلود) ...
sudo chown -R tellcall:tellcall /srv/tellcall

# تصاویر آپلودشده، بیرون از پوشه‌ی کد تا استقرار بعدی دستشان نزند.
# هر دو سطح باید مال tellcall باشند - `install -d` فقط پوشه‌ی آخر را
# به کاربر می‌دهد.
sudo install -d -o tellcall -g tellcall /var/lib/tellcall
sudo install -d -o tellcall -g tellcall /var/lib/tellcall/uploads

sudo install -d /etc/tellcall
```

---

## ۳. دیتابیس

```bash
sudo mysql
```

```sql
CREATE DATABASE tellcall CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'tellcall'@'localhost' IDENTIFIED BY 'یک-رمز-قوی';
GRANT ALL PRIVILEGES ON tellcall.* TO 'tellcall'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

---

## ۴. فایل env

```bash
sudo cp /srv/tellcall/deploy/env/backend.env.example /etc/tellcall/backend.env
sudo nano /etc/tellcall/backend.env
```

هر `CHANGE_ME` را پر کن:

- `DB_PASSWORD` همان رمزی که در قدم ۳ گذاشتی
- `JWT_SECRET_KEY` و `OTP_HASH_SECRET` — هر کدام را جدا بساز:
  ```bash
  openssl rand -hex 32
  ```

بعد دسترسی را ببند — این فایل رمزها را دارد:

```bash
sudo chown root:tellcall /etc/tellcall/backend.env
sudo chmod 640 /etc/tellcall/backend.env
```

---

## ۵. سرویس‌ها

```bash
sudo cp /srv/tellcall/deploy/systemd/*.service /srv/tellcall/deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tellcall-api
sudo systemctl enable --now tellcall-demo-reset.timer
```

---

## ۶. اولین استقرار و داده‌ی دمو

```bash
sudo /srv/tellcall/deploy/scripts/deploy.sh
```

این اسکریپت بک‌اند و هر دو فرانت را build می‌کند، مایگریشن‌ها را اجرا می‌کند و سرویس را بالا می‌آورد. در production اسکیما هرگز خودکار عوض نمی‌شود، پس این تنها راه به‌روز شدن دیتابیس است.

بعد یک بار داده‌ی دمو را بریز (همان اسکریپتی که هر شب اجرا می‌شود):

```bash
sudo /srv/tellcall/deploy/scripts/reset-demo.sh
```

---

## ۷. nginx

```bash
sudo cp /srv/tellcall/deploy/nginx/tellcall-common.conf  /etc/nginx/snippets/
sudo cp /srv/tellcall/deploy/nginx/tellcall-headers.conf /etc/nginx/snippets/
sudo cp /srv/tellcall/deploy/nginx/tellcall.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/tellcall.conf /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

---

## ۸. HTTPS

**این قدم اختیاری نیست.** در production کوکی رفرش `Secure` است و مرورگر روی HTTP اصلاً ذخیره‌اش نمی‌کند — همه بعد از ۱۵ دقیقه بی‌صدا از حساب خارج می‌شوند.

```bash
sudo certbot --nginx -d shop.aboutarvin.ir -d admin.shop.aboutarvin.ir
```

certbot listener‌های HTTPS و ریدایرکت را خودش به فایل nginx اضافه می‌کند، و تمدید خودکار را هم راه می‌اندازد. یک بار امتحانش کن:

```bash
sudo certbot renew --dry-run
```

---

## ۹. بررسی نهایی

- [ ] `https://shop.aboutarvin.ir` باز می‌شود و کالاها و تصاویر دیده می‌شوند
- [ ] ورود با حساب مشتری کار می‌کند
- [ ] `https://admin.shop.aboutarvin.ir` باز می‌شود و ورود ادمین کار می‌کند
- [ ] `curl -s https://shop.aboutarvin.ir/api/health` جواب می‌دهد

---

## ۱۰. صفحه‌ی پروژه در پورتفولیو

پیامک در دمو تنظیم نشده، پس ثبت‌نام با کد تأیید کار نمی‌کند (با خطای ۵۰۳ متوقف می‌شود و کد هرگز در لاگ چاپ نمی‌شود). به‌جایش این حساب‌ها را روی صفحه‌ی پروژه بنویس:

| نقش | موبایل | رمز |
|---|---|---|
| مشتری | `09120000002` | `Passw0rd1` |
| مدیر | `09120000001` | `Passw0rd1` |

و بنویس که داده‌ها **هر شب ساعت ۴ صبح** به حالت اول برمی‌گردند — هر چه بازدیدکننده‌ها پاک یا اضافه کنند.

پرداخت آنلاین به sandbox زرین‌پال وصل است و پول واقعی جابه‌جا نمی‌شود.

---

## به‌روزرسانی بعدی

```bash
sudo /srv/tellcall/deploy/scripts/deploy.sh
```

## لاگ‌ها

```bash
journalctl -u tellcall-api -f                  # بک‌اند
journalctl -u tellcall-demo-reset -n 50        # آخرین بازنشانی
sudo tail -f /var/log/nginx/error.log          # nginx
```

---

## روزی که مشتری واقعی پیدا شد

در `/etc/tellcall/backend.env`:

1. خط `DEMO_MODE=true` را **حذف کن.** بدون آن، بک‌اند با sandbox بالا نمی‌آید و اسکریپت بازنشانی هم از کار می‌افتد — این دو محافظ عمدی‌اند.
2. `ZARINPAL_MODE=production` و `ZARINPAL_MERCHANT_ID` واقعی.
3. `SMSIR_API_KEY` و `SMSIR_OTP_TEMPLATE_ID` از پنل sms.ir.

و روی سرور:

```bash
sudo systemctl disable --now tellcall-demo-reset.timer
```

بعد حساب‌های دمو را حذف کن یا رمزشان را عوض کن، دامنه‌ی tellcall.ir را بخر، و آدرس‌ها را در nginx و env عوض کن.
