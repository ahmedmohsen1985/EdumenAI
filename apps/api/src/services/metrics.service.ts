import type { TokenMetricsResponse } from '@edumenai/shared';
import { appCache } from '../lib/cache.js';
import { prisma } from '../lib/prisma.js';

export async function getTokenConsumptionMetrics(days = 30): Promise<TokenMetricsResponse> {
  const periodDays = Math.min(Math.max(Math.trunc(Number.isFinite(days) ? days : 30), 1), 365);

  return appCache.getOrSet(`metrics:tokens:${periodDays}`, async () => {
    const since = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    const [reports, deductions] = await Promise.all([
      prisma.evaluationReport.findMany({
        where: {
          createdAt: { gte: since },
          submission: { isPreview: false }
        },
        select: {
          provider: true,
          model: true,
          promptTokens: true,
          completionTokens: true,
          totalTokens: true,
          latencyMs: true,
          createdAt: true,
          submission: {
            select: {
              exercise: {
                select: {
                  code: true,
                  title: true
                }
              }
            }
          }
        }
      }),
      prisma.creditTransaction.findMany({
        where: {
          type: 'DEDUCTION',
          createdAt: { gte: since }
        },
        select: {
          amount: true,
          createdAt: true
        }
      })
    ]);

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalTokens = 0;
    let latencySum = 0;
    let latencyCount = 0;

    const providerModelMap = new Map<
      string,
      {
        provider: string;
        model: string;
        evaluations: number;
        totalTokens: number;
        promptTokens: number;
        completionTokens: number;
        latencySum: number;
        latencyCount: number;
      }
    >();

    const exerciseMap = new Map<
      string,
      {
        exerciseCode: string;
        exerciseTitle: string;
        evaluations: number;
        totalTokens: number;
      }
    >();

    const dailyMap = new Map<
      string,
      {
        date: string;
        evaluations: number;
        totalTokens: number;
        creditsDeducted: number;
      }
    >();

    const getOrCreateDaily = (dateKey: string) => {
      let bucket = dailyMap.get(dateKey);
      if (!bucket) {
        bucket = { date: dateKey, evaluations: 0, totalTokens: 0, creditsDeducted: 0 };
        dailyMap.set(dateKey, bucket);
      }
      return bucket;
    };

    for (const row of reports) {
      const prompt = row.promptTokens ?? 0;
      const completion = row.completionTokens ?? 0;
      const total = row.totalTokens ?? prompt + completion;

      totalPromptTokens += prompt;
      totalCompletionTokens += completion;
      totalTokens += total;

      if (typeof row.latencyMs === 'number' && Number.isFinite(row.latencyMs)) {
        latencySum += row.latencyMs;
        latencyCount += 1;
      }

      const pmKey = `${row.provider}::${row.model}`;
      let pm = providerModelMap.get(pmKey);
      if (!pm) {
        pm = {
          provider: row.provider,
          model: row.model,
          evaluations: 0,
          totalTokens: 0,
          promptTokens: 0,
          completionTokens: 0,
          latencySum: 0,
          latencyCount: 0
        };
        providerModelMap.set(pmKey, pm);
      }
      pm.evaluations += 1;
      pm.promptTokens += prompt;
      pm.completionTokens += completion;
      pm.totalTokens += total;
      if (typeof row.latencyMs === 'number' && Number.isFinite(row.latencyMs)) {
        pm.latencySum += row.latencyMs;
        pm.latencyCount += 1;
      }

      const exCode = row.submission.exercise.code;
      const exTitle = row.submission.exercise.title;
      let ex = exerciseMap.get(exCode);
      if (!ex) {
        ex = {
          exerciseCode: exCode,
          exerciseTitle: exTitle,
          evaluations: 0,
          totalTokens: 0
        };
        exerciseMap.set(exCode, ex);
      }
      ex.evaluations += 1;
      ex.totalTokens += total;

      const dateKey = row.createdAt.toISOString().slice(0, 10);
      const dayBucket = getOrCreateDaily(dateKey);
      dayBucket.evaluations += 1;
      dayBucket.totalTokens += total;
    }

    let totalCreditsDeducted = 0;
    for (const tx of deductions) {
      const deducted = Math.abs(tx.amount);
      totalCreditsDeducted += deducted;
      const dateKey = tx.createdAt.toISOString().slice(0, 10);
      const dayBucket = getOrCreateDaily(dateKey);
      dayBucket.creditsDeducted += deducted;
    }

    const byProviderModel = Array.from(providerModelMap.values())
      .map((entry) => ({
        provider: entry.provider,
        model: entry.model,
        evaluations: entry.evaluations,
        totalTokens: entry.totalTokens,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        avgLatencyMs:
          entry.latencyCount > 0 ? Math.round(entry.latencySum / entry.latencyCount) : 0
      }))
      .sort((a, b) => b.totalTokens - a.totalTokens);

    const byExercise = Array.from(exerciseMap.values())
      .sort((a, b) => b.totalTokens - a.totalTokens)
      .slice(0, 15);

    const daily = Array.from(dailyMap.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );

    return {
      periodDays,
      summary: {
        totalEvaluations: reports.length,
        totalPromptTokens,
        totalCompletionTokens,
        totalTokens,
        avgLatencyMs: latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0,
        totalCreditsDeducted
      },
      byProviderModel,
      byExercise,
      daily
    };
  });
}
