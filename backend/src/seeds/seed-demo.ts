import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { AppModule } from '../app.module';
import { User } from '../users/entities/user.entity';
import { Address } from '../address/entities/address.entity';
import { Category } from '../categories/entities/category.entity';
import { Brand } from '../brands/entities/brand.entity';
import { Product } from '../products/entities/product.entity';
import { ProductVariant } from '../products/entities/product-variant.entity';
import { ProductImage } from '../products/entities/product-image.entity';
import { DiscountCode } from '../discount-codes/entities/discount-code.entity';
import { ShippingZone } from '../shipping/entities/shipping-zone.entity';
import { ShippingMethod } from '../shipping/entities/shipping-method.entity';
import { ShippingRate } from '../shipping/entities/shipping-rate.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { Attribute } from '../attributes/entities/attribute.entity';
import { AttributeOption } from '../attributes/entities/attribute-option.entity';
import { CategoryAttribute } from '../attributes/entities/category-attribute.entity';
import { VariantAttributeValue } from '../attributes/entities/variant-attribute-value.entity';
import { ProductAttributeValue } from '../attributes/entities/product-attribute-value.entity';
import { Comment } from '../comments/entities/comment.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import userRoleEnum from '../users/enums/userRoleEnum';
import DiscountTypeEnum from '../discount-codes/enums/discount-type.enum';
import AttributeTypeEnum from '../attributes/enums/attribute-type.enum';
import OrderStatusEnum from '../orders/enums/order-status.enum';
import PaymentMethodEnum from '../orders/enums/payment-method.enum';
import CommentStatusEnum from '../comments/enums/comment-status.enum';
import { resolveUploadRoot } from '../common/storage/local-file-storage';
import { DEMO_ACCOUNT_MOBILES, isDemoMode } from '../common/demo/demo-accounts';
import { InvoiceService } from '../orders/invoice.service';
import { WalletTransaction } from '../wallets/entities/wallet-transaction.entity';
import WalletTransactionTypeEnum from '../wallets/enums/wallet-transaction-type.enum';
import { toUtcSql } from '../common/time/shop-time';

// A full electronics shop, ready to click through: phones in several
// colours and storage sizes, laptops by RAM and SSD, tablets, watches,
// audio and accessories - plus the orders, ratings and shipping rules
// that make the storefront and the admin panel show something real.
//
// Development only. Every write is idempotent, so running it twice gives
// the same shop rather than two of it.
const logger = new Logger('SeedDemo');
const DEMO_PASSWORD = 'Passw0rd1';

// Deterministic "randomness": the same catalogue every run, which makes
// screenshots and bug reports reproducible.
let seedState = 20260101;
const nextRandom = () => {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
};
const pick = <T>(items: T[]): T =>
  items[Math.floor(nextRandom() * items.length)];
const between = (min: number, max: number) =>
  min + Math.floor(nextRandom() * (max - min + 1));

const COLORS: Array<[string, string, string]> = [
  ['مشکی', 'black', '#111214'],
  ['سفید', 'white', '#f4f5f7'],
  ['نقره‌ای', 'silver', '#c8ccd2'],
  ['طلایی', 'gold', '#d8b26a'],
  ['آبی', 'blue', '#2a4b8d'],
  ['تیتانیوم طبیعی', 'titanium', '#8d8577'],
  ['سبز', 'green', '#2f6b52'],
  ['بنفش', 'purple', '#6b4b93'],
  ['خاکستری', 'graphite', '#55585e'],
  ['قرمز', 'red', '#b3261e'],
];

const STORAGES: Array<[string, string, number]> = [
  ['۶۴ گیگابایت', '64gb', 64],
  ['۱۲۸ گیگابایت', '128gb', 128],
  ['۲۵۶ گیگابایت', '256gb', 256],
  ['۵۱۲ گیگابایت', '512gb', 512],
  ['۱ ترابایت', '1tb', 1024],
];

const RAMS: Array<[string, string, number]> = [
  ['۸ گیگابایت', '8gb-ram', 8],
  ['۱۶ گیگابایت', '16gb-ram', 16],
  ['۲۴ گیگابایت', '24gb-ram', 24],
  ['۳۲ گیگابایت', '32gb-ram', 32],
];

const SIZES: Array<[string, string, number]> = [
  ['۴۰ میلی‌متر', '40mm', 40],
  ['۴۲ میلی‌متر', '42mm', 42],
  ['۴۴ میلی‌متر', '44mm', 44],
  ['۴۶ میلی‌متر', '46mm', 46],
  ['۴۹ میلی‌متر', '49mm', 49],
];

const CAPACITIES: Array<[string, string, number]> = [
  ['۱۰٬۰۰۰ میلی‌آمپر', '10000mah', 10000],
  ['۲۰٬۰۰۰ میلی‌آمپر', '20000mah', 20000],
];

type AxisKey = 'color' | 'storage' | 'ram' | 'size' | 'capacity';

interface ProductSeed {
  title: string;
  slug: string;
  brand: string;
  category: string;
  price: number;
  weight: number;
  description: string;
  screen?: number;
  warranty?: string;
  waterproof?: boolean;
  salePercent?: number;
  colors?: string[];
  storages?: string[];
  rams?: string[];
  sizes?: string[];
  capacities?: string[];
  // How much each step along an axis adds to the base price, in Toman.
  stepPrice?: Partial<Record<AxisKey, number>>;
}

const CATALOGUE: ProductSeed[] = [
  {
    title: 'گوشی اپل iPhone 17 Pro Max',
    slug: 'iphone-17-pro-max',
    brand: 'apple',
    category: 'mobiles',
    price: 169_900_000,
    weight: 240,
    screen: 6.9,
    warranty: '۱۸ ماه گارانتی شرکتی',
    waterproof: true,
    description:
      'پرچم‌دار اپل با بدنه تیتانیومی، تراشه A19 Pro، دوربین اصلی ۴۸ مگاپیکسلی و نمایشگر ۶.۹ اینچی ProMotion.',
    colors: ['titanium', 'black', 'white', 'blue'],
    storages: ['256gb', '512gb', '1tb'],
    stepPrice: { storage: 18_000_000 },
  },
  {
    title: 'گوشی اپل iPhone 17',
    slug: 'iphone-17',
    brand: 'apple',
    category: 'mobiles',
    price: 112_500_000,
    weight: 205,
    screen: 6.3,
    warranty: '۱۸ ماه گارانتی شرکتی',
    waterproof: true,
    salePercent: 7,
    description:
      'آیفون ۱۷ با تراشه A19، دوربین دوگانه ۴۸ مگاپیکسلی و نمایشگر ۶.۳ اینچی؛ تعادل قیمت و قدرت.',
    colors: ['black', 'white', 'blue', 'green'],
    storages: ['128gb', '256gb', '512gb'],
    stepPrice: { storage: 12_000_000 },
  },
  {
    title: 'گوشی اپل iPhone 16',
    slug: 'iphone-16',
    brand: 'apple',
    category: 'mobiles',
    price: 86_400_000,
    weight: 200,
    screen: 6.1,
    warranty: '۱۲ ماه گارانتی شرکتی',
    waterproof: true,
    salePercent: 12,
    description:
      'نسل قبل با همان کیفیت ساخت اپل و قیمتی منطقی‌تر؛ گزینه‌ی خوبی برای کسی که به تازه‌ترین نسل نیاز ندارد.',
    colors: ['black', 'white', 'purple'],
    storages: ['128gb', '256gb'],
    stepPrice: { storage: 10_500_000 },
  },
  {
    title: 'گوشی سامسونگ Galaxy S25 Ultra',
    slug: 'galaxy-s25-ultra',
    brand: 'samsung',
    category: 'mobiles',
    price: 142_000_000,
    weight: 235,
    screen: 6.8,
    warranty: '۱۸ ماه گارانتی شرکتی',
    waterproof: true,
    description:
      'پرچم‌دار سامسونگ با قلم S Pen، دوربین ۲۰۰ مگاپیکسلی و نمایشگر Dynamic AMOLED 2X با ۱۲۰ هرتز.',
    colors: ['titanium', 'black', 'silver', 'green'],
    storages: ['256gb', '512gb', '1tb'],
    stepPrice: { storage: 15_000_000 },
  },
  {
    title: 'گوشی سامسونگ Galaxy S25',
    slug: 'galaxy-s25',
    brand: 'samsung',
    category: 'mobiles',
    price: 92_700_000,
    weight: 196,
    screen: 6.2,
    warranty: '۱۸ ماه گارانتی شرکتی',
    waterproof: true,
    description:
      'اندازه‌ی جمع‌وجور، دوربین سه‌گانه و عملکرد روان با Snapdragon 8 Elite.',
    colors: ['black', 'silver', 'blue'],
    storages: ['128gb', '256gb'],
    stepPrice: { storage: 9_000_000 },
  },
  {
    title: 'گوشی سامسونگ Galaxy A56',
    slug: 'galaxy-a56',
    brand: 'samsung',
    category: 'mobiles',
    price: 32_400_000,
    weight: 210,
    screen: 6.7,
    warranty: '۱۸ ماه گارانتی شرکتی',
    salePercent: 9,
    description:
      'میان‌رده‌ی پرفروش سامسونگ با نمایشگر Super AMOLED، باتری ۵۰۰۰ و دوربین ۵۰ مگاپیکسلی.',
    colors: ['black', 'white', 'green'],
    storages: ['128gb', '256gb'],
    stepPrice: { storage: 4_500_000 },
  },
  {
    title: 'گوشی شیائومی Xiaomi 15',
    slug: 'xiaomi-15',
    brand: 'xiaomi',
    category: 'mobiles',
    price: 68_900_000,
    weight: 191,
    screen: 6.36,
    warranty: '۱۸ ماه گارانتی شرکتی',
    description:
      'دوربین با لنز لایکا، تراشه Snapdragon 8 Elite و شارژ سریع ۹۰ واتی.',
    colors: ['black', 'white', 'green'],
    storages: ['256gb', '512gb'],
    stepPrice: { storage: 8_500_000 },
  },
  {
    title: 'گوشی شیائومی Redmi Note 14 Pro',
    slug: 'redmi-note-14-pro',
    brand: 'xiaomi',
    category: 'mobiles',
    price: 21_800_000,
    weight: 205,
    screen: 6.67,
    warranty: '۱۸ ماه گارانتی شرکتی',
    salePercent: 15,
    description:
      'انتخاب اقتصادی با نمایشگر AMOLED ۱۲۰ هرتز، باتری ۵۵۰۰ و دوربین ۲۰۰ مگاپیکسلی.',
    colors: ['black', 'blue', 'purple'],
    storages: ['128gb', '256gb'],
    stepPrice: { storage: 3_200_000 },
  },

  {
    title: 'لپ‌تاپ اپل MacBook Air M4 ۱۳ اینچ',
    slug: 'macbook-air-m4-13',
    brand: 'apple',
    category: 'laptops',
    price: 118_000_000,
    weight: 1_240,
    screen: 13.6,
    warranty: '۱۲ ماه گارانتی شرکتی',
    description:
      'بدون فن، بی‌صدا و سبک، با تراشه M4 و باتری تا ۱۸ ساعت؛ انتخاب اول برای دانشجو و کار روزمره.',
    colors: ['silver', 'graphite', 'gold'],
    rams: ['16gb-ram', '24gb-ram'],
    storages: ['256gb', '512gb', '1tb'],
    stepPrice: { ram: 11_000_000, storage: 9_000_000 },
  },
  {
    title: 'لپ‌تاپ اپل MacBook Pro M4 Pro ۱۴ اینچ',
    slug: 'macbook-pro-m4-14',
    brand: 'apple',
    category: 'laptops',
    price: 215_000_000,
    weight: 1_600,
    screen: 14.2,
    warranty: '۱۲ ماه گارانتی شرکتی',
    description:
      'نمایشگر Liquid Retina XDR، تراشه M4 Pro و خنک‌کاری فعال برای رندر و کامپایل سنگین.',
    colors: ['graphite', 'silver'],
    rams: ['24gb-ram', '32gb-ram'],
    storages: ['512gb', '1tb'],
    stepPrice: { ram: 18_000_000, storage: 14_000_000 },
  },
  {
    title: 'لپ‌تاپ ایسوس ROG Strix G16',
    slug: 'asus-rog-strix-g16',
    brand: 'asus',
    category: 'laptops',
    price: 148_500_000,
    weight: 2_500,
    screen: 16,
    warranty: '۲۴ ماه گارانتی شرکتی',
    salePercent: 8,
    description:
      'لپ‌تاپ گیمینگ با RTX 5070، نمایشگر ۱۶ اینچی ۲۴۰ هرتز و کیبورد با نوربندی هر کلید.',
    colors: ['black', 'graphite'],
    rams: ['16gb-ram', '32gb-ram'],
    storages: ['512gb', '1tb'],
    stepPrice: { ram: 9_500_000, storage: 7_500_000 },
  },
  {
    title: 'لپ‌تاپ ایسوس Zenbook 14 OLED',
    slug: 'asus-zenbook-14-oled',
    brand: 'asus',
    category: 'laptops',
    price: 74_900_000,
    weight: 1_200,
    screen: 14,
    warranty: '۲۴ ماه گارانتی شرکتی',
    description:
      'اولترابوک سبک با نمایشگر OLED، پردازنده Core Ultra 7 و بدنه فلزی.',
    colors: ['silver', 'blue'],
    rams: ['16gb-ram', '32gb-ram'],
    storages: ['512gb', '1tb'],
    stepPrice: { ram: 8_000_000, storage: 6_500_000 },
  },
  {
    title: 'لپ‌تاپ لنوو IdeaPad Slim 5',
    slug: 'lenovo-ideapad-slim-5',
    brand: 'lenovo',
    category: 'laptops',
    price: 46_200_000,
    weight: 1_460,
    screen: 15.6,
    warranty: '۱۸ ماه گارانتی شرکتی',
    salePercent: 11,
    description:
      'لپ‌تاپ اداری و دانشجویی با Ryzen 7، صفحه‌کلید راحت و وزن متعادل.',
    colors: ['graphite', 'silver'],
    rams: ['8gb-ram', '16gb-ram'],
    storages: ['512gb', '1tb'],
    stepPrice: { ram: 5_500_000, storage: 4_800_000 },
  },
  {
    title: 'لپ‌تاپ اچ‌پی Victus 16',
    slug: 'hp-victus-16',
    brand: 'hp',
    category: 'laptops',
    price: 69_800_000,
    weight: 2_300,
    screen: 16.1,
    warranty: '۱۸ ماه گارانتی شرکتی',
    description:
      'گیمینگ اقتصادی با RTX 4060، نمایشگر ۱۴۴ هرتز و خنک‌کننده دوفن.',
    colors: ['black', 'blue'],
    rams: ['16gb-ram', '32gb-ram'],
    storages: ['512gb', '1tb'],
    stepPrice: { ram: 6_500_000, storage: 5_500_000 },
  },

  {
    title: 'تبلت اپل iPad Air M3 ۱۱ اینچ',
    slug: 'ipad-air-m3-11',
    brand: 'apple',
    category: 'tablets',
    price: 63_500_000,
    weight: 460,
    screen: 11,
    warranty: '۱۲ ماه گارانتی شرکتی',
    description:
      'تبلت سبک با تراشه M3، پشتیبانی از Apple Pencil Pro و نمایشگر Liquid Retina.',
    colors: ['silver', 'blue', 'purple'],
    storages: ['128gb', '256gb', '512gb'],
    stepPrice: { storage: 7_500_000 },
  },
  {
    title: 'تبلت اپل iPad Pro M4 ۱۳ اینچ',
    slug: 'ipad-pro-m4-13',
    brand: 'apple',
    category: 'tablets',
    price: 138_000_000,
    weight: 580,
    screen: 13,
    warranty: '۱۲ ماه گارانتی شرکتی',
    description:
      'نازک‌ترین محصول اپل با نمایشگر Ultra Retina XDR و تراشه M4؛ جایگزین جدی لپ‌تاپ برای طراحی.',
    colors: ['silver', 'graphite'],
    storages: ['256gb', '512gb', '1tb'],
    stepPrice: { storage: 16_000_000 },
  },
  {
    title: 'تبلت سامسونگ Galaxy Tab S10 FE',
    slug: 'galaxy-tab-s10-fe',
    brand: 'samsung',
    category: 'tablets',
    price: 38_700_000,
    weight: 520,
    screen: 10.9,
    warranty: '۱۸ ماه گارانتی شرکتی',
    salePercent: 10,
    description: 'تبلت میان‌رده با قلم S Pen همراه جعبه و نمایشگر ۹۰ هرتز.',
    colors: ['silver', 'green', 'blue'],
    storages: ['128gb', '256gb'],
    stepPrice: { storage: 5_000_000 },
  },
  {
    title: 'تبلت شیائومی Xiaomi Pad 7',
    slug: 'xiaomi-pad-7',
    brand: 'xiaomi',
    category: 'tablets',
    price: 24_300_000,
    weight: 500,
    screen: 11.2,
    warranty: '۱۸ ماه گارانتی شرکتی',
    description: 'نمایشگر ۳.۲K با نرخ ۱۴۴ هرتز و بدنه فلزی، با قیمتی رقابتی.',
    colors: ['silver', 'green'],
    storages: ['128gb', '256gb'],
    stepPrice: { storage: 3_500_000 },
  },

  {
    title: 'ساعت هوشمند اپل Watch Series 10',
    slug: 'apple-watch-series-10',
    brand: 'apple',
    category: 'watches',
    price: 42_800_000,
    weight: 120,
    warranty: '۱۲ ماه گارانتی شرکتی',
    waterproof: true,
    description:
      'نمایشگر بزرگ‌تر و بدنه نازک‌تر، با سنسور اکسیژن خون و تشخیص آپنه خواب.',
    colors: ['black', 'silver', 'gold'],
    sizes: ['42mm', '46mm'],
    stepPrice: { size: 3_500_000 },
  },
  {
    title: 'ساعت هوشمند اپل Watch Ultra 3',
    slug: 'apple-watch-ultra-3',
    brand: 'apple',
    category: 'watches',
    price: 78_500_000,
    weight: 160,
    warranty: '۱۲ ماه گارانتی شرکتی',
    waterproof: true,
    description:
      'بدنه تیتانیومی، مقاومت تا ۱۰۰ متر و باتری تا ۷۲ ساعت؛ برای ورزش‌های سخت.',
    colors: ['titanium', 'black'],
    sizes: ['49mm'],
  },
  {
    title: 'ساعت هوشمند سامسونگ Galaxy Watch 7',
    slug: 'galaxy-watch-7',
    brand: 'samsung',
    category: 'watches',
    price: 26_900_000,
    weight: 110,
    warranty: '۱۸ ماه گارانتی شرکتی',
    waterproof: true,
    salePercent: 14,
    description: 'پایش خواب و ترکیب بدن، با Wear OS و شارژ سریع.',
    colors: ['black', 'silver', 'green'],
    sizes: ['40mm', '44mm'],
    stepPrice: { size: 2_200_000 },
  },

  {
    title: 'هندزفری اپل AirPods Pro 3',
    slug: 'airpods-pro-3',
    brand: 'apple',
    category: 'audio',
    price: 31_900_000,
    weight: 60,
    warranty: '۱۲ ماه گارانتی شرکتی',
    waterproof: true,
    description:
      'حذف نویز فعال نسل جدید، شفافیت تطبیقی و تا ۳۰ ساعت شارژدهی با کیس.',
    colors: ['white'],
  },
  {
    title: 'هندزفری اپل AirPods 4',
    slug: 'airpods-4',
    brand: 'apple',
    category: 'audio',
    price: 19_500_000,
    weight: 55,
    warranty: '۱۲ ماه گارانتی شرکتی',
    salePercent: 10,
    description: 'طراحی باز و سبک، با صدای فضایی و کیس شارژ USB-C.',
    colors: ['white'],
  },
  {
    title: 'هدفون سونی WH-1000XM6',
    slug: 'sony-wh-1000xm6',
    brand: 'sony',
    category: 'audio',
    price: 36_400_000,
    weight: 260,
    warranty: '۱۸ ماه گارانتی شرکتی',
    description: 'بهترین حذف نویز بازار، باتری ۳۰ ساعته و تاشوی کامل برای سفر.',
    colors: ['black', 'silver', 'blue'],
  },
  {
    title: 'هندزفری سامسونگ Galaxy Buds 3 Pro',
    slug: 'galaxy-buds-3-pro',
    brand: 'samsung',
    category: 'audio',
    price: 14_800_000,
    weight: 55,
    warranty: '۱۸ ماه گارانتی شرکتی',
    waterproof: true,
    description: 'صدای Hi-Fi با حذف نویز هوشمند و ترجمه هم‌زمان با گلکسی.',
    colors: ['white', 'silver'],
  },
  {
    title: 'هدفون JBL Tune 770NC',
    slug: 'jbl-tune-770nc',
    brand: 'jbl',
    category: 'audio',
    price: 7_900_000,
    weight: 220,
    warranty: '۱۲ ماه گارانتی شرکتی',
    salePercent: 18,
    description: 'هدفون بی‌سیم اقتصادی با حذف نویز و باتری ۷۰ ساعته.',
    colors: ['black', 'white', 'blue'],
  },
  {
    title: 'هندزفری شیائومی Redmi Buds 6',
    slug: 'redmi-buds-6',
    brand: 'xiaomi',
    category: 'audio',
    price: 3_450_000,
    weight: 45,
    warranty: '۱۲ ماه گارانتی شرکتی',
    description: 'گزینه‌ی مقرون‌به‌صرفه با حذف نویز پایه و اتصال پایدار.',
    colors: ['white', 'black', 'blue'],
  },

  {
    title: 'پاوربانک انکر PowerCore',
    slug: 'anker-powercore',
    brand: 'anker',
    category: 'power',
    price: 4_650_000,
    weight: 420,
    warranty: '۱۸ ماه گارانتی شرکتی',
    description: 'شارژ سریع ۳۰ وات با نمایشگر دیجیتال درصد باتری.',
    colors: ['black', 'white'],
    capacities: ['10000mah', '20000mah'],
    stepPrice: { capacity: 1_850_000 },
  },
  {
    title: 'شارژر دیواری انکر ۶۵ وات GaN',
    slug: 'anker-65w-gan',
    brand: 'anker',
    category: 'power',
    price: 2_980_000,
    weight: 120,
    warranty: '۱۸ ماه گارانتی شرکتی',
    salePercent: 12,
    description: 'سه پورت، فناوری GaN و اندازه‌ی کوچک؛ یک شارژر برای همه‌چیز.',
    colors: ['white', 'black'],
  },
  {
    title: 'کابل USB-C به USB-C انکر ۱۰۰ وات',
    slug: 'anker-usbc-cable',
    brand: 'anker',
    category: 'accessories',
    price: 890_000,
    weight: 70,
    warranty: '۱۲ ماه گارانتی شرکتی',
    description: 'کابل بافته‌شده با تحمل ۱۰٬۰۰۰ بار خم شدن و انتقال ۱۰۰ وات.',
    colors: ['black', 'white'],
  },
  {
    title: 'قاب محافظ شفاف مگ‌سیف',
    slug: 'magsafe-clear-case',
    brand: 'anker',
    category: 'accessories',
    price: 1_250_000,
    weight: 60,
    warranty: '۶ ماه گارانتی',
    description: 'قاب شفاف ضدزرد با حلقه مغناطیسی و لبه‌های برجسته.',
    colors: ['white', 'black', 'blue'],
  },
  {
    title: 'گلس محافظ صفحه فول‌چسب',
    slug: 'full-glue-screen-protector',
    brand: 'anker',
    category: 'accessories',
    price: 420_000,
    weight: 30,
    warranty: '۳ ماه گارانتی',
    salePercent: 20,
    description: 'محافظ صفحه شیشه‌ای ۹H با پوشش کامل و بسته‌بندی نصب آسان.',
    colors: ['black'],
  },
];

const CATEGORY_TREE: Array<{
  title: string;
  slug: string;
  children?: Array<{ title: string; slug: string }>;
}> = [
  {
    title: 'کالای دیجیتال',
    slug: 'digital',
    children: [
      { title: 'گوشی موبایل', slug: 'mobiles' },
      { title: 'لپ‌تاپ', slug: 'laptops' },
      { title: 'تبلت', slug: 'tablets' },
      { title: 'ساعت هوشمند', slug: 'watches' },
      { title: 'هدفون و هندزفری', slug: 'audio' },
    ],
  },
  {
    title: 'لوازم جانبی',
    slug: 'accessories-root',
    children: [
      { title: 'شارژر و پاوربانک', slug: 'power' },
      { title: 'کابل و قاب', slug: 'accessories' },
    ],
  },
];

const BRANDS: Array<[string, string]> = [
  ['اپل', 'apple'],
  ['سامسونگ', 'samsung'],
  ['شیائومی', 'xiaomi'],
  ['ایسوس', 'asus'],
  ['لنوو', 'lenovo'],
  ['اچ‌پی', 'hp'],
  ['سونی', 'sony'],
  ['جی‌بی‌ال', 'jbl'],
  ['انکر', 'anker'],
];

const REVIEWS = [
  'کیفیت ساخت واقعاً عالیه، ارزش خریدش رو داشت.',
  'سریع رسید و اصل بود. ممنون از فروشگاه.',
  'باتریش از چیزی که فکر می‌کردم بهتر دووم میاره.',
  'قیمتش نسبت به بازار منصفانه‌ست.',
  'بسته‌بندی خیلی مرتب بود و کالا سالم رسید.',
  'برای کار روزمره کاملاً کافیه، راضی‌ام.',
  'دوربینش توی نور کم هم خوب جواب می‌ده.',
  'یه ذره سنگین‌تر از انتظارم بود ولی در کل خوبه.',
];

// A flat, brand-tinted artwork per product, drawn per category so a charger
// does not look like a phone. Transparent background on purpose: the card
// supplies its own tinted panel, and a painted-in background would hide it.
// No product name baked in either — the card already prints the title.
type ArtShape =
  | 'phone'
  | 'tablet'
  | 'laptop'
  | 'watch'
  | 'headphone'
  | 'earbuds'
  | 'powerbank'
  | 'charger'
  | 'cable'
  | 'case'
  | 'glass';

function pickShape(title: string, category: string): ArtShape {
  switch (category) {
    case 'mobiles':
      return 'phone';
    case 'tablets':
      return 'tablet';
    case 'laptops':
      return 'laptop';
    case 'watches':
      return 'watch';
    case 'audio':
      return title.includes('هدفون') ? 'headphone' : 'earbuds';
    case 'power':
      return title.includes('پاوربانک') ? 'powerbank' : 'charger';
    case 'accessories':
      if (title.includes('کابل')) return 'cable';
      if (title.includes('قاب')) return 'case';
      return 'glass';
    default:
      return 'phone';
  }
}

// Each body is drawn inside a 600x600 box, subject roughly spanning y 90..510
// so every category reads at the same optical size on a card.
const ART_BODIES: Record<ArtShape, string> = {
  phone: `
  <rect x="205" y="90" width="190" height="420" rx="38" fill="url(#device)"/>
  <rect x="221" y="106" width="158" height="388" rx="28" fill="#ffffff" opacity="0.13"/>
  <rect x="268" y="114" width="64" height="13" rx="6.5" fill="#ffffff" opacity="0.42"/>
  <rect x="226" y="112" width="62" height="62" rx="18" fill="#ffffff" opacity="0.10"/>`,

  tablet: `
  <rect x="150" y="110" width="300" height="380" rx="30" fill="url(#device)"/>
  <rect x="168" y="128" width="264" height="344" rx="20" fill="#ffffff" opacity="0.13"/>
  <circle cx="300" cy="119" r="4.5" fill="#ffffff" opacity="0.45"/>`,

  laptop: `
  <rect x="130" y="135" width="340" height="226" rx="16" fill="url(#device)"/>
  <rect x="145" y="150" width="310" height="196" rx="9" fill="#ffffff" opacity="0.13"/>
  <path d="M95 361 H505 L532 424 H68 Z" fill="url(#device)"/>
  <rect x="262" y="366" width="76" height="8" rx="4" fill="#ffffff" opacity="0.3"/>`,

  watch: `
  <rect x="246" y="92" width="108" height="118" rx="30" fill="url(#device)" opacity="0.7"/>
  <rect x="246" y="392" width="108" height="118" rx="30" fill="url(#device)" opacity="0.7"/>
  <rect x="218" y="178" width="164" height="244" rx="52" fill="url(#device)"/>
  <rect x="236" y="196" width="128" height="208" rx="38" fill="#ffffff" opacity="0.14"/>
  <rect x="382" y="262" width="13" height="42" rx="6.5" fill="url(#device)"/>`,

  headphone: `
  <path d="M158 352 V288 a142 142 0 0 1 284 0 V352" fill="none" stroke="url(#device)"
        stroke-width="32" stroke-linecap="round"/>
  <rect x="124" y="320" width="96" height="170" rx="46" fill="url(#device)"/>
  <rect x="380" y="320" width="96" height="170" rx="46" fill="url(#device)"/>
  <rect x="143" y="341" width="58" height="128" rx="32" fill="#ffffff" opacity="0.15"/>
  <rect x="399" y="341" width="58" height="128" rx="32" fill="#ffffff" opacity="0.15"/>`,

  earbuds: `
  <rect x="186" y="246" width="228" height="206" rx="56" fill="url(#device)"/>
  <rect x="204" y="264" width="192" height="170" rx="44" fill="#ffffff" opacity="0.12"/>
  <rect x="246" y="330" width="108" height="7" rx="3.5" fill="#ffffff" opacity="0.3"/>
  <path d="M232 118 a34 34 0 0 1 68 0 v54 a18 18 0 0 1 -36 0 z" fill="url(#device)"/>
  <path d="M300 118 a34 34 0 0 1 68 0 v54 a18 18 0 0 1 -36 0 z" fill="url(#device)"/>
  <circle cx="266" cy="132" r="13" fill="#ffffff" opacity="0.22"/>
  <circle cx="334" cy="132" r="13" fill="#ffffff" opacity="0.22"/>`,

  powerbank: `
  <rect x="166" y="156" width="268" height="300" rx="46" fill="url(#device)"/>
  <rect x="186" y="176" width="228" height="260" rx="34" fill="#ffffff" opacity="0.10"/>
  <rect x="206" y="212" width="188" height="86" rx="20" fill="#ffffff" opacity="0.16"/>
  <circle cx="252" cy="372" r="9" fill="#ffffff" opacity="0.5"/>
  <circle cx="284" cy="372" r="9" fill="#ffffff" opacity="0.5"/>
  <circle cx="316" cy="372" r="9" fill="#ffffff" opacity="0.5"/>
  <circle cx="348" cy="372" r="9" fill="#ffffff" opacity="0.2"/>
  <rect x="244" y="440" width="52" height="16" rx="8" fill="#ffffff" opacity="0.34"/>
  <rect x="320" y="443" width="40" height="11" rx="5.5" fill="#ffffff" opacity="0.34"/>`,

  charger: `
  <rect x="262" y="92" width="22" height="78" rx="8" fill="url(#device)" opacity="0.8"/>
  <rect x="316" y="92" width="22" height="78" rx="8" fill="url(#device)" opacity="0.8"/>
  <rect x="180" y="160" width="240" height="266" rx="52" fill="url(#device)"/>
  <rect x="200" y="180" width="200" height="226" rx="40" fill="#ffffff" opacity="0.11"/>
  <rect x="266" y="372" width="68" height="18" rx="9" fill="#ffffff" opacity="0.32"/>
  <rect x="222" y="226" width="70" height="8" rx="4" fill="#ffffff" opacity="0.22"/>`,

  cable: `
  <path d="M196 176 C 196 330, 92 330, 92 408 C 92 486, 300 486, 404 428"
        fill="none" stroke="url(#device)" stroke-width="26" stroke-linecap="round"
        opacity="0.9"/>
  <rect x="160" y="96" width="72" height="104" rx="22" fill="url(#device)"/>
  <rect x="178" y="74" width="36" height="28" rx="10" fill="url(#device)" opacity="0.65"/>
  <rect x="176" y="128" width="40" height="8" rx="4" fill="#ffffff" opacity="0.26"/>
  <rect x="384" y="382" width="104" height="72" rx="22" fill="url(#device)"
        transform="rotate(-28 436 418)"/>
  <rect x="470" y="400" width="28" height="36" rx="10" fill="url(#device)" opacity="0.65"
        transform="rotate(-28 484 418)"/>`,

  case: `
  <path d="M205 90 h190 a38 38 0 0 1 38 38 v344 a38 38 0 0 1 -38 38 h-190
           a38 38 0 0 1 -38 -38 v-344 a38 38 0 0 1 38 -38 z
           M221 122 h158 a16 16 0 0 1 16 16 v324 a16 16 0 0 1 -16 16 h-158
           a16 16 0 0 1 -16 -16 v-324 a16 16 0 0 1 16 -16 z"
        fill="url(#device)" fill-rule="evenodd" opacity="0.82"/>
  <rect x="222" y="118" width="74" height="74" rx="22" fill="url(#device)" opacity="0.5"/>
  <circle cx="300" cy="258" r="42" fill="url(#device)" opacity="0.14"/>`,

  glass: `
  <rect x="196" y="100" width="208" height="400" rx="26" fill="url(#device)" opacity="0.5"/>
  <rect x="212" y="116" width="176" height="368" rx="18" fill="#ffffff" opacity="0.2"/>
  <path d="M212 420 L388 196 v96 L256 452 z" fill="#ffffff" opacity="0.26"/>
  <rect x="268" y="120" width="64" height="11" rx="5.5" fill="url(#device)" opacity="0.55"/>`,
};

function productArtwork(
  title: string,
  tint: string,
  variant = 0,
  category = 'mobiles',
): string {
  const shades = ['#0f2550', '#143266', '#1b4087'];
  const base = shades[variant % shades.length];
  const body = ART_BODIES[pickShape(title, category)];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <linearGradient id="device" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${tint}"/>
      <stop offset="1" stop-color="${base}"/>
    </linearGradient>
    <radialGradient id="halo" cx="0.5" cy="0.45" r="0.55">
      <stop offset="0" stop-color="${tint}" stop-opacity="0.16"/>
      <stop offset="1" stop-color="${tint}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="300" cy="280" r="240" fill="url(#halo)"/>${body}
</svg>`;
}

async function seed() {
  // The accounts this creates have their password printed on a web page.
  // A real shop must never get them; the public demo is the one production
  // server that wants exactly that, and it says so with DEMO_MODE=true -
  // its nightly reset (deploy/scripts/reset-demo.sh) runs this script.
  if (process.env.NODE_ENV === 'production' && !isDemoMode()) {
    console.error(
      'Refusing to seed demo data into a production database. This script ' +
        'creates test accounts with a known password. (A public demo sets ' +
        'DEMO_MODE=true.)',
    );
    process.exit(1);
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const dataSource = app.get(DataSource);

  try {
    const password = await bcrypt.hash(DEMO_PASSWORD, 10);
    const users = dataSource.getRepository(User);

    const upsertUser = async (
      mobile: string,
      display_name: string,
      role: userRoleEnum,
    ) => {
      const existing = await users.findOne({ where: { mobile } });
      if (existing) return existing;
      return users.save(users.create({ mobile, display_name, password, role }));
    };

    // The same list the demo guard locks (common/demo/demo-accounts.ts):
    // the first number is the admin, the rest are customers.
    const [adminMobile, ...customerMobiles] = DEMO_ACCOUNT_MOBILES;
    const customerNames = ['علی رضایی', 'سارا محمدی', 'نیما کریمی'];
    const admin = await upsertUser(
      adminMobile,
      'مدیر فروشگاه',
      userRoleEnum.AdminUser,
    );
    const customers: User[] = [];
    for (const [index, mobile] of customerMobiles.entries()) {
      customers.push(
        await upsertUser(
          mobile,
          customerNames[index] ?? `مشتری ${index + 1}`,
          userRoleEnum.NormalUser,
        ),
      );
    }

    // Opened with a ledger entry, like a charge from the panel: a balance
    // with no history behind it shows up in the wallet page as money from
    // nowhere.
    const wallets = dataSource.getRepository(Wallet);
    const walletLedger = dataSource.getRepository(WalletTransaction);
    const openingBalance = 250_000_000;
    for (const customer of customers) {
      const existing = await wallets.findOne({
        where: { user: { id: customer.id } },
      });
      if (!existing) {
        const wallet = await wallets.save(
          wallets.create({
            user: customer,
            amount: openingBalance,
            is_active: true,
          }),
        );
        await walletLedger.save(
          walletLedger.create({
            wallet,
            amount: openingBalance,
            balanceAfter: openingBalance,
            type: WalletTransactionTypeEnum.AdminCharge,
            description: 'Demo opening balance',
          }),
        );
      }
    }

    const addresses = dataSource.getRepository(Address);
    const cities: Array<[string, string, string]> = [
      ['تهران', 'تهران', 'خیابان ولیعصر، نرسیده به پارک‌وی، پلاک ۱۲۰'],
      ['آذربایجان شرقی', 'تبریز', 'خیابان آزادی، روبه‌روی دانشگاه، پلاک ۴۵'],
      ['اصفهان', 'اصفهان', 'خیابان چهارباغ بالا، کوچه ۱۲، پلاک ۸'],
    ];
    for (const [index, customer] of customers.entries()) {
      const existing = await addresses.findOne({
        where: { user: { id: customer.id } },
      });
      if (!existing) {
        const [province, city, line] = cities[index % cities.length];
        await addresses.save(
          addresses.create({
            user: customer,
            province,
            city,
            address: line,
            postal_code: `${1000000000 + index * 11111}`,
            receiver_mobile: customer.mobile,
          }),
        );
      }
    }

    const categories = dataSource.getRepository(Category);
    const categoryBySlug = new Map<string, Category>();
    for (const node of CATEGORY_TREE) {
      let parent = await categories.findOne({ where: { slug: node.slug } });
      if (!parent) {
        parent = await categories.save(
          categories.create({ title: node.title, slug: node.slug }),
        );
      }
      categoryBySlug.set(node.slug, parent);

      for (const child of node.children ?? []) {
        let row = await categories.findOne({ where: { slug: child.slug } });
        if (!row) {
          row = await categories.save(
            categories.create({ title: child.title, slug: child.slug, parent }),
          );
        }
        categoryBySlug.set(child.slug, row);
      }
    }

    const brands = dataSource.getRepository(Brand);
    const brandBySlug = new Map<string, Brand>();
    for (const [title, slug] of BRANDS) {
      let row = await brands.findOne({ where: { slug } });
      if (!row) row = await brands.save(brands.create({ title, slug }));
      brandBySlug.set(slug, row);
    }

    const attributes = dataSource.getRepository(Attribute);
    const attributeOptions = dataSource.getRepository(AttributeOption);
    const categoryAttributes = dataSource.getRepository(CategoryAttribute);

    const upsertAttribute = async (data: {
      title: string;
      code: string;
      type: AttributeTypeEnum;
      unit?: string;
      axis: boolean;
      values: Array<{
        value: string;
        slug: string;
        hex?: string;
        numeric?: number;
      }>;
    }) => {
      let attribute = await attributes.findOne({
        where: { code: data.code },
        relations: { options: true },
      });
      if (!attribute) {
        attribute = await attributes.save(
          attributes.create({
            title: data.title,
            code: data.code,
            type: data.type,
            unit: data.unit ?? null,
            is_variant_axis: data.axis,
            is_filterable: true,
          }),
        );
        attribute.options = [];
      }
      for (const [index, value] of data.values.entries()) {
        if (
          (attribute.options ?? []).some((option) => option.slug === value.slug)
        ) {
          continue;
        }
        const option = await attributeOptions.save(
          attributeOptions.create({
            attribute,
            value: value.value,
            slug: value.slug,
            hex: value.hex ?? null,
            sort_order: index + 1,
            numeric_value:
              value.numeric === undefined ? null : String(value.numeric),
          }),
        );
        attribute.options = [...(attribute.options ?? []), option];
      }
      return attribute;
    };

    const colorAttribute = await upsertAttribute({
      title: 'رنگ',
      code: 'color',
      type: AttributeTypeEnum.Color,
      axis: true,
      values: COLORS.map(([value, slug, hex]) => ({ value, slug, hex })),
    });
    const storageAttribute = await upsertAttribute({
      title: 'حافظه داخلی',
      code: 'storage',
      type: AttributeTypeEnum.Select,
      unit: 'GB',
      axis: true,
      values: STORAGES.map(([value, slug, numeric]) => ({
        value,
        slug,
        numeric,
      })),
    });
    const ramAttribute = await upsertAttribute({
      title: 'حافظه رم',
      code: 'ram',
      type: AttributeTypeEnum.Select,
      unit: 'GB',
      axis: true,
      values: RAMS.map(([value, slug, numeric]) => ({ value, slug, numeric })),
    });
    const sizeAttribute = await upsertAttribute({
      title: 'سایز',
      code: 'size',
      type: AttributeTypeEnum.Select,
      unit: 'mm',
      axis: true,
      values: SIZES.map(([value, slug, numeric]) => ({ value, slug, numeric })),
    });
    const capacityAttribute = await upsertAttribute({
      title: 'ظرفیت باتری',
      code: 'capacity',
      type: AttributeTypeEnum.Select,
      unit: 'mAh',
      axis: true,
      values: CAPACITIES.map(([value, slug, numeric]) => ({
        value,
        slug,
        numeric,
      })),
    });

    // Descriptive, not axes: they describe a product without splitting
    // its stock.
    const screenAttribute = await upsertAttribute({
      title: 'اندازه نمایشگر',
      code: 'screen-size',
      type: AttributeTypeEnum.Number,
      unit: 'اینچ',
      axis: false,
      values: [],
    });
    const warrantyAttribute = await upsertAttribute({
      title: 'گارانتی',
      code: 'warranty',
      type: AttributeTypeEnum.Text,
      axis: false,
      values: [],
    });
    const waterproofAttribute = await upsertAttribute({
      title: 'مقاوم در برابر آب',
      code: 'waterproof',
      type: AttributeTypeEnum.Boolean,
      axis: false,
      values: [],
    });

    const axisByKey: Record<AxisKey, Attribute> = {
      color: colorAttribute,
      storage: storageAttribute,
      ram: ramAttribute,
      size: sizeAttribute,
      capacity: capacityAttribute,
    };

    const attachToCategory = async (
      categorySlug: string,
      attribute: Attribute,
      required: boolean,
    ) => {
      const category = categoryBySlug.get(categorySlug);
      if (!category) return;
      const existing = await categoryAttributes.findOne({
        where: {
          category: { id: category.id },
          attribute: { id: attribute.id },
        },
      });
      if (existing) return;
      await categoryAttributes.save(
        categoryAttributes.create({
          category,
          attribute,
          is_required: required,
        }),
      );
    };

    await attachToCategory('mobiles', colorAttribute, true);
    await attachToCategory('mobiles', storageAttribute, true);
    await attachToCategory('mobiles', screenAttribute, false);
    await attachToCategory('mobiles', warrantyAttribute, false);
    await attachToCategory('laptops', colorAttribute, true);
    await attachToCategory('laptops', ramAttribute, true);
    await attachToCategory('laptops', storageAttribute, true);
    await attachToCategory('laptops', screenAttribute, false);
    await attachToCategory('tablets', colorAttribute, true);
    await attachToCategory('tablets', storageAttribute, true);
    await attachToCategory('watches', colorAttribute, true);
    await attachToCategory('watches', sizeAttribute, true);
    await attachToCategory('audio', colorAttribute, true);
    await attachToCategory('power', colorAttribute, true);
    await attachToCategory('power', capacityAttribute, false);
    await attachToCategory('accessories', colorAttribute, true);

    const products = dataSource.getRepository(Product);
    const variants = dataSource.getRepository(ProductVariant);
    const variantValues = dataSource.getRepository(VariantAttributeValue);
    const productValues = dataSource.getRepository(ProductAttributeValue);
    const productImages = dataSource.getRepository(ProductImage);

    const uploadRoot = resolveUploadRoot(process.env.UPLOAD_DIR);
    const artworkDir = join(uploadRoot, 'products', 'seed');
    await mkdir(artworkDir, { recursive: true });
    const backendUrl = (
      process.env.BACKEND_URL ?? 'http://localhost:3000'
    ).replace(/\/+$/, '');

    const optionOf = (attribute: Attribute, slug: string) =>
      (attribute.options ?? []).find((option) => option.slug === slug);

    let createdProducts = 0;
    let createdVariants = 0;
    const builtProducts: Array<{
      product: Product;
      variants: ProductVariant[];
    }> = [];

    for (const seedProduct of CATALOGUE) {
      const tint =
        COLORS.find(
          ([, slug]) => slug === (seedProduct.colors?.[0] ?? 'black'),
        )?.[2] ?? '#143266';

      // Artwork is rewritten on every run, before the idempotency guard below.
      // The filenames and URLs are deterministic, so the rows already in the
      // database keep pointing at the right file — this just refreshes the
      // picture. Without it, re-seeding an existing shop would leave the old
      // drawings on disk forever.
      for (const index of [0, 1]) {
        await writeFile(
          join(artworkDir, `${seedProduct.slug}-${index + 1}.svg`),
          productArtwork(seedProduct.title, tint, index, seedProduct.category),
          'utf8',
        );
      }

      const existing = await products.findOne({
        where: { slug: seedProduct.slug },
        relations: { variants: true },
      });
      if (existing) {
        builtProducts.push({
          product: existing,
          variants: existing.variants ?? [],
        });
        continue;
      }

      const category = categoryBySlug.get(seedProduct.category);
      const salePrice = seedProduct.salePercent
        ? Math.round(
            (seedProduct.price * (100 - seedProduct.salePercent)) /
              100 /
              100_000,
          ) * 100_000
        : null;

      const product = await products.save(
        products.create({
          title: seedProduct.title,
          slug: seedProduct.slug,
          description: seedProduct.description,
          price: seedProduct.price,
          sale_price: salePrice,
          weight_grams: seedProduct.weight,
          brand: brandBySlug.get(seedProduct.brand) ?? null,
          categories: category ? [category] : [],
          stock: 0,
          is_published: true,
        }),
      );
      createdProducts += 1;

      for (const index of [0, 1]) {
        const filename = `${seedProduct.slug}-${index + 1}.svg`;
        await productImages.save(
          productImages.create({
            product,
            filename,
            url: `${backendUrl}/uploads/products/seed/${filename}`,
            order: index,
          }),
        );
      }

      if (seedProduct.screen !== undefined) {
        await productValues.save(
          productValues.create({
            product,
            attribute: screenAttribute,
            value_number: String(seedProduct.screen),
          }),
        );
      }
      if (seedProduct.warranty) {
        await productValues.save(
          productValues.create({
            product,
            attribute: warrantyAttribute,
            value_text: seedProduct.warranty,
          }),
        );
      }
      if (seedProduct.waterproof !== undefined) {
        await productValues.save(
          productValues.create({
            product,
            attribute: waterproofAttribute,
            value_boolean: seedProduct.waterproof,
          }),
        );
      }

      // The grid: every combination of the axes this product is sold on.
      const axisChoices: Array<{ key: AxisKey; slugs: string[] }> = [];
      if (seedProduct.colors?.length) {
        axisChoices.push({ key: 'color', slugs: seedProduct.colors });
      }
      if (seedProduct.storages?.length) {
        axisChoices.push({ key: 'storage', slugs: seedProduct.storages });
      }
      if (seedProduct.rams?.length) {
        axisChoices.push({ key: 'ram', slugs: seedProduct.rams });
      }
      if (seedProduct.sizes?.length) {
        axisChoices.push({ key: 'size', slugs: seedProduct.sizes });
      }
      if (seedProduct.capacities?.length) {
        axisChoices.push({ key: 'capacity', slugs: seedProduct.capacities });
      }

      let combinations: Array<
        Array<{ key: AxisKey; slug: string; index: number }>
      > = [[]];
      for (const axis of axisChoices) {
        const next: typeof combinations = [];
        axis.slugs.forEach((slug, index) => {
          combinations.forEach((combination) => {
            next.push([...combination, { key: axis.key, slug, index }]);
          });
        });
        combinations = next;
      }

      const productVariants: ProductVariant[] = [];
      for (const combination of combinations) {
        const extra = combination.reduce(
          (sum, part) =>
            sum + (seedProduct.stepPrice?.[part.key] ?? 0) * part.index,
          0,
        );
        const variantPrice = extra > 0 ? seedProduct.price + extra : null;
        const variantSale =
          variantPrice && seedProduct.salePercent
            ? Math.round(
                (variantPrice * (100 - seedProduct.salePercent)) /
                  100 /
                  100_000,
              ) * 100_000
            : null;

        // Some combinations are deliberately out of stock: that is what
        // the storefront's greyed-out option picker is for.
        const stock = nextRandom() < 0.14 ? 0 : between(1, 18);

        const values = combination.map((part) => {
          const attribute = axisByKey[part.key];
          const option = optionOf(attribute, part.slug);
          return { attribute, option: option! };
        });

        const label = values.map((value) => value.option.value).join(' / ');
        const variant = await variants.save(
          variants.create({
            product,
            title: label || 'استاندارد',
            sku: `${seedProduct.slug}-${
              combination.map((part) => part.slug).join('-') || 'std'
            }`,
            options: Object.fromEntries(
              values.map((value) => [
                value.attribute.title,
                value.option.value,
              ]),
            ),
            stock,
            price: variantPrice,
            sale_price: variantSale,
          }),
        );
        createdVariants += 1;
        productVariants.push(variant);

        if (values.length > 0) {
          await variantValues.save(
            values.map((value) =>
              variantValues.create({
                variant,
                attribute: value.attribute,
                option: value.option,
              }),
            ),
          );
        }
      }

      await dataSource.query(
        'UPDATE `products` p SET p.`stock` = (SELECT COALESCE(SUM(v.`stock`), 0) ' +
          'FROM `product_variants` v WHERE v.`product_id` = p.`id` AND v.`deleted_at` IS NULL ' +
          'AND v.`is_active` = 1) WHERE p.`id` = ?',
        [product.id],
      );

      builtProducts.push({ product, variants: productVariants });
    }

    const zones = dataSource.getRepository(ShippingZone);
    const methods = dataSource.getRepository(ShippingMethod);
    const rates = dataSource.getRepository(ShippingRate);

    let tehranZone = await zones.findOne({ where: { title: 'تهران' } });
    if (!tehranZone) {
      tehranZone = await zones.save(
        zones.create({
          title: 'تهران',
          provinces: ['تهران'],
          is_default: false,
        }),
      );
    }
    let bigCities = await zones.findOne({ where: { title: 'شهرهای بزرگ' } });
    if (!bigCities) {
      bigCities = await zones.save(
        zones.create({
          title: 'شهرهای بزرگ',
          provinces: [
            'اصفهان',
            'آذربایجان شرقی',
            'خراسان رضوی',
            'فارس',
            'البرز',
          ],
          is_default: false,
        }),
      );
    }
    let restZone = await zones.findOne({ where: { is_default: true } });
    if (!restZone) {
      restZone = await zones.save(
        zones.create({ title: 'سایر شهرها', provinces: [], is_default: true }),
      );
    }

    const upsertMethod = async (
      data: Partial<ShippingMethod> & { code: string },
    ) => {
      const existing = await methods.findOne({ where: { code: data.code } });
      if (existing) return existing;
      return methods.save(methods.create(data));
    };
    const post = await upsertMethod({
      code: 'post-pishtaz',
      title: 'پست پیشتاز',
      estimated_days_min: 2,
      estimated_days_max: 4,
      supports_cash_on_delivery: true,
      sort_order: 1,
    });
    const tipax = await upsertMethod({
      code: 'tipax',
      title: 'تیپاکس',
      estimated_days_min: 1,
      estimated_days_max: 3,
      supports_cash_on_delivery: true,
      sort_order: 2,
    });
    const courier = await upsertMethod({
      code: 'peyk',
      title: 'پیک موتوری (تهران)',
      estimated_days_min: 1,
      estimated_days_max: 1,
      sort_order: 0,
    });

    const upsertRate = async (
      method: ShippingMethod,
      zone: ShippingZone,
      values: Partial<ShippingRate>,
    ) => {
      const existing = await rates.findOne({
        where: { method: { id: method.id }, zone: { id: zone.id } },
      });
      if (existing) return existing;
      return rates.save(rates.create({ method, zone, ...values }));
    };

    await upsertRate(post, tehranZone, {
      base_cost: 45_000,
      per_kg_cost: 15_000,
      free_shipping_threshold: 20_000_000,
      cash_on_delivery_fee: 25_000,
    });
    await upsertRate(post, bigCities, {
      base_cost: 65_000,
      per_kg_cost: 20_000,
      free_shipping_threshold: 30_000_000,
      cash_on_delivery_fee: 30_000,
    });
    await upsertRate(post, restZone, {
      base_cost: 85_000,
      per_kg_cost: 25_000,
      free_shipping_threshold: 40_000_000,
      cash_on_delivery_fee: 35_000,
    });
    await upsertRate(tipax, tehranZone, {
      base_cost: 70_000,
      per_kg_cost: 18_000,
      cash_on_delivery_fee: 30_000,
    });
    await upsertRate(tipax, bigCities, {
      base_cost: 95_000,
      per_kg_cost: 22_000,
      cash_on_delivery_fee: 35_000,
    });
    await upsertRate(courier, tehranZone, { base_cost: 120_000 });

    const codes = dataSource.getRepository(DiscountCode);
    const upsertCode = async (
      data: Partial<DiscountCode> & { code: string },
    ) => {
      const existing = await codes.findOne({ where: { code: data.code } });
      if (existing) return existing;
      return codes.save(codes.create(data));
    };
    await upsertCode({
      code: 'WELCOME10',
      capacity: 500,
      off_percent: 10,
      type: DiscountTypeEnum.Percent,
      max_discount_amount: 5_000_000,
      per_user_limit: 1,
    });
    await upsertCode({
      code: 'DIGI5',
      capacity: 200,
      off_percent: 5,
      type: DiscountTypeEnum.Percent,
      max_discount_amount: 3_000_000,
      min_order_amount: 20_000_000,
    });
    await upsertCode({
      code: 'FLAT500',
      capacity: 100,
      off_percent: 0,
      off_amount: 500_000,
      type: DiscountTypeEnum.Fixed,
      min_order_amount: 5_000_000,
    });
    const audioCategory = categoryBySlug.get('audio');
    if (
      audioCategory &&
      !(await codes.findOne({ where: { code: 'AUDIO15' } }))
    ) {
      await codes.save(
        codes.create({
          code: 'AUDIO15',
          capacity: 150,
          off_percent: 15,
          type: DiscountTypeEnum.Percent,
          max_discount_amount: 4_000_000,
          categories: [audioCategory],
        }),
      );
    }

    const comments = dataSource.getRepository(Comment);
    if ((await comments.count()) === 0) {
      for (const { product } of builtProducts) {
        const count = between(0, 4);
        for (let index = 0; index < count; index += 1) {
          await comments.save(
            comments.create({
              product,
              user: pick(customers),
              comment: pick(REVIEWS),
              rate: between(3, 5),
              status:
                nextRandom() < 0.85
                  ? CommentStatusEnum.Approved
                  : CommentStatusEnum.Pending,
            }),
          );
        }
      }

      // The stored rating is recomputed from the approved ones, the same
      // way the comments service does it.
      await dataSource.query(
        'UPDATE `products` p LEFT JOIN (' +
          'SELECT `product_id` AS pid, AVG(`rate`) AS avg_rate, COUNT(*) AS cnt ' +
          "FROM `comments` WHERE `status` = 'approved' AND `deleted_at` IS NULL " +
          'GROUP BY `product_id`) c ON c.pid = p.`id` ' +
          'SET p.`rating_avg` = COALESCE(c.avg_rate, 0), p.`rating_count` = COALESCE(c.cnt, 0)',
      );
    }

    // A history of orders, spread over the last six weeks, so the
    // dashboard chart and the reports have a shape instead of one bar.
    const orders = dataSource.getRepository(Order);
    const orderItems = dataSource.getRepository(OrderItem);

    if ((await orders.count()) === 0) {
      const sellable = builtProducts.filter((entry) =>
        entry.variants.some((variant) => variant.stock > 0),
      );
      const statuses: OrderStatusEnum[] = [
        OrderStatusEnum.Delivered,
        OrderStatusEnum.Delivered,
        OrderStatusEnum.Delivered,
        OrderStatusEnum.Sent,
        OrderStatusEnum.Processing,
        OrderStatusEnum.Paid,
        OrderStatusEnum.Cancelled,
      ];
      const addressList = await addresses.find({ relations: { user: true } });
      const invoices = app.get(InvoiceService);

      for (let index = 0; index < 42 && sellable.length > 0; index += 1) {
        const customer = pick(customers);
        const address =
          addressList.find((row) => row.user.id === customer.id) ??
          addressList[0];
        if (!address) break;

        const chosen: Array<{
          product: Product;
          variant: ProductVariant;
          quantity: number;
        }> = [];
        const lineCount = between(1, 3);
        for (let line = 0; line < lineCount; line += 1) {
          const entry = pick(sellable);
          const inStock = entry.variants.filter((item) => item.stock > 0);
          if (inStock.length === 0) continue;
          const variant = pick(inStock);
          if (chosen.some((item) => item.variant.id === variant.id)) continue;
          chosen.push({
            product: entry.product,
            variant,
            quantity: between(1, 2),
          });
        }
        if (chosen.length === 0) continue;

        const status = pick(statuses);
        const createdAt = new Date(
          Date.now() - between(0, 41) * 86_400_000 - between(0, 23) * 3_600_000,
        );

        const items = chosen.map((line) =>
          orderItems.create({
            product: line.product,
            variant: line.variant,
            variant_title: line.variant.title,
            variant_sku: line.variant.sku,
            price: Number(
              line.variant.sale_price ??
                line.variant.price ??
                line.product.sale_price ??
                line.product.price,
            ),
            quantity: line.quantity,
          }),
        );

        const itemsTotal = items.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0,
        );
        const weight = chosen.reduce(
          (sum, line) =>
            sum + Number(line.product.weight_grams ?? 0) * line.quantity,
          0,
        );
        const kilograms = Math.max(1, Math.ceil(weight / 1000));
        const shipping =
          itemsTotal >= 20_000_000 ? 0 : 45_000 + (kilograms - 1) * 15_000;
        const tax = Math.round(itemsTotal * 0.1);
        const total = itemsTotal + shipping + tax;
        const paid = status !== OrderStatusEnum.Cancelled;

        const order = await orders.save(
          orders.create({
            user: customer,
            address,
            shippingAddressSnapshot: {
              province: address.province,
              city: address.city,
              address: address.address,
              postal_code: address.postal_code,
              receiver_mobile: address.receiver_mobile,
            },
            items,
            items_total: itemsTotal,
            discount_amount: 0,
            shipping_cost: shipping,
            tax_amount: tax,
            total_price: total,
            total_quantity: items.reduce((sum, item) => sum + item.quantity, 0),
            status,
            payment_method:
              nextRandom() < 0.6
                ? PaymentMethodEnum.Zarinpal
                : nextRandom() < 0.5
                  ? PaymentMethodEnum.Wallet
                  : PaymentMethodEnum.CashOnDelivery,
            shipping_method: post,
            shipping_method_title: post.title,
            shipping_eta_days_min: post.estimated_days_min,
            shipping_eta_days_max: post.estimated_days_max,
            // From the real sequence, so the first order a visitor places
            // does not collide with one of these.
            ...(paid
              ? {
                  payed_time: createdAt,
                  invoice_number: await dataSource.transaction((manager) =>
                    invoices.nextNumber(manager, createdAt),
                  ),
                }
              : {}),
            ...(status === OrderStatusEnum.Delivered
              ? { delivered_at: new Date(createdAt.getTime() + 3 * 86_400_000) }
              : {}),
            ...(status === OrderStatusEnum.Sent
              ? { tracking_code: `TRK${between(100000, 999999)}` }
              : {}),
          }),
        );

        // Back-dated on purpose: CreateDateColumn always writes "now",
        // and 42 orders from the same minute make a useless chart. MySQL
        // fills that column in its own zone, so the date goes in as UTC and
        // is converted there.
        await dataSource.query(
          "UPDATE `order` SET `createdAt` = CONVERT_TZ(?, '+00:00', @@session.time_zone) WHERE `id` = ?",
          [toUtcSql(createdAt), order.id],
        );

        if (paid) {
          for (const line of chosen) {
            await dataSource.query(
              'UPDATE `product_variants` SET `stock` = GREATEST(CAST(`stock` AS SIGNED) - ?, 0) WHERE `id` = ?',
              [line.quantity, line.variant.id],
            );
            line.variant.stock = Math.max(
              0,
              line.variant.stock - line.quantity,
            );
          }
          await dataSource.query(
            'UPDATE `products` p INNER JOIN (' +
              'SELECT `product_id`, SUM(`quantity`) AS q FROM `order_items` ' +
              'WHERE `order_id` = ? GROUP BY `product_id`) oi ON oi.`product_id` = p.`id` ' +
              'SET p.`sales_count` = p.`sales_count` + oi.q',
            [order.id],
          );
        }
      }

      await dataSource.query(
        'UPDATE `products` p SET p.`stock` = (SELECT COALESCE(SUM(v.`stock`), 0) ' +
          'FROM `product_variants` v WHERE v.`product_id` = p.`id` AND v.`deleted_at` IS NULL ' +
          'AND v.`is_active` = 1)',
      );
    }

    const counts = await dataSource.query(
      'SELECT (SELECT COUNT(*) FROM `products`) AS products, ' +
        '(SELECT COUNT(*) FROM `product_variants`) AS variants, ' +
        '(SELECT COUNT(*) FROM `order`) AS orders, ' +
        '(SELECT COUNT(*) FROM `comments`) AS comments',
    );
    const summary = counts[0];

    // console, not the Nest logger: the app context above only lets errors
    // and warnings through, and this summary is what the nightly reset's
    // journal should show.
    console.log('Demo shop ready:');
    console.log(`  admin     ${admin.mobile} / ${DEMO_PASSWORD}`);
    console.log(
      `  customers ${customers.map((customer) => customer.mobile).join('، ')} / ${DEMO_PASSWORD}`,
    );
    console.log(
      `  ${summary.products} products (${createdProducts} new) with ${summary.variants} variants (${createdVariants} new)`,
    );
    console.log(
      `  ${summary.orders} orders, ${summary.comments} reviews, 9 brands, 8 attributes, 4 discount codes`,
    );
    console.log('  3 shipping methods across 3 zones');
  } finally {
    await app.close();
  }
}

seed().catch((error) => {
  logger.error(error);
  process.exit(1);
});
