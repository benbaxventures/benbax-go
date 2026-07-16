-- CreateEnum
CREATE TYPE "CancelActor" AS ENUM ('CUSTOMER', 'RIDER', 'DRIVER', 'ADMIN', 'SYSTEM');

-- AlterTable
ALTER TABLE "Delivery" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledBy" "CancelActor";

-- AlterTable
ALTER TABLE "RideTrip" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledBy" "CancelActor";

-- CreateTable
CREATE TABLE "DeliveryStatusEvent" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "fromStatus" "DeliveryStatus",
    "toStatus" "DeliveryStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripStatusEvent" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "fromStatus" "RideTripStatus",
    "toStatus" "RideTripStatus" NOT NULL,
    "actorId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripStatusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryStatusEvent_deliveryId_createdAt_idx" ON "DeliveryStatusEvent"("deliveryId", "createdAt");

-- CreateIndex
CREATE INDEX "TripStatusEvent_tripId_createdAt_idx" ON "TripStatusEvent"("tripId", "createdAt");

-- AddForeignKey
ALTER TABLE "DeliveryStatusEvent" ADD CONSTRAINT "DeliveryStatusEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "Delivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripStatusEvent" ADD CONSTRAINT "TripStatusEvent_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "RideTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

