-- Splits back-office privilege out of User.role so one account can hold an
-- operational role (DRIVER/CUSTOMER/RIDER) and staff access at the same time.

-- CreateEnum
CREATE TYPE "StaffRole" AS ENUM ('ADMIN', 'SUPPORT', 'OPERATIONS');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "staffRole" "StaffRole";

-- Backfill: every account that is staff today keeps its access. `role` is left
-- alone, so existing admins stay exactly as they are and nothing depends on
-- this migration having run to keep working.
UPDATE "User"
SET "staffRole" = "role"::text::"StaffRole"
WHERE "role" IN ('ADMIN', 'SUPPORT', 'OPERATIONS');
