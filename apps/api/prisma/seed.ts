import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from apps/api/.env first, then monorepo root .env
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run') || process.env.SEED_DRY_RUN === '1';

  if (isDryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          message:
            'EdumenAI is 100% database-driven — manage exercises via Admin Studio (/admin/exercises).'
        },
        null,
        2
      )
    );
    return;
  }

  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
    throw new Error(
      'Missing DATABASE_URL environment variable. Configure DATABASE_URL in apps/api/.env or monorepo root .env before running prisma/seed.ts.'
    );
  }

  const prisma = new PrismaClient();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const exerciseCount = await prisma.exercise.count();
    console.log(
      `Database connection verified (${exerciseCount} exercise(s) present). EdumenAI is 100% database-driven — manage exercises via Admin Studio (/admin/exercises).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error('Seed check failed:', message);
  process.exit(1);
});
