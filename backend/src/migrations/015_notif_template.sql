-- 015_notif_template.sql
-- Agrega campos para plantilla (template) de notificaciones por WhatsApp
-- cuando el usuario esta fuera de la ventana de 24h.

ALTER TABLE config_notificaciones ADD COLUMN template_notificacion TEXT;
ALTER TABLE config_notificaciones ADD COLUMN template_notificacion_lang TEXT DEFAULT 'es_MX';
