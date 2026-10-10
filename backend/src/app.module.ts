import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import * as Joi from 'joi';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { RateLimit } from './common/throttler/rate-limit.entity';
import { DatabaseThrottlerStorage } from './common/throttler/database-throttler.storage';
import { phoneThrottler } from './common/throttler/phone-throttle';
import { ScheduleModule } from '@nestjs/schedule';
import { CacheModule } from '@nestjs/cache-manager';
import { LoggerModule } from 'nestjs-pino';
import { SentryModule } from '@sentry/nestjs/setup';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HealthModule } from './health/health.module';
import { CleanupModule } from './cleanup/cleanup.module';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { AddressModule } from './address/address.module';
import { TicketsModule } from './tickets/tickets.module';
import { ProductsModule } from './products/products.module';
import { CategoriesModule } from './categories/categories.module';
import { BrandsModule } from './brands/brands.module';
import { ShippingModule } from './shipping/shipping.module';
import { AttributesModule } from './attributes/attributes.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AuditModule } from './audit/audit.module';
import { ReturnsModule } from './returns/returns.module';
import { ReportsModule } from './reports/reports.module';
import { OrdersModule } from './orders/orders.module';
import { CommentsModule } from './comments/comments.module';
import { DiscountCodesModule } from './discount-codes/discount-codes.module';
import { WalletsModule } from './wallets/wallets.module';
import { PaymentsModule } from './payments/payments.module';
import { CatalogCacheModule } from './common/cache/catalog-cache.module';
import { StorageModule } from './common/storage/storage.module';
import { InitialSchema1789600000000 } from './migrations/1789600000000-InitialSchema';
import { Phase2DataIntegrity1789624094221 } from './migrations/1789624094221-Phase2DataIntegrity';
import { Phase3PaymentIntegrity1789712004311 } from './migrations/1789712004311-Phase3PaymentIntegrity';
import { Phase4DeploymentHardening1789800000000 } from './migrations/1789800000000-Phase4DeploymentHardening';
import { SessionHardening1789900000000 } from './migrations/1789900000000-SessionHardening';
import { CatalogFoundation1790000000000 } from './migrations/1790000000000-CatalogFoundation';
import { ProductVariants1790100000000 } from './migrations/1790100000000-ProductVariants';
import { ShippingAndTax1790200000000 } from './migrations/1790200000000-ShippingAndTax';
import { InvoicesAndCashOnDelivery1790300000000 } from './migrations/1790300000000-InvoicesAndCashOnDelivery';
import { OrderNotifications1790400000000 } from './migrations/1790400000000-OrderNotifications';
import { ReturnsAndAudit1790500000000 } from './migrations/1790500000000-ReturnsAndAudit';
import { RichDiscountCodes1790600000000 } from './migrations/1790600000000-RichDiscountCodes';
import { ProductAttributes1790700000000 } from './migrations/1790700000000-ProductAttributes';
import { AccountsBestSellersRelated1790800000000 } from './migrations/1790800000000-AccountsBestSellersRelated';
import { TokensValidAfter1790900000000 } from './migrations/1790900000000-TokensValidAfter';
import { RetireVariantsOfDeletedProducts1791000000000 } from './migrations/1791000000000-RetireVariantsOfDeletedProducts';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: Joi.object({
        DB_HOST: Joi.string().required(),
        DB_PORT: Joi.number().required(),
        DB_USERNAME: Joi.string().required(),
        DB_PASSWORD: Joi.string().required(),
        DB_DATABASE: Joi.string().required(),
        DB_POOL_SIZE: Joi.number().default(10),
        JWT_SECRET_KEY: Joi.string().min(32).required(),
        JWT_EXPIRATION: Joi.string().default('15m'),
        REFRESH_TOKEN_EXPIRATION_DAYS: Joi.number().default(30),
        OTP_EXPIRATION_MINUTES: Joi.number().default(5),
        OTP_HASH_SECRET: Joi.string().min(32).required(),
        PORT: Joi.number().default(3000),
        CORS_ORIGIN: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string().invalid('*').required().messages({
            'any.invalid':
              'CORS_ORIGIN must not be "*" in production - set it to your real frontend domain(s)',
            'any.required':
              'CORS_ORIGIN must be set to your real frontend domain(s) in production',
          }),
          otherwise: Joi.string().default('*'),
        }),
        NODE_ENV: Joi.string()
          .valid('development', 'production', 'test')
          .default('development'),
        SENTRY_DSN: Joi.string().optional().allow(''),
        SMSIR_API_KEY: Joi.string().optional().allow(''),
        SMSIR_OTP_TEMPLATE_ID: Joi.string().optional().allow(''),
        SMSIR_ACCOUNT_EXISTS_TEMPLATE_ID: Joi.string().optional().allow(''),
        ZARINPAL_MERCHANT_ID: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string().min(36).required().messages({
            'any.required':
              'ZARINPAL_MERCHANT_ID is required in production (the 36-character merchant id from your ZarinPal panel)',
            'string.min':
              'ZARINPAL_MERCHANT_ID does not look like a real merchant id',
            'string.empty':
              'ZARINPAL_MERCHANT_ID is required in production (the 36-character merchant id from your ZarinPal panel)',
          }),
          otherwise: Joi.string().allow('').default(''),
        }),
        // A public portfolio demo runs as a real production build (secure
        // cookies, migrations, no schema sync, no Swagger) but has no
        // merchant account and must never take real money. DEMO_MODE is the
        // one explicit switch for that: it allows the sandbox gateway and the
        // demo seed, and nothing else. A real shop leaves it unset.
        DEMO_MODE: Joi.boolean().default(false),
        ZARINPAL_MODE: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.when('DEMO_MODE', {
            is: Joi.valid(true, 'true'),
            then: Joi.string()
              .valid('sandbox', 'production')
              .default('sandbox'),
            otherwise: Joi.string()
              .valid('production')
              .default('production')
              .messages({
                'any.only':
                  'ZARINPAL_MODE must be "production" when NODE_ENV=production - sandbox payments never collect real money (set DEMO_MODE=true only for a public demo)',
              }),
          }),
          otherwise: Joi.string()
            .valid('sandbox', 'production')
            .default('sandbox'),
        }),
        BACKEND_URL: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.string()
            .uri({ scheme: ['https'] })
            .pattern(/^https:\/\/(?!localhost|127\.0\.0\.1)/)
            .required()
            .messages({
              'string.pattern.base':
                'BACKEND_URL must be the public HTTPS address of this API in production - payment callbacks are built from it',
              'string.uri.scheme':
                'BACKEND_URL must be an https:// URL in production',
            }),
          otherwise: Joi.string().default('http://localhost:3000'),
        }),
        FRONTEND_URL: Joi.string().optional().allow(''),
        UPLOAD_DIR: Joi.string().default('uploads'),
        ZARINPAL_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
        PAYMENT_WINDOW_MINUTES: Joi.number().integer().min(1).default(15),
        ZARINPAL_API_BASE: Joi.string().optional().allow(''),
        ZARINPAL_GATEWAY_BASE: Joi.string().optional().allow(''),
        TAX_RATE_PERCENT: Joi.number().min(0).max(100).default(10),
        RETURN_WINDOW_DAYS: Joi.number().integer().min(0).max(365).default(7),
        COD_MAX_AMOUNT: Joi.number().integer().min(0).default(20000000),
        TRUST_PROXY: Joi.string().allow('').default(''),
        THROTTLE_STORAGE: Joi.string()
          .valid('memory', 'database')
          .default('memory'),
        THROTTLE_LIMIT_PER_MINUTE: Joi.number().integer().min(1).default(600),
        SWAGGER_ENABLED: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.boolean().truthy('true').falsy('false').default(false),
          otherwise: Joi.boolean().truthy('true').falsy('false').default(true),
        }),
        SWAGGER_USER: Joi.string().allow('').default(''),
        SWAGGER_PASSWORD: Joi.string().allow('').default(''),
        SENTRY_TRACES_SAMPLE_RATE: Joi.when('NODE_ENV', {
          is: 'production',
          then: Joi.number().min(0).max(1).default(0.1),
          otherwise: Joi.number().min(0).max(1).default(1),
        }),
      }),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        // The refresh token rides in a cookie both ways: the browser sends
        // it back in `cookie` and login/refresh hand out a new one in
        // `set-cookie`. Logged as-is, every request line carried a 30-day
        // session anyone with read access to the logs could replay.
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
        ],
        autoLogging: true,
      },
    }),
    ThrottlerModule.forRootAsync({
      imports: [TypeOrmModule.forFeature([RateLimit])],
      inject: [ConfigService, DataSource],
      useFactory: (configService: ConfigService, dataSource: DataSource) => ({
        // The site-wide cap is per IP and deliberately loose (see
        // phone-throttle.ts); the tight limits live on the routes that
        // need them.
        throttlers: [
          {
            name: 'default',
            ttl: 60_000,
            limit: configService.get<number>('THROTTLE_LIMIT_PER_MINUTE', 600),
          },
          phoneThrottler,
        ],
        ...(configService.get<string>('THROTTLE_STORAGE') === 'database'
          ? { storage: new DatabaseThrottlerStorage(dataSource) }
          : {}),
      }),
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
      ttl: 60000,
    }),
    CatalogCacheModule,
    StorageModule,
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST,
      port: +process.env.DB_PORT!,
      username: process.env.DB_USERNAME,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_DATABASE,
      autoLoadEntities: true,
      synchronize: process.env.NODE_ENV !== 'production',
      migrations: [
        InitialSchema1789600000000,
        Phase2DataIntegrity1789624094221,
        Phase3PaymentIntegrity1789712004311,
        Phase4DeploymentHardening1789800000000,
        SessionHardening1789900000000,
        CatalogFoundation1790000000000,
        ProductVariants1790100000000,
        ShippingAndTax1790200000000,
        InvoicesAndCashOnDelivery1790300000000,
        OrderNotifications1790400000000,
        ReturnsAndAudit1790500000000,
        RichDiscountCodes1790600000000,
        ProductAttributes1790700000000,
        AccountsBestSellersRelated1790800000000,
        TokensValidAfter1790900000000,
        RetireVariantsOfDeletedProducts1791000000000,
      ],
      migrationsRun: process.env.NODE_ENV !== 'production',
      extra: {
        connectionLimit: Number(process.env.DB_POOL_SIZE) || 10,
      },
      retryAttempts: 3,
      retryDelay: 3000,
    }),
    HealthModule,
    CleanupModule,
    UsersModule,
    AuthModule,
    AddressModule,
    TicketsModule,
    ProductsModule,
    CategoriesModule,
    BrandsModule,
    ShippingModule,
    AttributesModule,
    NotificationsModule,
    AuditModule,
    ReturnsModule,
    ReportsModule,
    OrdersModule,
    CommentsModule,
    DiscountCodesModule,
    WalletsModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
  exports: [UsersModule],
})
export class AppModule {}
