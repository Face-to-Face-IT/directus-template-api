/**
 * API request and response types for the Express server
 */

export interface ApplyTemplateRequest {
  content?: boolean;
  dashboards?: boolean;
  directusToken?: string;
  directusUrl: string;
  extensions?: boolean;
  files?: boolean;
  flows?: boolean;
  partial?: boolean;
  permissions?: boolean;
  schema?: boolean;
  settings?: boolean;
  templateLocation: string;
  templateType?: 'community' | 'github' | 'local';
  userEmail?: string;
  userPassword?: string;
  users?: boolean;
}

export interface ExtractTemplateRequest {
  /** Format for archive response: 'binary' (default) or 'base64' */
  archiveFormat?: 'base64' | 'binary';
  /** Partial extraction flags - all default to true unless explicitly set to false */
  content?: boolean;
  dashboards?: boolean;
  directusToken?: string;
  directusUrl: string;
  extensions?: boolean;
  files?: boolean;
  flows?: boolean;
  permissions?: boolean;
  /** If true, returns the template as a gzipped tar archive instead of saving to disk */
  returnArchive?: boolean;
  schema?: boolean;
  settings?: boolean;
  templateLocation?: string;
  templateName: string;
  userEmail?: string;
  userPassword?: string;
  users?: boolean;
}

export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
  success: boolean;
}

export interface HealthResponse {
  status: 'ok';
  timestamp: string;
  version: string;
}
