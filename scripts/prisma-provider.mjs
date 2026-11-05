// Points prisma/schema.prisma at Postgres when DATABASE_URL is a Postgres URL, and at SQLite otherwise.
// Run before `prisma generate` so one schema file serves local dev and production.
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.DATABASE_URL ?? process.env.NETLIFY_DATABASE_URL ?? "";
const provider = /^postgres(ql)?:\/\//.test(url) ? "postgresql" : "sqlite";
const path = new URL("../prisma/schema.prisma", import.meta.url);
const schema = readFileSync(path, "utf8");
const next = schema.replace(/(datasource db \{\s*provider\s*=\s*)"[^"]+"/, `$1"${provider}"`);
if (next !== schema) writeFileSync(path, next);
console.log(`prisma provider: ${provider}`);
