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
# اگر کد را آپلود کردی (نه clone)، اجرایی‌بودن اسکریپت‌ها از دست رفته است:
sudo chmod +x /srv/tellcall/deploy/scripts/*.sh

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

تنظیمات پشتیبان‌گیری فایل جدای خودش را دارد (فعلاً با همان پیش‌فرض‌ها؛ در قدم ۹ کاملش می‌کنیم):

```bash
sudo cp /srv/tellcall/deploy/env/backup.env.example /etc/tellcall/backup.env
sudo chown root:root /etc/tellcall/backup.env
sudo chmod 600 /etc/tellcall/backup.env
```

---

## ۵. سرویس‌ها

```bash
sudo cp /srv/tellcall/deploy/systemd/*.service /srv/tellcall/deploy/systemd/*.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable tellcall-api
sudo systemctl enable --now tellcall-demo-reset.timer
sudo systemctl enable --now tellcall-backup.timer
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

## ۹. پشتیبان‌گیری

سفارش‌ها، مشتری‌ها و **موجودی کیف پول‌ها** فقط در همین دیتابیس‌اند. اگر دیسک خراب شود، یک مایگریشن اشتباه اجرا شود یا کسی چیزی را پاک کند، بدون نسخه‌ی پشتیبان راهی برای برگرداندن نیست.

### چه کار می‌کند

`tellcall-backup.timer` هر شب ساعت **۳:۳۰ به وقت تهران** (نیم ساعت قبل از بازنشانی دمو) `deploy/scripts/backup.sh` را اجرا می‌کند:

1. از دیتابیس یک dump فشرده می‌گیرد، بدون اینکه فروشگاه قفل شود.
2. **مطمئن می‌شود dump سالم است.** بررسی می‌کند فایل کامل نوشته شده باشد، بعد آن را در یک دیتابیس موقت بازگردانی می‌کند، جدول‌ها و ردیف‌ها را می‌شمارد و دیتابیس موقت را پاک می‌کند. به نسخه‌ای که هیچ‌وقت بازگردانی نشده نمی‌شود اعتماد کرد.
3. از تصاویر آپلودشده هم یک آرشیو می‌سازد.
4. یک نسخه را **بیرون از سرور** می‌فرستد. پشتیبانی که روی همان دیسک باشد، با خود دیسک از بین می‌رود.
5. فقط ۱۴ نسخه‌ی آخر را روی سرور نگه می‌دارد و بقیه را پاک می‌کند.

علاوه بر این، `deploy.sh` هم **قبل از هر مایگریشن** یک نسخه با برچسب `pre-deploy` می‌گیرد. اگر این پشتیبان‌گیری شکست بخورد، استقرار ادامه پیدا نمی‌کند (`SKIP_BACKUP=1` این را دور می‌زند).

### کپی بیرون از سرور (rclone)

این کپی اطلاعات همه‌ی مشتری‌ها را دارد، پس قبل از خروج از سرور رمز می‌شود. برای این کار از یک remote از نوع `crypt` در rclone استفاده می‌کنیم:

```bash
sudo apt install -y rclone
sudo rclone config --config /etc/tellcall/rclone.conf
```

در منوی rclone:

1. یک remote برای فضای ذخیره‌ات بساز: فضای ابری S3 (مثلاً Object Storage ابر آروان)، هر S3 دیگر، یا SFTP به یک سیستم دیگر. اسمش را مثلاً `store` بگذار.
2. یک remote دوم از نوع **`crypt`** بساز به اسم `tellcall-crypt` و آن را روی پوشه‌ای از اولی بگذار، مثلاً `store:my-bucket/tellcall`. بگذار rclone دو رمزش را خودش بسازد.
3. **این دو رمز را همین الان بیرون از سرور ذخیره کن** (در password manager یا هر جای امن). فایل `rclone.conf` روی همین سرور است؛ اگر سرور از بین برود و رمزها جای دیگری نباشند، کپی‌های بیرون از سرور هم دیگر خوانده نمی‌شوند.

```bash
sudo chmod 600 /etc/tellcall/rclone.conf
sudo nano /etc/tellcall/backup.env     # BACKUP_RCLONE_REMOTE=tellcall-crypt:nightly
```

### خبردار شدن از شکست

پشتیبانی که بی‌صدا از کار افتاده باشد، معمولاً روزی کشف می‌شود که به آن نیاز داری. در [healthchecks.io](https://healthchecks.io) (یا Uptime Kuma از نوع push) یک check روزانه بساز و آدرسش را در `BACKUP_HEALTHCHECK_URL` بگذار. اسکریپت بعد از هر پشتیبان موفق آن آدرس را صدا می‌زند و بعد از هر شکست `<آدرس>/fail` را. اگر یک روز هیچ خبری نرسد، همان سرویس به تو اطلاع می‌دهد.

### اولین اجرا

```bash
sudo systemctl start tellcall-backup
journalctl -u tellcall-backup -n 30            # باید با «Backup complete.» تمام شود
ls -lh /var/backups/tellcall/
sudo rclone --config /etc/tellcall/rclone.conf ls tellcall-crypt:nightly
systemctl list-timers 'tellcall-*'             # زمان اجرای بعدی
```

### بازگردانی

**فقط امتحان** (به دیتابیس اصلی دست نمی‌زند):

```bash
sudo /srv/tellcall/deploy/scripts/restore.sh --check /var/backups/tellcall/daily-db-20261011-033000.sql.gz
```

**بازگردانی واقعی:** کل دیتابیس (و با `--uploads` تصاویر هم) با نسخه‌ی پشتیبان جایگزین می‌شود. اسکریپت قبل از شروع اسم دیتابیس را از تو می‌پرسد:

```bash
sudo /srv/tellcall/deploy/scripts/restore.sh \
  /var/backups/tellcall/daily-db-20261011-033000.sql.gz \
  --uploads /var/backups/tellcall/daily-uploads-20261011-033000.tar.gz
```

قبل از جایگزینی، از وضعیت فعلی یک نسخه با برچسب `pre-restore` گرفته می‌شود. پس اگر فایل اشتباهی را بازگردانی کردی، می‌توانی برگردی. اگر نسخه‌ی پشتیبان از قبل از یک مایگریشن باشد، بعد از بازگردانی مایگریشن‌ها اجرا می‌شوند تا دیتابیس با کد فعلی جور شود. تصاویر قبلی هم کنار گذاشته می‌شوند (`uploads.before-restore-…`) و پاک نمی‌شوند.

برای برداشتن یک نسخه از کپی بیرون از سرور:

```bash
sudo rclone --config /etc/tellcall/rclone.conf copy tellcall-crypt:nightly/daily-db-20261011-033000.sql.gz /var/backups/tellcall/
```

**اگر کل سرور از بین رفت:** روی سرور جدید قدم‌های ۱ تا ۵ را انجام بده. `rclone.conf` را با همان رمزهایی که بیرون از سرور ذخیره کرده بودی دوباره بساز، آخرین dump و آرشیو تصاویر را با دستور بالا بیاور، و `restore.sh` را با `--uploads` اجرا کن. بعد قدم‌های ۷ و ۸ را انجام بده.

**ماهی یک بار** یک نسخه را از کپی بیرون از سرور دانلود کن و با `--check` امتحانش کن. پشتیبان‌گیری شبانه خودش هر نسخه را امتحان می‌کند، ولی فقط این کار ثابت می‌کند که کپی بیرون از سرور و رمزهایش هم واقعاً کار می‌کنند.

---

## ۱۰. بررسی نهایی

- [ ] `https://shop.aboutarvin.ir` باز می‌شود و کالاها و تصاویر دیده می‌شوند
- [ ] ورود با حساب مشتری کار می‌کند
- [ ] `https://admin.shop.aboutarvin.ir` باز می‌شود و ورود ادمین کار می‌کند
- [ ] `curl -s https://shop.aboutarvin.ir/api/health` جواب می‌دهد
- [ ] `journalctl -u tellcall-backup -n 5` با «Backup complete.» تمام می‌شود

---

## ۱۱. صفحه‌ی پروژه در پورتفولیو

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

قبل از مایگریشن‌ها یک پشتیبان `pre-deploy` گرفته می‌شود (قدم ۹).

## لاگ‌ها

```bash
journalctl -u tellcall-api -f                  # بک‌اند
journalctl -u tellcall-demo-reset -n 50        # آخرین بازنشانی
journalctl -u tellcall-backup -n 50            # آخرین پشتیبان‌گیری
sudo tail -f /var/log/nginx/error.log          # nginx
```

---

## روزی که مشتری واقعی پیدا شد

در `/etc/tellcall/backend.env`:

1. خط `DEMO_MODE=true` را **حذف کن.** بدون آن، بک‌اند با sandbox بالا نمی‌آید و اسکریپت بازنشانی هم از کار می‌افتد — این دو محافظ عمدی‌اند.
2. `ZARINPAL_MODE=production` و `ZARINPAL_MERCHANT_ID` واقعی.
3. `SMSIR_API_KEY` و `SMSIR_OTP_TEMPLATE_ID` از پنل sms.ir، و ترجیحاً `SMSIR_ACCOUNT_EXISTS_TEMPLATE_ID`.
4. مشخصات کسب‌وکار (`SHOP_*`) و اینماد (`ENAMAD_ID`، `ENAMAD_CODE`) برای صفحه‌های تماس و قوانین.
5. `SENTRY_DSN`، تا خطاهای سرور فقط در لاگ گم نشوند.

و روی سرور:

```bash
sudo systemctl disable --now tellcall-demo-reset.timer
```

بعد حساب‌های دمو را حذف کن، دامنه‌ی tellcall.ir را بخر، آدرس‌ها را در nginx و env عوض کن، و پشتیبان‌گیری بیرون از سرور را (قدم ۹) راه بینداز.

در آخر این را اجرا کن. همه‌ی موارد بالا را یکی‌یکی بررسی می‌کند: تنظیمات، پشتیبان‌ها و تازگی‌شان، حساب‌های دمو و HTTPS. تا وقتی خطی با `[FAIL]` در خروجی هست، سفارش واقعی نگیر:

```bash
sudo /srv/tellcall/deploy/scripts/launch-check.sh
```

یک خرید واقعی با مبلغ کم هم انجام بده و بعد از پنل لغوش کن. فقط این کار ثابت می‌کند که درگاه واقعی، پیامک و بازگشت پول به کیف پول از اول تا آخر کار می‌کنند.
