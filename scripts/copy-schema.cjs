'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const serverDir = path.join(repoRoot, 'server');
const source = path.join(serverDir, 'src', 'db', 'schema.sql');
const targetDir = path.join(serverDir, 'dist', 'db');
const target = path.join(targetDir, 'schema.sql');

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log(`Copied schema.sql to ${path.relative(repoRoot, target)}`);
