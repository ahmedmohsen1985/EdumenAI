import './config.js';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static frontend files
app.use(express.static(path.join(__dirname, '../public')));

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

// SPA fallback: serve index.html for non-API routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

app.listen(config.port, () => {
  const aiSummary = getAiRuntimeSummary();
  console.log(`[Server] EdumenAI Exercise 4 running on port ${config.port}`);
  console.log(`[Server] Environment: ${config.nodeEnv}`);
  console.log(
    `[AI Config] Vision/OCR : ${aiSummary.vision.provider} / ${aiSummary.vision.model} (Key: ${aiSummary.vision.configured ? 'configured' : 'MISSING'})`
  );
  console.log(
    `[AI Config] Evaluation : ${aiSummary.evaluation.provider} / ${aiSummary.evaluation.model} (Key: ${aiSummary.evaluation.configured ? 'configured' : 'MISSING'})`
  );
});

export default app;
