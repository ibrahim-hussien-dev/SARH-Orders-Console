import path from 'path';
import dotenv from 'dotenv';

export interface AppConfig {
  port: number;
  dbPath: string;
  jwtSecret: string;
  nodeEnv: 'development' | 'test' | 'production';
  cookieSecure: boolean;
}

const NODE_ENVS = ['development', 'test', 'production'] as const;
const DEFAULT_PORT = 4000;
const DEFAULT_DB_PATH = './data/orders.db';
const MIN_JWT_SECRET_LENGTH = 32;

const SERVER_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const ENV_FILE_PATH = path.join(REPO_ROOT, '.env');

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_PORT;
  }
  const port = Number(raw);
  if (!/^\d+$/.test(raw) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return port;
}

function parseNodeEnv(raw: string | undefined): AppConfig['nodeEnv'] {
  if (raw === undefined || raw === '') {
    return 'development';
  }
  const match = NODE_ENVS.find((candidate) => candidate === raw);
  if (match === undefined) {
    throw new Error('NODE_ENV must be development, test or production.');
  }
  return match;
}

function parseJwtSecret(raw: string | undefined): string {
  if (raw === undefined || raw.length < MIN_JWT_SECRET_LENGTH) {
    throw new Error(
      `JWT_SECRET is required and must be at least ${MIN_JWT_SECRET_LENGTH} characters. Run "npm run setup".`,
    );
  }
  return raw;
}

function parseCookieSecure(raw: string | undefined, nodeEnv: AppConfig['nodeEnv']): boolean {
  if (raw === undefined || raw === '') {
    return nodeEnv === 'production';
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  throw new Error('COOKIE_SECURE must be "true" or "false".');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (env === process.env) {
    dotenv.config({ path: ENV_FILE_PATH });
  }
  const nodeEnv = parseNodeEnv(env.NODE_ENV);
  const rawDbPath = env.DB_PATH === undefined || env.DB_PATH === '' ? DEFAULT_DB_PATH : env.DB_PATH;
  return {
    port: parsePort(env.PORT),
    dbPath: path.resolve(SERVER_ROOT, rawDbPath),
    jwtSecret: parseJwtSecret(env.JWT_SECRET),
    nodeEnv,
    cookieSecure: parseCookieSecure(env.COOKIE_SECURE, nodeEnv),
  };
}
