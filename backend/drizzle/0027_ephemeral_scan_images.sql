-- Scan images are processed in memory, never stored as local/S3 objects.
-- Existing stored object references are removed; metadata and review receipts remain.
ALTER TABLE "scan_artifacts" DROP COLUMN "original_object_key";
--> statement-breakpoint
ALTER TABLE "scan_artifacts" DROP COLUMN "normalized_object_key";
