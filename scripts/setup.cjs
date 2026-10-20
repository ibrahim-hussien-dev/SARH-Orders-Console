'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const MIN_SECRET_LENGTH = 32;
const SECRET_BYTES = 48;

const repoRoot = path.resolve(__dirname, '..');
const examplePath = path.join(repoRoot, '.env.example');
const envPath = path.join(repoRoot, '.env');

function generateSecret() {
  return crypto.randomBytes(SECRET_BYTES).toString('hex');
}

function withSecret(template, secret) {
  const secretLine = /^JWT_SECRET=.*$/m;
  if (secretLine.test(template)) {
    return template.replace(secretLine, () => `JWT_SECRET=${secret}`);
  }
  return `${template.trimEnd()}\nJWT_SECRET=${secret}\n`;
}

function readSecret(contents) {
  const match = /^JWT_SECRET=(.*)$/m.exec(contents);
  return match ? match[1].trim() : '';
}

function createEnvFile() {
  const template = fs.readFileSync(examplePath, 'utf8');
  const contents = withSecret(template, generateSecret());
  fs.writeFileSync(envPath, contents, { encoding: 'utf8', flag: 'wx' });
  console.log('Created .env with a new random JWT_SECRET.');
}

function reportExistingEnv() {
  console.log('.env already exists; it was left untouched.');
  const secret = readSecret(fs.readFileSync(envPath, 'utf8'));
  if (secret.length < MIN_SECRET_LENGTH) {
    console.warn(
      `WARNING: JWT_SECRET in .env is missing or shorter than ${MIN_SECRET_LENGTH} characters. ` +
        'Fix it by hand, or delete .env and run npm run setup again.',
    );
  }
}

function main() {
  try {
    createEnvFile();
  } catch (error) {
    if (error.code === 'EEXIST') {
      reportExistingEnv();
      return;
    }
    if (error.code === 'ENOENT') {
      console.error('.env.example was not found at the repository root.');
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

main();
