import { KycStatus, UserRole } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../config/prisma';
import { requireRoles } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { asyncHandler } from '../../utils/asyncHandler';
import { notFound } from '../../utils/http';
import { ok } from '../../utils/response';

export const documentsRouter = Router();

const userSelect = {
  select: { id: true, name: true, phone: true, email: true },
} as const;

// GET /admin/documents/kyc — every KYC document uploaded from the rider and
// driver apps, newest first, with the uploader and review state.
documentsRouter.get(
  '/documents/kyc',
  asyncHandler(async (req, res) => {
    const status =
      typeof req.query.status === 'string' && req.query.status in KycStatus
        ? (req.query.status as KycStatus)
        : undefined;
    const where = status ? { status } : {};

    const [riderDocs, driverDocs] = await Promise.all([
      prisma.kycDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          riderProfile: { select: { id: true, kycStatus: true, user: userSelect } },
        },
      }),
      prisma.driverKycDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: {
          driverProfile: { select: { id: true, kycStatus: true, user: userSelect } },
        },
      }),
    ]);

    const items = [
      ...riderDocs.map((doc) => ({
        id: doc.id,
        kind: 'RIDER' as const,
        type: doc.type,
        fileUrl: doc.fileUrl,
        status: doc.status,
        createdAt: doc.createdAt,
        reviewedAt: doc.reviewedAt,
        profileKycStatus: doc.riderProfile.kycStatus,
        user: doc.riderProfile.user,
      })),
      ...driverDocs.map((doc) => ({
        id: doc.id,
        kind: 'DRIVER' as const,
        type: doc.type,
        fileUrl: doc.fileUrl,
        status: doc.status,
        createdAt: doc.createdAt,
        reviewedAt: doc.reviewedAt,
        profileKycStatus: doc.driverProfile.kycStatus,
        user: doc.driverProfile.user,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return ok(res, items);
  })
);

const reviewSchema = z.object({
  params: z.object({
    kind: z.enum(['RIDER', 'DRIVER']),
    id: z.string().min(1),
  }),
  body: z.object({
    decision: z.enum([KycStatus.VERIFIED, KycStatus.REJECTED]),
  }),
});

// POST /admin/documents/kyc/:kind/:id/review — approve or reject a document.
// When every document on the profile is verified, the profile is activated.
documentsRouter.post(
  '/documents/kyc/:kind/:id/review',
  requireRoles(UserRole.ADMIN, UserRole.OPERATIONS),
  validate(reviewSchema),
  asyncHandler(async (req, res) => {
    const { kind, id } = req.params as { kind: 'RIDER' | 'DRIVER'; id: string };
    const decision = req.body.decision as KycStatus;

    if (kind === 'RIDER') {
      const doc = await prisma.kycDocument.findUnique({ where: { id } });
      if (!doc) throw notFound('Document not found');

      const updated = await prisma.kycDocument.update({
        where: { id },
        data: { status: decision, reviewedAt: new Date() },
      });

      const remaining = await prisma.kycDocument.count({
        where: { riderProfileId: doc.riderProfileId, status: KycStatus.SUBMITTED },
      });
      if (decision === KycStatus.REJECTED) {
        await prisma.riderProfile.update({
          where: { id: doc.riderProfileId },
          data: { kycStatus: KycStatus.REJECTED },
        });
      } else if (remaining === 0) {
        await prisma.riderProfile.update({
          where: { id: doc.riderProfileId },
          data: { kycStatus: KycStatus.VERIFIED, status: 'ACTIVE' },
        });
      }

      await recordReview(req.user!.id, 'KycDocument', id, decision);
      return ok(res, updated);
    }

    const doc = await prisma.driverKycDocument.findUnique({ where: { id } });
    if (!doc) throw notFound('Document not found');

    const updated = await prisma.driverKycDocument.update({
      where: { id },
      data: { status: decision, reviewedAt: new Date() },
    });

    const remaining = await prisma.driverKycDocument.count({
      where: { driverProfileId: doc.driverProfileId, status: KycStatus.SUBMITTED },
    });
    if (decision === KycStatus.REJECTED) {
      await prisma.driverProfile.update({
        where: { id: doc.driverProfileId },
        data: { kycStatus: KycStatus.REJECTED },
      });
    } else if (remaining === 0) {
      await prisma.driverProfile.update({
        where: { id: doc.driverProfileId },
        data: { kycStatus: KycStatus.VERIFIED, status: 'ACTIVE' },
      });
    }

    await recordReview(req.user!.id, 'DriverKycDocument', id, decision);
    return ok(res, updated);
  })
);

async function recordReview(actorId: string, entity: string, entityId: string, decision: string) {
  try {
    await prisma.auditLog.create({
      data: { actorId, action: 'KYC_DOC_REVIEWED', entity, entityId, metadata: { decision } },
    });
  } catch (error) {
    console.error('Failed to record KYC review audit log', { entity, entityId, error });
  }
}

// GET /admin/documents/media — customer-side uploads: delivery proof photos,
// signatures, and pickup/dropoff voice notes.
documentsRouter.get(
  '/documents/media',
  asyncHandler(async (_req, res) => {
    const [proofs, voiceDeliveries] = await Promise.all([
      prisma.deliveryProof.findMany({
        where: { OR: [{ photoUrl: { not: null } }, { signatureUrl: { not: null } }] },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: {
          delivery: {
            select: { trackingCode: true, status: true, customer: userSelect },
          },
        },
      }),
      prisma.delivery.findMany({
        where: {
          OR: [{ pickupVoiceNoteUrl: { not: null } }, { dropoffVoiceNoteUrl: { not: null } }],
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          trackingCode: true,
          status: true,
          createdAt: true,
          pickupVoiceNoteUrl: true,
          dropoffVoiceNoteUrl: true,
          customer: userSelect,
        },
      }),
    ]);

    if (!proofs.length && !voiceDeliveries.length) {
      return ok(res, { proofs: [], voiceNotes: [] });
    }

    return ok(res, {
      proofs: proofs.map((proof) => ({
        id: proof.id,
        trackingCode: proof.delivery.trackingCode,
        deliveryStatus: proof.delivery.status,
        customer: proof.delivery.customer,
        photoUrl: proof.photoUrl,
        signatureUrl: proof.signatureUrl,
        recipientName: proof.recipientName,
        verifiedAt: proof.verifiedAt,
        createdAt: proof.createdAt,
      })),
      voiceNotes: voiceDeliveries.flatMap((delivery) =>
        [
          delivery.pickupVoiceNoteUrl
            ? {
                id: `${delivery.id}-pickup`,
                trackingCode: delivery.trackingCode,
                deliveryStatus: delivery.status,
                customer: delivery.customer,
                stage: 'PICKUP' as const,
                url: delivery.pickupVoiceNoteUrl,
                createdAt: delivery.createdAt,
              }
            : null,
          delivery.dropoffVoiceNoteUrl
            ? {
                id: `${delivery.id}-dropoff`,
                trackingCode: delivery.trackingCode,
                deliveryStatus: delivery.status,
                customer: delivery.customer,
                stage: 'DROPOFF' as const,
                url: delivery.dropoffVoiceNoteUrl,
                createdAt: delivery.createdAt,
              }
            : null,
        ].filter((note): note is NonNullable<typeof note> => note !== null)
      ),
    });
  })
);
