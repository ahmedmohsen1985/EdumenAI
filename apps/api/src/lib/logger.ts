import { createRequire } from 'node:module';
import pino, { type LoggerOptions } from 'pino';
import { env } from '../config/env.js';

const require = createRequire(import.meta.url);

function resolvePrettyTransport(): LoggerOptions['transport'] | undefined {
  if (env.nodeEnv !== 'development') return undefined;
  try {
    const target = require.resolve('pino-pretty');
    return {
      target,
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname'
      }
    };
  } catch {
    return undefined;
  }
}

const options: LoggerOptions = {
  level: process.env.LOG_LEVEL || (env.nodeEnv === 'test' ? 'silent' : 'info'),
  redact: {
    paths: [
      'apiKey',
      'botToken',
      'authorization',
      'x-admin-key',
      'DATABASE_URL',
      '*.apiKey',
      '*.botToken',
      '*.authorization',
      '*.DATABASE_URL',
      'req.headers.authorization',
      'req.headers["x-admin-key"]',
      'req.headers.cookie'
    ],
    censor: '[REDACTED]'
  },
  transport: resolvePrettyTransport()
};

export const logger = pino(options);
