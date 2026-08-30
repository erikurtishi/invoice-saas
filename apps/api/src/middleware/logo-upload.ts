import { LOGO_ACCEPTED_MIME, LOGO_MAX_BYTES } from '@invoice-saas/shared';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import multer, { MulterError } from 'multer';

import { ApiError } from '../lib/api-error.js';

/**
 * Single-file, in-memory upload for the business logo (backlog 1.2.3). Held in
 * memory (not written to disk) because `profile-service` re-encodes it through
 * sharp before anything is persisted. Multer's own errors are translated to the
 * standard `VALIDATION_ERROR` body here so route handlers and the web client only
 * ever see the one error shape.
 */

const MIME_MESSAGE = 'Upload a PNG, JPEG or WebP image.';
const SIZE_MESSAGE = 'That image is larger than 2 MB.';

const single: RequestHandler = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: LOGO_MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!LOGO_ACCEPTED_MIME.includes(file.mimetype as (typeof LOGO_ACCEPTED_MIME)[number])) {
      cb(ApiError.validation(MIME_MESSAGE, { logo: [MIME_MESSAGE] }));
      return;
    }
    cb(null, true);
  },
}).single('logo');

export const logoUpload = (req: Request, res: Response, next: NextFunction): void => {
  single(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      const message = err.code === 'LIMIT_FILE_SIZE' ? SIZE_MESSAGE : 'That upload was rejected.';
      next(ApiError.validation(message, { logo: [message] }));
      return;
    }
    next(err ?? undefined);
  });
};
