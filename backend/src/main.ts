import './instrument';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { ServerResponse } from 'http';
import { resolveUploadRoot } from './common/storage/local-file-storage';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import cookieParser from 'cookie-parser';

function basicAuth(username: string, password: string) {
  const compare = (given: string, expected: string): boolean => {
    const a = Buffer.from(given);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  };

  return (req: Request, res: Response, next: NextFunction) => {
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ');
    if (scheme === 'Basic' && encoded) {
      const [user, pass] = Buffer.from(encoded, 'base64').toString().split(':');
      if (user && pass && compare(user, username) && compare(pass, password)) {
        return next();
      }
    }
    res.setHeader('WWW-Authenticate', 'Basic realm="API documentation"');
    res.status(401).send('Authentication required');
  };
}

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(Logger));

  const trustProxy = (process.env.TRUST_PROXY ?? '').trim();
  if (trustProxy && trustProxy !== 'false') {
    app.set(
      // Behind a reverse proxy the client IP arrives in a header; without this
      // every rate limit would count the proxy as one caller.
      'trust proxy',
      /^\d+$/.test(trustProxy) ? Number(trustProxy) : trustProxy,
    );
  }

  app.use(helmet());
  app.use(cookieParser());

  app.useStaticAssets(resolveUploadRoot(process.env.UPLOAD_DIR), {
    prefix: '/uploads',
    // Uploaded files are data, never pages: the sandbox CSP stops anything
    // stored here from running script on this origin, and the explicit
    // cross-origin policy keeps product images usable from a frontend on
    // another domain.
    setHeaders: (res: ServerResponse) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      );
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  const corsOrigin = process.env.CORS_ORIGIN ?? '*';
  app.enableCors({
    origin:
      corsOrigin === '*' ? true : corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const isProduction = process.env.NODE_ENV === 'production';
  const swaggerEnabled =
    (process.env.SWAGGER_ENABLED ?? (isProduction ? 'false' : 'true')) ===
    'true';
  if (swaggerEnabled) {
    const docsUser = process.env.SWAGGER_USER;
    const docsPassword = process.env.SWAGGER_PASSWORD;
    if (docsUser && docsPassword) {
      app.use(
        ['/api/docs', '/api/docs-json'],
        basicAuth(docsUser, docsPassword),
      );
    }

    const swaggerConfig = new DocumentBuilder()
      .setTitle('E-Commerce API')
      .setDescription('API documentation for the online shop backend')
      .setVersion('1.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
    // Off in production unless asked for, and behind basic auth when
    // credentials are configured: the docs are a map of every route and DTO.
    SwaggerModule.setup('api/docs', app, swaggerDocument);
  }

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
