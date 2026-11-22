// @ts-nocheck
import './config.js';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import apiRoutes from './routes/api.routes.js';
import { config, getTaskAiConfig, getProviderApiKey } from './config.js';

function getAiRuntimeSummary() {
  const vision = getTaskAiConfig('vision');
  const evaluation = getTaskAiConfig('evaluation');
  return {
    vision: {
      provider: vision.provider,
      model: vision.model,
      configured: Boolean(getProviderApiKey(vision.provider).apiKey)
    },
    evaluation: {
      provider: evaluation.provider,
      model: evaluation.model,
      configured: Boolean(getProviderApiKey(evaluation.provider).apiKey)
    }
  };
}

const app = express();

// Security & middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ai: getAiRuntimeSummary()
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

const server = app.listen(config.port, () => {
  const aiSummary = getAiRuntimeSummary();
  console.log(`[Server] EdumenAI API running on port ${config.port}`);
  console.log(`[Server] Environment: ${config.nodeEnv}`);
  console.log(
    `[AI Config] Vision/OCR : ${aiSummary.vision.provider} / ${aiSummary.vision.model} (Key: ${aiSummary.vision.configured ? 'configured' : 'MISSING'})`
  );
  console.log(
    `[AI Config] Evaluation : ${aiSummary.evaluation.provider} / ${aiSummary.evaluation.model} (Key: ${aiSummary.evaluation.configured ? 'configured' : 'MISSING'})`
  );
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Server] SIGTERM received, closing HTTP server...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('[Server] SIGINT received, closing HTTP server...');
  server.close(() => {
    console.log('[Server] HTTP server closed');
    process.exit(0);
  });
});

export default app;
