import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ShopController } from './shop.controller';
import { escapeHtml, renderLinkPreview, summarise } from './link-preview';
import { returnWindowDays } from '../returns/return-window';

const config = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

// A stand-in for express's Response: records what the handler sent.
const fakeResponse = () => {
  const sent: {
    status?: number;
    type?: string;
    body?: string;
    headers: Record<string, string>;
  } = {
    headers: {},
  };
  const response = {
    status: (code: number) => ((sent.status = code), response),
    type: (type: string) => ((sent.type = type), response),
    setHeader: (name: string, value: string) => (
      (sent.headers[name] = value),
      response
    ),
    send: (body: string) => ((sent.body = body), response),
  };
  return { response, sent };
};
const fakeRequest = { protocol: 'https', get: () => 'shop.example' } as any;

describe('link previews', () => {
  it('escapes everything typed in the panel', () => {
    expect(escapeHtml(`"><script>alert('x')</script>&`)).toBe(
      '&quot;&gt;&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;&amp;',
    );
    const html = renderLinkPreview({
      siteName: 'تل‌کال',
      title: '<b>Phone</b>',
      description: 'x',
      pageUrl: 'https://shop.example/product/a',
    });
    expect(html).not.toContain('<b>');
    expect(html).toContain('og:title" content="&lt;b&gt;Phone&lt;/b&gt;"');
  });

  it('keeps a description to one short line', () => {
    expect(summarise('a\n\n  b\tc')).toBe('a b c');
    expect(summarise('x'.repeat(300))).toHaveLength(200);
  });

  describe('GET /share/product/:key', () => {
    const product = {
      id: 4,
      title: 'گوشی نمونه',
      slug: 'sample-phone',
      description: 'توضیح\nکالا',
      images: [{ url: '/uploads/products/a.png' }],
      variants: [
        { is_active: true, effectivePrice: () => 12_000_000 },
        { is_active: true, effectivePrice: () => 14_000_000 },
        { is_active: false, effectivePrice: () => 1 },
      ],
      effectivePrice: () => 12_000_000,
    };

    it('gives crawlers the title, price, picture and address of the product', async () => {
      const products = {
        findBySlug: jest.fn().mockResolvedValue(product),
        findOne: jest.fn(),
      };
      const controller = new ShopController(
        products as any,
        config({ FRONTEND_URL: 'https://shop.example/' }),
      );
      const { response, sent } = fakeResponse();

      await controller.productPreview(
        'sample-phone',
        fakeRequest,
        response as any,
      );

      expect(sent.status).toBe(200);
      expect(sent.type).toBe('html');
      expect(sent.body).toContain('og:title" content="گوشی نمونه"');
      // Options priced differently: the cheapest live one, as "from".
      expect(sent.body).toContain('از ۱۲٬۰۰۰٬۰۰۰ تومان');
      expect(sent.body).toContain(
        'og:image" content="https://shop.example/uploads/products/a.png"',
      );
      expect(sent.body).toContain(
        'og:url" content="https://shop.example/product/sample-phone"',
      );
    });

    it('looks a numeric link up by id', async () => {
      const products = {
        findBySlug: jest.fn(),
        findOne: jest.fn().mockResolvedValue(product),
      };
      const controller = new ShopController(products as any, config({}));

      await controller.productPreview(
        '4',
        fakeRequest,
        fakeResponse().response as any,
      );

      expect(products.findOne).toHaveBeenCalledWith(4);
    });

    it('answers 404 for a product that is gone or still a draft', async () => {
      const products = {
        findBySlug: jest.fn().mockRejectedValue(new NotFoundException()),
        findOne: jest.fn(),
      };
      const controller = new ShopController(products as any, config({}));
      const { response, sent } = fakeResponse();

      await controller.productPreview(
        'secret-draft',
        fakeRequest,
        response as any,
      );

      expect(sent.status).toBe(404);
      expect(sent.body).toContain('og:url" content="https://shop.example"');
    });
  });
});

describe('return window', () => {
  it('honours zero - a shop that takes no returns', () => {
    expect(returnWindowDays(config({ RETURN_WINDOW_DAYS: 0 }))).toBe(0);
  });

  it('falls back to seven days when unset', () => {
    expect(returnWindowDays(config({}))).toBe(7);
  });

  it('is what the storefront is told', () => {
    const controller = new ShopController(
      {} as any,
      config({ RETURN_WINDOW_DAYS: 14 }),
    );
    expect(controller.info().data).toMatchObject({ returnWindowDays: 14 });
  });
});

describe('GET /shop/info - business details', () => {
  it('leaves out what is not set, rather than inventing it', () => {
    const controller = new ShopController(
      {} as any,
      config({ SHOP_PHONE: '021-1234', SHOP_EMAIL: '  ', ENAMAD_ID: '123' }),
    );

    const { business } = controller.info().data;

    expect(business.phone).toBe('021-1234');
    expect(business.email).toBeNull();
    expect(business.legalName).toBeNull();
    // The trust seal needs both its id and its code.
    expect(business.enamad).toBeNull();
  });

  it('states the payment, tax and cash-on-delivery rules the API enforces', () => {
    const controller = new ShopController(
      {} as any,
      config({
        PAYMENT_WINDOW_MINUTES: 20,
        TAX_RATE_PERCENT: 9,
        COD_MAX_AMOUNT: 5_000_000,
        ENAMAD_ID: '123',
        ENAMAD_CODE: 'AbC',
      }),
    );

    expect(controller.info().data).toMatchObject({
      paymentWindowMinutes: 20,
      taxRatePercent: 9,
      codMaxAmount: 5_000_000,
      business: { enamad: { id: '123', code: 'AbC' } },
    });
  });
});
