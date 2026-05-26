-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'DRIVER';

-- CreateEnum
CREATE TYPE "DriverStatus" AS ENUM ('PENDING_KYC', 'ACTIVE', 'SUSPENDED', 'OFFLINE', 'ON_TRIP');

-- CreateEnum
CREATE TYPE "RideTripStatus" AS ENUM ('REQUESTED', 'ASSIGNING', 'ASSIGNED', 'DRIVER_ARRIVING', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'FAILED');

-- CreateEnum
CREATE TYPE "RideAssignmentStatus" AS ENUM ('OFFERED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'COMPLETED');

-- CreateTable
CREATE TABLE "DriverProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "DriverStatus" NOT NULL DEFAULT 'PENDING_KYC',
    "kycStatus" "KycStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "rating" DECIMAL(3,2) NOT NULL DEFAULT 5.0,
    "totalTrips" INTEGER NOT NULL DEFAULT 0,
    "currentLatitude" DECIMAL(10,7),
    "currentLongitude" DECIMAL(10,7),
    "lastLocationAt" TIMESTAMP(3),
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "faceTemplateHash" TEXT,
    "emergencyPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverVehicle" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "plateNumber" TEXT,
    "color" TEXT,
    "make" TEXT,
    "model" TEXT,

    CONSTRAINT "DriverVehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverKycDocument" (
    "id" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverKycDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideTrip" (
    "id" TEXT NOT NULL,
    "tripCode" TEXT NOT NULL,
    "passengerId" TEXT NOT NULL,
    "status" "RideTripStatus" NOT NULL DEFAULT 'REQUESTED',
    "pickupLabel" TEXT NOT NULL,
    "pickupAddress" TEXT,
    "pickupLatitude" DECIMAL(10,7) NOT NULL,
    "pickupLongitude" DECIMAL(10,7) NOT NULL,
    "pickupLandmark" TEXT,
    "dropoffLabel" TEXT NOT NULL,
    "dropoffAddress" TEXT,
    "dropoffLatitude" DECIMAL(10,7) NOT NULL,
    "dropoffLongitude" DECIMAL(10,7) NOT NULL,
    "dropoffLandmark" TEXT,
    "requestedVehicleType" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "distanceKm" DECIMAL(8,2) NOT NULL,
    "etaMinutes" INTEGER NOT NULL,
    "baseFare" DECIMAL(10,2) NOT NULL,
    "perKmFare" DECIMAL(10,2) NOT NULL,
    "perMinuteFare" DECIMAL(10,2) NOT NULL,
    "surgeMultiplier" DECIMAL(4,2) NOT NULL DEFAULT 1.0,
    "totalFare" DECIMAL(10,2) NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideAssignment" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "status" "RideAssignmentStatus" NOT NULL DEFAULT 'OFFERED',
    "score" DECIMAL(6,2) NOT NULL,
    "offeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RideAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideTrackingPoint" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "driverProfileId" TEXT NOT NULL,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "heading" DECIMAL(6,2),
    "speedKph" DECIMAL(6,2),
    "batteryLevel" INTEGER,
    "source" TEXT NOT NULL DEFAULT 'GPS',
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideTrackingPoint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RidePayment" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "provider" TEXT,
    "providerRef" TEXT,
    "mobileNumber" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RidePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RideRating" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RideRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DriverProfile_userId_key" ON "DriverProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverVehicle_driverProfileId_key" ON "DriverVehicle"("driverProfileId");

-- CreateIndex
CREATE UNIQUE INDEX "RideTrip_tripCode_key" ON "RideTrip"("tripCode");

-- CreateIndex
CREATE INDEX "RideTrip_passengerId_createdAt_idx" ON "RideTrip"("passengerId", "createdAt");

-- CreateIndex
CREATE INDEX "RideTrip_status_idx" ON "RideTrip"("status");

-- CreateIndex
CREATE INDEX "RideTrip_pickupLatitude_pickupLongitude_idx" ON "RideTrip"("pickupLatitude", "pickupLongitude");

-- CreateIndex
CREATE INDEX "RideAssignment_tripId_status_idx" ON "RideAssignment"("tripId", "status");

-- CreateIndex
CREATE INDEX "RideAssignment_driverProfileId_status_idx" ON "RideAssignment"("driverProfileId", "status");

-- CreateIndex
CREATE INDEX "RideTrackingPoint_tripId_capturedAt_idx" ON "RideTrackingPoint"("tripId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RidePayment_tripId_key" ON "RidePayment"("tripId");

-- CreateIndex
CREATE UNIQUE INDEX "RideRating_tripId_key" ON "RideRating"("tripId");

-- AddForeignKey
ALTER TABLE "DriverProfile" ADD CONSTRAINT "DriverProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverVehicle" ADD CONSTRAINT "DriverVehicle_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverKycDocument" ADD CONSTRAINT "DriverKycDocument_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideTrip" ADD CONSTRAINT "RideTrip_passengerId_fkey" FOREIGN KEY ("passengerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideAssignment" ADD CONSTRAINT "RideAssignment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "RideTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideAssignment" ADD CONSTRAINT "RideAssignment_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideTrackingPoint" ADD CONSTRAINT "RideTrackingPoint_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "RideTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideTrackingPoint" ADD CONSTRAINT "RideTrackingPoint_driverProfileId_fkey" FOREIGN KEY ("driverProfileId") REFERENCES "DriverProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RidePayment" ADD CONSTRAINT "RidePayment_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "RideTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRating" ADD CONSTRAINT "RideRating_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "RideTrip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RideRating" ADD CONSTRAINT "RideRating_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
