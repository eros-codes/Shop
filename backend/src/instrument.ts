import 'dotenv/config';
import * as Sentry from '@sentry/nestjs';

if (process.env.SENTRY_DSN) {
  const isProduction = process.env.NODE_ENV === 'production';
  const configuredRate = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  const tracesSampleRate = Number.isFinite(configuredRate)
    ? configuredRate
    : isProduction
      ? 0.1
      : 1.0;

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate,
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });
}
