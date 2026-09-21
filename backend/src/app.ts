import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { openapiSpec } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN,
      credentials: true,
    }),
  );
  // Raised from the 100kb default to allow base64 avatar images on the profile API.
  app.use(express.json({ limit: '5mb' }));
  app.use(cookieParser());

  // API documentation: interactive Swagger UI + raw OpenAPI JSON.
  app.get('/api/v1/openapi.json', (_req, res) => {
    res.json(openapiSpec);
  });
  app.use(
    '/api/v1/docs',
    swaggerUi.serve,
    swaggerUi.setup(openapiSpec, { customSiteTitle: 'TestingFlow API Docs' }),
  );

  app.use('/api/v1', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
