import { Link } from 'react-router-dom';
import InfoPage, { Section, useShopInfo } from './InfoPage';
import { toPersianDigits } from '../../lib/format';

// How returns work - written from ReturnsService: the window, the steps,
// what comes back (goods after their share of the discount, plus their
// share of the tax, to the wallet; shipping does not).
export default function ReturnPolicy() {
  const { returnWindowDays } = useShopInfo();
  const days = returnWindowDays;

  return (
    <InfoPage title="شرایط مرجوعی" intro="اگر کالایی که خریده‌اید مناسب نبود، مراحل مرجوع‌کردن آن این است.">
      {days === 0 ? (
        <Section title="مهلت مرجوعی">
          <p>در حال حاضر امکان مرجوع‌کردن کالا وجود ندارد.</p>
        </Section>
      ) : (
        <>
          <Section title="مهلت مرجوعی">
            <p>
              {days
                ? `تا ${toPersianDigits(days)} روز پس از تحویل سفارش`
                : 'در مهلت مرجوعی پس از تحویل سفارش'}{' '}
              می‌توانید درخواست مرجوعی ثبت کنید. پس از این مهلت، ثبت درخواست ممکن
              نیست.
            </p>
          </Section>

          <Section title="ثبت درخواست">
            <ol>
              <li>
                در <Link to="/account/orders">سفارش‌های من</Link>، سفارش تحویل‌شده را
                باز کنید و «ثبت درخواست» را بزنید.
              </li>
              <li>کالا و تعدادی را که می‌خواهید برگردانید انتخاب و دلیل آن را مشخص کنید.</li>
              <li>
                وضعیت درخواست و پاسخ پشتیبانی در <Link to="/account/returns">مرجوعی‌ها</Link>{' '}
                نمایش داده می‌شود.
              </li>
            </ol>
          </Section>

          <Section title="بررسی">
            <p>
              هر درخواست بررسی می‌شود و ممکن است تأیید یا رد شود؛ نتیجه و توضیح آن در
              صفحه‌ی مرجوعی‌ها می‌آید. پس از تأیید، کالا باید به فروشگاه برگردد؛ برای
              هماهنگی ارسال آن می‌توانید{' '}
              <Link to="/account/tickets/new?subject=return">تیکت پشتیبانی</Link> ثبت کنید.
              مبلغ پس از دریافت و بررسی کالا بازگردانده می‌شود.
            </p>
          </Section>

          <Section title="مبلغ بازگشتی">
            <p>
              مبلغی که بابت کالاهای مرجوعی پرداخته‌اید (پس از کسر سهم آن‌ها از تخفیف
              سفارش) به‌همراه سهم مالیات آن‌ها، به <Link to="/account/wallet">کیف پول</Link>{' '}
              شما واریز می‌شود. هزینه‌ی ارسال سفارش بازگردانده نمی‌شود.
            </p>
          </Section>
        </>
      )}

      <Section title="لغو سفارش">
        <ul>
          <li>
            سفارش «پرداخت در محل» را تا پیش از آماده‌سازی، خودتان از صفحه‌ی همان سفارش
            لغو کنید.
          </li>
          <li>
            اگر سفارشی پس از پرداخت و پیش از ارسال توسط فروشگاه لغو شود، کل مبلغ پرداختی
            به کیف پول شما برمی‌گردد.
          </li>
          <li>
            اگر پرداختی انجام شود ولی سفارش پیش از تأیید آن بسته شده باشد، مبلغ به کیف
            پول شما واریز می‌شود.
          </li>
        </ul>
      </Section>
    </InfoPage>
  );
}
