-- ============================================================
--  Migracion 002: anade app_secret a config_whatsapp
--  El App Secret de Meta se usa para validar la firma
--  X-Hub-Signature-256 del webhook (HMAC-SHA256).
-- ============================================================
ALTER TABLE config_whatsapp ADD COLUMN app_secret_enc TEXT;
