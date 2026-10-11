// A fresh database for the browser tests: dropped, migrated and seeded with
// the demo catalogue. Run by the API's webServer command in
// playwright.config.js, before the API starts on it.
//
// Connection details come from the environment (CI) or backend/.env (a
// developer machine). Only a database whose name ends in _test is ever
// dropped.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';
import { E2E_DATABASE, ROOT_DIR } from './support/env.js';

const backendDir = path.join(ROOT_DIR, 'backend');

function readDotEnv(file) {
  if (!existsSync(file)) return {};
  const values = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

const fromFile = readDotEnv(path.join(backendDir, '.env'));
const setting = (key, fallback) => process.env[key] ?? fromFile[key] ?? fallback;

const database = E2E_DATABASE;
if (!/_test$/.test(database)) {
  throw new Error(`Refusing to drop "${database}": the e2e database name must end in _test.`);
}

const connection = {
  host: setting('DB_HOST', '127.0.0.1'),
  port: Number(setting('DB_PORT', 3306)),
  user: setting('DB_USERNAME', 'root'),
  password: setting('DB_PASSWORD', ''),
};

console.log(`[e2e] recreating ${database} on ${connection.host}:${connection.port}`);
const server = await mysql.createConnection(connection);
await server.query(`DROP DATABASE IF EXISTS \`${database}\``);
await server.query(
  `CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
);
await server.end();

const env = {
  ...process.env,
  NODE_ENV: 'development',
  DB_HOST: connection.host,
  DB_PORT: String(connection.port),
  DB_USERNAME: connection.user,
  DB_PASSWORD: connection.password,
  DB_DATABASE: database,
};
for (const script of ['migration:run', 'seed:demo']) {
  console.log(`[e2e] npm run ${script}`);
  execSync(`npm run ${script}`, { cwd: backendDir, env, stdio: 'inherit' });
}
console.log('[e2e] database ready');
