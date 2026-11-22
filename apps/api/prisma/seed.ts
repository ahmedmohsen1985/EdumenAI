import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { PrismaClient, type Prisma } from '@prisma/client';
import { MARKING_JSON_SCHEMA } from '@edumenai/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from apps/api/.env first, then monorepo root .env
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../../.env') });

const EXERCISE_CODE = 'ex4';
const EXERCISE_TITLE = 'Exercise 4 — Article Writing';
const EXERCISE_DESCRIPTION =
  'Oxford AQA IGCSE ESL Exercise 4: Article Writing (100–150 words, 23 marks total: Content & Communication 8, Language 15).';
const EXERCISE_TOTAL_MARKS = 23;

const PROMPTS_DIR = path.join(__dirname, '../prompts');

const PROMPT_FILES = {
  transcriptionPrompt: 'ex4_transcription_prompt.txt',
  evaluationPrompt: 'core_marking_protocol.txt',
  rubricPrompt: 'ex4_rubric_and_anchors.txt'
} as const;

function readAndValidatePrompt(fileName: string): string {
  const filePath = path.join(PROMPTS_DIR, fileName);
  const content = fs.readFileSync(filePath, 'utf-8');

  if (content.length === 0) {
    throw new Error(`Prompt file "${fileName}" is empty (${filePath}).`);
  }
  if (content.startsWith('\uFEFF')) {
    throw new Error(`Prompt file "${fileName}" starts with a UTF-8 BOM (\\uFEFF) (${filePath}).`);
  }
  if (content.includes('\u0000')) {
    throw new Error(`Prompt file "${fileName}" contains NUL bytes (\\u0000), indicating UTF-16 corruption (${filePath}).`);
  }

  return content;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf-8').digest('hex');
}

function validateMarkingSchema(schema: unknown): asserts schema is Prisma.InputJsonValue {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    throw new Error('MARKING_JSON_SCHEMA from @edumenai/shared must be a non-null JSON object.');
  }
  const record = schema as Record<string, unknown>;
  if (record.type !== 'object' || !record.properties || typeof record.properties !== 'object') {
    throw new Error('MARKING_JSON_SCHEMA is missing required JSON Schema root structure.');
  }
}

async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run') || process.env.SEED_DRY_RUN === '1';

  const transcriptionPrompt = readAndValidatePrompt(PROMPT_FILES.transcriptionPrompt);
  const evaluationPrompt = readAndValidatePrompt(PROMPT_FILES.evaluationPrompt);
  const rubricPrompt = readAndValidatePrompt(PROMPT_FILES.rubricPrompt);

  validateMarkingSchema(MARKING_JSON_SCHEMA);
  const markingSchema = MARKING_JSON_SCHEMA as unknown as Prisma.InputJsonValue;

  if (isDryRun) {
    const schemaObj = MARKING_JSON_SCHEMA as {
      properties?: Record<string, unknown>;
      required?: readonly string[];
    };
    const summary = {
      dryRun: true,
      exercise: {
        code: EXERCISE_CODE,
        title: EXERCISE_TITLE,
        totalMarks: EXERCISE_TOTAL_MARKS
      },
      prompts: {
        transcriptionPrompt: {
          file: PROMPT_FILES.transcriptionPrompt,
          length: transcriptionPrompt.length,
          sha256: sha256(transcriptionPrompt)
        },
        evaluationPrompt: {
          file: PROMPT_FILES.evaluationPrompt,
          length: evaluationPrompt.length,
          sha256: sha256(evaluationPrompt)
        },
        rubricPrompt: {
          file: PROMPT_FILES.rubricPrompt,
          length: rubricPrompt.length,
          sha256: sha256(rubricPrompt)
        }
      },
      markingSchema: {
        topLevelKeys: Object.keys(MARKING_JSON_SCHEMA),
        propertyKeys: Object.keys(schemaObj.properties ?? {}),
        required: schemaObj.required ?? []
      }
    };

    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.trim()) {
    throw new Error(
      'Missing DATABASE_URL environment variable. Configure DATABASE_URL in apps/api/.env or monorepo root .env before running prisma/seed.ts without --dry-run.'
    );
  }

  const prisma = new PrismaClient();

  try {
    const result = await prisma.$transaction(async (tx) => {
      const exercise = await tx.exercise.upsert({
        where: { code: EXERCISE_CODE },
        create: {
          code: EXERCISE_CODE,
          title: EXERCISE_TITLE,
          description: EXERCISE_DESCRIPTION,
          totalMarks: EXERCISE_TOTAL_MARKS
        },
        update: {
          title: EXERCISE_TITLE,
          description: EXERCISE_DESCRIPTION,
          totalMarks: EXERCISE_TOTAL_MARKS
        }
      });

      const activeCount = await tx.promptVersion.count({
        where: { exerciseId: exercise.id, isActive: true }
      });

      const promptVersion = await tx.promptVersion.upsert({
        where: {
          exerciseId_version: {
            exerciseId: exercise.id,
            version: 1
          }
        },
        create: {
          exerciseId: exercise.id,
          version: 1,
          transcriptionPrompt,
          evaluationPrompt,
          rubricPrompt,
          markingSchema,
          isActive: activeCount === 0
        },
        update: {
          transcriptionPrompt,
          evaluationPrompt,
          rubricPrompt,
          markingSchema,
          ...(activeCount === 0 ? { isActive: true } : {})
        }
      });

      return { exercise, promptVersion, activeCount };
    });

    console.log(
      `Seeded Exercise "${result.exercise.code}" (id=${result.exercise.id}) and PromptVersion v${result.promptVersion.version} (id=${result.promptVersion.id}, isActive=${result.promptVersion.isActive}).`
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.stack || err.message : String(err);
  console.error('Seed failed:', message);
  process.exit(1);
});
