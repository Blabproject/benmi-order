-- Delivery contact information is kept separate from public order projections.
ALTER TABLE orders ADD COLUMN delivery_details_json TEXT;
