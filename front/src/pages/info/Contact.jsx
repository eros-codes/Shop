import { Link } from 'react-router-dom';
import { Clock, Headphones, Mail, MapPin, Phone } from 'lucide-react';
import InfoPage, { Section, useShopInfo } from './InfoPage';
import { toPersianDigits } from '../../lib/format';

// The ticket is always there; every other way of reaching the shop appears
// only once its detail is set in the API's environment (SHOP_PHONE etc.).
export default function Contact() {
  const { business, name } = useShopInfo();
  const lines = [
    business.phone && {
      icon: Phone,
      label: 'تلفن',
      value: (
        <a href={`tel:${business.phone.replace(/[^\d+]/g, '')}`} dir="ltr">
          {toPersianDigits(business.phone)}
        </a>
      ),
    },
    business.email && {
      icon: Mail,
      label: 'ایمیل',
      value: (
        <a href={`mailto:${business.email}`} dir="ltr">
          {business.email}
        </a>
      ),
    },
    business.supportHours && { icon: Clock, label: 'ساعات پاسخ‌گویی', value: business.supportHours },
    business.address && { icon: MapPin, label: 'نشانی', value: business.address },
  ].filter(Boolean);

  return (
    <InfoPage title="تماس با ما" intro={`راه‌های ارتباط با ${name}.`}>
      <Section title="تیکت پشتیبانی">
        <p>
          سؤال درباره‌ی سفارش، پرداخت، مرجوعی یا حساب کاربری را با ثبت تیکت بپرسید؛ پاسخ
          در همان تیکت و در حساب کاربری شما نمایش داده می‌شود.
        </p>
        <Link className="btn btn-primary" to="/account/tickets/new">
          <Headphones size={16} />
          ثبت تیکت پشتیبانی
        </Link>
      </Section>

      {lines.length > 0 ? (
        <Section title="راه‌های دیگر">
          <div className="stack" style={{ gap: 10 }}>
            {lines.map((line) => (
              <div className="row" key={line.label} style={{ gap: 10, alignItems: 'flex-start' }}>
                <line.icon size={18} color="var(--brand-600)" />
                <div>
                  <div className="tiny muted">{line.label}</div>
                  <div className="small">{line.value}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </InfoPage>
  );
}
