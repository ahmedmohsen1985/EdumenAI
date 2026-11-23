-- CreateEnum
CREATE TYPE "ExerciseSkill" AS ENUM ('WRITING', 'READING', 'LISTENING', 'SPEAKING');

-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "AIProviderConfig" ADD COLUMN     "baseUrl" TEXT,
ADD COLUMN     "extraConfig" JSONB,
ADD COLUMN     "isEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Exercise" ADD COLUMN     "skill" "ExerciseSkill" NOT NULL DEFAULT 'WRITING',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "PromptVersion" ADD COLUMN     "promptEntries" JSONB,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "VersionStatus" NOT NULL DEFAULT 'PUBLISHED',
ADD COLUMN     "templateSchema" JSONB,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Submission" ADD COLUMN     "formData" JSONB,
ADD COLUMN     "isPreview" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "AITaskRoute" (
    "id" TEXT NOT NULL,
    "taskType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "maxTokens" INTEGER,
    "temperature" DOUBLE PRECISION,
    "reasoningConfig" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AITaskRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramConfig" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL DEFAULT 'default',
    "botToken" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramTarget" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AITaskRoute_taskType_key" ON "AITaskRoute"("taskType");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConfig_key_key" ON "TelegramConfig"("key");

-- CreateIndex
CREATE INDEX "TelegramTarget_isActive_isDefault_idx" ON "TelegramTarget"("isActive", "isDefault");

-- CreateIndex
CREATE INDEX "PromptVersion_exerciseId_status_idx" ON "PromptVersion"("exerciseId", "status");

-- CreateIndex
CREATE INDEX "Submission_isPreview_createdAt_idx" ON "Submission"("isPreview", "createdAt");

