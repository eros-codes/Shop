import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { ProductsService } from '../products/products.service';
import { Product } from '../products/entities/product.entity';
import { returnWindowDays } from '../returns/return-window';
import { DEFAULT_PAYMENT_WINDOW_MINUTES } from '../common/constants/money';
import { renderLinkPreview, summarise } from './link-preview';

const SITE_NAME = 'تل‌کال';
const DEFAULT_COD_MAX_AMOUNT = 20_000_000;

@ApiTags('Shop')
@Controller()
export class ShopController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly configService: ConfigService,
  ) {}

  // What the storefront states about the shop, from the settings the API
  // actually enforces - the return window used to be written into the pages
  // as "7 days" whatever RETURN_WINDOW_DAYS said - and the business details
  // its legal and contact pages show. Those are optional: an empty one is
  // null, and the page leaves that line out rather than inventing it.
  @Get('shop/info')
  info() {
    const text = (key: string): string | null =>
      this.configService.get<string>(key)?.trim() || null;
    const number = (key: string, fallback: number): number => {
      const value = Number(this.configService.get<string | number>(key));
      return Number.isFinite(value) ? value : fallback;
    };
    const enamadId = text('ENAMAD_ID');
    const enamadCode = text('ENAMAD_CODE');

    return {
      data: {
        returnWindowDays: returnWindowDays(this.configService),
        paymentWindowMinutes: number(
          'PAYMENT_WINDOW_MINUTES',
          DEFAULT_PAYMENT_WINDOW_MINUTES,
        ),
        taxRatePercent: number('TAX_RATE_PERCENT', 0),
        codMaxAmount: number('COD_MAX_AMOUNT', DEFAULT_COD_MAX_AMOUNT),
        business: {
          legalName: text('SHOP_LEGAL_NAME'),
          phone: text('SHOP_PHONE'),
          email: text('SHOP_EMAIL'),
          address: text('SHOP_ADDRESS'),
          supportHours: text('SHOP_SUPPORT_HOURS'),
          instagramUrl: text('SHOP_INSTAGRAM_URL'),
          telegramUrl: text('SHOP_TELEGRAM_URL'),
          // The trust seal needs both halves; one without the other is
          // as good as none.
          enamad:
            enamadId && enamadCode ? { id: enamadId, code: enamadCode } : null,
        },
      },
      message: 'Shop info',
    };
  }

  // See link-preview.ts. Answers with HTML, not the JSON envelope, so it
  // writes the response itself.
  @Get('share/product/:key')
  async productPreview(
    @Param('key') key: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const site = this.siteUrl(request);
    let product: Product | null = null;
    try {
      product = /^\d+$/.test(key)
        ? await this.productsService.findOne(Number(key))
        : await this.productsService.findBySlug(key);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
    }

    if (!product) {
      response
        .status(404)
        .type('html')
        .send(
          renderLinkPreview({
            siteName: SITE_NAME,
            title: 'کالا پیدا نشد',
            description: 'فروشگاه کالای دیجیتال تل‌کال',
            pageUrl: site,
          }),
        );
      return;
    }

    const price = this.priceLine(product);
    response
      .status(200)
      .type('html')
      // Crawlers ask again for every share; a short cache spares the API.
      .setHeader('Cache-Control', 'public, max-age=600')
      .send(
        renderLinkPreview({
          siteName: SITE_NAME,
          title: product.title,
          description: [price, summarise(product.description)]
            .filter(Boolean)
            .join(' — '),
          pageUrl: `${site}/product/${encodeURIComponent(product.slug)}`,
          imageUrl: this.absolute(product.images?.[0]?.url, site),
        }),
      );
  }

  // "From" when the options are priced differently, so a preview never
  // promises the cheapest option's price for the dearest one.
  private priceLine(product: Product): string {
    const prices = (product.variants ?? [])
      .filter((variant) => variant.is_active !== false)
      .map((variant) => variant.effectivePrice(product));
    if (prices.length === 0) prices.push(product.effectivePrice());
    const lowest = Math.min(...prices);
    const amount = `${lowest.toLocaleString('fa-IR')} تومان`;
    return new Set(prices).size > 1 ? `از ${amount}` : amount;
  }

  private siteUrl(request: Request): string {
    const configured = this.configService.get<string>('FRONTEND_URL');
    if (configured) return configured.replace(/\/+$/, '');
    return `${request.protocol}://${request.get('host') ?? 'localhost'}`;
  }

  private absolute(url: string | undefined, site: string): string | null {
    if (!url) return null;
    if (/^https?:\/\//.test(url)) return url;
    return `${site}${url.startsWith('/') ? '' : '/'}${url}`;
  }
}
