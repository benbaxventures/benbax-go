import { v2 as cloudinary } from 'cloudinary';
import { Router } from 'express';
import { env } from '../../config/env';
import { requireAuth } from '../../middleware/auth';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/response';

export const mediaRouter = Router();

cloudinary.config({
  ...(env.CLOUDINARY_CLOUD_NAME ? { cloud_name: env.CLOUDINARY_CLOUD_NAME } : {}),
  ...(env.CLOUDINARY_API_KEY ? { api_key: env.CLOUDINARY_API_KEY } : {}),
  ...(env.CLOUDINARY_API_SECRET ? { api_secret: env.CLOUDINARY_API_SECRET } : {}),
  secure: true,
});

mediaRouter.use(requireAuth);

mediaRouter.post(
  '/cloudinary-signature',
  asyncHandler(async (req, res) => {
    const timestamp = Math.round(Date.now() / 1000);
    const folder = `benbax/${req.user!.id}`;
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder },
      env.CLOUDINARY_API_SECRET ?? ''
    );

    return ok(res, {
      cloudName: env.CLOUDINARY_CLOUD_NAME,
      apiKey: env.CLOUDINARY_API_KEY,
      timestamp,
      folder,
      signature,
    });
  })
);
