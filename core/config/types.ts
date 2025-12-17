/**
 * CONFIGURATION TYPES
 */

export interface Config {
  server: {
    port: number;
    host: string;
    nodeEnv: string;
  };
  database: {
    url?: string;
    ssl?: boolean;
  };
  aws: {
    region: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    s3Bucket?: string;
  };
  llm: {
    anthropicApiKey?: string;
    openaiApiKey?: string;
    geminiApiKey?: string;
    ollamaBaseUrl?: string;
    ollamaApiKey?: string;
    ollamaModel?: string;
  };
  redis: {
    url?: string;
  };
  auth: {
    masterApiKey?: string;
    auth0Domain?: string;
    auth0ClientId?: string;
    auth0ClientSecret?: string;
  };
}

