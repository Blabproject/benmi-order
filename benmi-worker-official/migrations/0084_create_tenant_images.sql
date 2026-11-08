-- Migration 0084: Create tenant_images metadata table for R2 Object Storage
CREATE TABLE IF NOT EXISTS tenant_images (
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    bare_name TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    content_type TEXT NOT NULL DEFAULT 'image/webp',
    byte_size INTEGER NOT NULL DEFAULT 0,
    etag TEXT DEFAULT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_tenant_images_bare
ON tenant_images(tenant_id, bare_name);
