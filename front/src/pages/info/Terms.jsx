import { Link } from 'react-router-dom';
import InfoPage, { Section, useShopInfo } from './InfoPage';
import { formatToman, toPersianDigits } from '../../lib/format';

// The rules the site enforces, in plain words - each one is something the
// API actually does (see OrdersService, ShippingService, DiscountCodesService).
export default function Terms() {
  const { name, taxRatePercent, paymentWindowMinutes, codMaxAmount } = useShopInfo();

  return (
    <InfoPage
      title="قوانین و مقررات"
      intro={`استفاده از فروشگاه ${name} و ثبت سفارش در آن به معنای پذیرفتن شرایط زیر است.`}
    >
      <Section title="حساب کاربری">
        <ul>
          <li>ثبت‌نام با شماره موبایل و کد تأییدی است که به همان شماره پیامک می‌شود.</li>
          <li>نگهداری رمز عبور بر عهده‌ی شماست. با تغییر رمز، از همه‌ی دستگاه‌ها خارج می‌شوید.</li>
        </ul>
      </Section>

      <Section title="قیمت و مالیات">
        <ul>
          <li>قیمت‌ها به تومان است.</li>
          <li>
            مالیات بر ارزش افزوده
            {taxRatePercent ? ` (${toPersianDigits(taxRatePercent)}٪ مبلغ کالاها پس از تخفیف)` : ''}{' '}
            و هزینه‌ی ارسال در مرحله‌ی تکمیل خرید جداگانه محاسبه می‌شوند. مبلغ نهایی پیش
            از پرداخت نمایش داده می‌شود و همان مبلغ دریافت می‌شود.
          </li>
          <li>افزودن کالا به سبد خرید آن را رزرو نمی‌کند؛ موجودی هنگام ثبت سفارش بررسی می‌شود.</li>
        </ul>
      </Section>

      <Section title="پرداخت">
        <ul>
          <li>پرداخت از کیف پول، پرداخت اینترنتی از درگاه بانکی زرین‌پال، یا پرداخت در محل.</li>
          <li>
            پرداخت در محل فقط با روش‌های ارسالی ممکن است که آن را ارائه می‌کنند
            {codMaxAmount ? `، و برای سفارش‌های تا ${formatToman(codMaxAmount)}` : ''}.
          </li>
          <li>
            سفارش پرداخت اینترنتی
            {paymentWindowMinutes ? ` تا ${toPersianDigits(paymentWindowMinutes)} دقیقه` : ' مدت کوتاهی'}{' '}
            منتظر پرداخت می‌ماند؛ پس از آن خودکار لغو و کالاهایش آزاد می‌شود.
          </li>
        </ul>
      </Section>

      <Section title="ارسال">
        <p>
          روش‌های ارسال، هزینه و زمان تقریبی تحویل هر یک بر اساس استان و وزن سفارش پیش
          از پرداخت نمایش داده می‌شود. زمان‌ها تخمینی است. کد رهگیری مرسوله پس از ارسال در
          صفحه‌ی سفارش می‌آید.
        </p>
      </Section>

      <Section title="کد تخفیف">
        <p>
          هر کد ممکن است بازه‌ی زمانی، حداقل مبلغ سفارش، سقف تخفیف، محدودیت تعداد استفاده
          یا محدودیت کالا و دسته‌بندی داشته باشد. اعمال‌شدن یا نشدن کد و مبلغ آن پیش از
          پرداخت نمایش داده می‌شود.
        </p>
      </Section>

      <Section title="کیف پول">
        <p>
          کیف پول از درگاه بانکی شارژ می‌شود و مبلغ مرجوعی‌ها و سفارش‌های لغوشده‌ی
          پرداخت‌شده به آن برمی‌گردد. ریز تراکنش‌ها در{' '}
          <Link to="/account/wallet">کیف پول</Link> نمایش داده می‌شود.
        </p>
      </Section>

      <Section title="مرجوعی و لغو">
        <p>
          شرایط آن در صفحه‌ی <Link to="/return-policy">شرایط مرجوعی</Link> آمده است.
        </p>
      </Section>

      <Section title="نظرات کاربران">
        <p>نظرهای ثبت‌شده درباره‌ی کالاها پس از بررسی و تأیید نمایش داده می‌شوند.</p>
      </Section>
    </InfoPage>
  );
}
