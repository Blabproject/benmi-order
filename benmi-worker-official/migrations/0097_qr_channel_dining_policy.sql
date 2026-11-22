-- Migration 0097: Add per-channel dining_policy on tenant_qr_channels
-- Supports QR entrypoints for: 'dine_in' (Tại chỗ), 'takeaway' (Mang đi), 'customer_choice' (Khách tự chọn)

ALTER TABLE tenant_qr_channels
    ADD COLUMN dining_policy TEXT NOT NULL DEFAULT 'customer_choice'
    CHECK(dining_policy IN ('customer_choice', 'dine_in', 'takeaway'));
