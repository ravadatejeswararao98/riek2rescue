-- ============================================================================
-- Risk2Rescue: Firestore -> PostgreSQL + PostGIS Migration Script
-- Generated: 2026-09-18T04:11:08.492Z
-- Mode: DRY-RUN (Safe transaction roll-back)
-- ============================================================================

BEGIN;

-- Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- ----------------------------------------------------------------------------
-- 1. DOMAIN: ACCOUNTS (Authority Officers & Admins)
-- ----------------------------------------------------------------------------
INSERT INTO accounts.authority_users (
  officer_id, email, password_hash, name, phone, department, district, clearance_level, is_active, created_at
) VALUES (
  'AP-SDMA-CMD-001',
  'commander@sdma.ap.gov.in',
  '$2b$10$7vMkW7b4y3bL4vP7fQ8gNeJ5K3mZ4Yx8wP0l1m9b8c7d6e5f4a3b2',
  'Director R. Mehra',
  '+91-866-2488888',
  'AP SDMA Incident Command',
  'Statewide',
  'LEVEL-3 (VERIFIED DISPATCH)',
  TRUE,
  '2026-09-18T03:56:00.000Z'
) ON CONFLICT (email) DO UPDATE SET
  name = EXCLUDED.name,
  department = EXCLUDED.department,
  district = EXCLUDED.district,
  clearance_level = EXCLUDED.clearance_level,
  updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 2. DOMAIN: GIS FEATURES (Safe Sites & Evacuation Centers)
-- ----------------------------------------------------------------------------
INSERT INTO gis.safe_sites (
  id, name, location_name, geom, district, total_capacity, current_occupancy, status, amenities, is_authoritative_baseline
) VALUES (
  'S_STATIC_01',
  'Visakhapatnam Hill Camp',
  'Visakhapatnam Hill Camp',
  ST_SetSRID(ST_MakePoint(83.220000, 17.700000), 4326),
  'Visakhapatnam',
  5000,
  3000,
  'open',
  '[]'::jsonb,
  TRUE
) ON CONFLICT (id) DO UPDATE SET
  total_capacity = EXCLUDED.total_capacity,
  current_occupancy = EXCLUDED.current_occupancy,
  status = EXCLUDED.status,
  geom = EXCLUDED.geom,
  updated_at = NOW();
INSERT INTO gis.safe_sites (
  id, name, location_name, geom, district, total_capacity, current_occupancy, status, amenities, is_authoritative_baseline
) VALUES (
  'S_STATIC_02',
  'Kakinada Municipal Shelter',
  'Kakinada Municipal Shelter',
  ST_SetSRID(ST_MakePoint(82.250000, 17.000000), 4326),
  'East Godavari',
  10000,
  0,
  'standby',
  '[]'::jsonb,
  TRUE
) ON CONFLICT (id) DO UPDATE SET
  total_capacity = EXCLUDED.total_capacity,
  current_occupancy = EXCLUDED.current_occupancy,
  status = EXCLUDED.status,
  geom = EXCLUDED.geom,
  updated_at = NOW();
INSERT INTO gis.safe_sites (
  id, name, location_name, geom, district, total_capacity, current_occupancy, status, amenities, is_authoritative_baseline
) VALUES (
  'S_STATIC_03',
  'Krishna Relief Center',
  'Krishna Relief Center',
  ST_SetSRID(ST_MakePoint(81.150000, 16.200000), 4326),
  'Krishna',
  6000,
  600,
  'open',
  '[]'::jsonb,
  TRUE
) ON CONFLICT (id) DO UPDATE SET
  total_capacity = EXCLUDED.total_capacity,
  current_occupancy = EXCLUDED.current_occupancy,
  status = EXCLUDED.status,
  geom = EXCLUDED.geom,
  updated_at = NOW();
INSERT INTO gis.safe_sites (
  id, name, location_name, geom, district, total_capacity, current_occupancy, status, amenities, is_authoritative_baseline
) VALUES (
  'S_STATIC_04',
  'Srikakulam ZP High School',
  'Srikakulam ZP High School',
  ST_SetSRID(ST_MakePoint(83.900000, 18.300000), 4326),
  'Srikakulam',
  4000,
  0,
  'standby',
  '[]'::jsonb,
  TRUE
) ON CONFLICT (id) DO UPDATE SET
  total_capacity = EXCLUDED.total_capacity,
  current_occupancy = EXCLUDED.current_occupancy,
  status = EXCLUDED.status,
  geom = EXCLUDED.geom,
  updated_at = NOW();
INSERT INTO gis.safe_sites (
  id, name, location_name, geom, district, total_capacity, current_occupancy, status, amenities, is_authoritative_baseline
) VALUES (
  'S_STATIC_05',
  'Nellore Community Hall',
  'Nellore Community Hall',
  ST_SetSRID(ST_MakePoint(79.990000, 14.450000), 4326),
  'Nellore',
  3000,
  0,
  'standby',
  '[]'::jsonb,
  TRUE
) ON CONFLICT (id) DO UPDATE SET
  total_capacity = EXCLUDED.total_capacity,
  current_occupancy = EXCLUDED.current_occupancy,
  status = EXCLUDED.status,
  geom = EXCLUDED.geom,
  updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 3. DOMAIN: GIS FEATURES (Hazard Zones & Perimeters)
-- ----------------------------------------------------------------------------
INSERT INTO gis.hazard_zones (
  id, name, hazard_type, current_tier, severity, radius_km, geom, center_point, district, source, evacuation_status, population_at_risk, is_active
) VALUES (
  'ZONE-CYC-AP-01',
  'Kakinada Coastal Surge Red Zone',
  'cyclone',
  'RED',
  'CRITICAL',
  25,
  ST_Transform(ST_Buffer(ST_SetSRID(ST_MakePoint(82.247467, 16.989065), 4326)::geography, 25000)::geometry, 4326),
  ST_SetSRID(ST_MakePoint(82.247467, 16.989065), 4326),
  'East Godavari',
  'IMD Doppler Radar / Cyclone AI Mesh',
  'MANDATORY',
  84000,
  TRUE
) ON CONFLICT (id) DO UPDATE SET
  current_tier = EXCLUDED.current_tier,
  severity = EXCLUDED.severity,
  geom = EXCLUDED.geom,
  population_at_risk = EXCLUDED.population_at_risk,
  updated_at = NOW();
INSERT INTO gis.hazard_zones (
  id, name, hazard_type, current_tier, severity, radius_km, geom, center_point, district, source, evacuation_status, population_at_risk, is_active
) VALUES (
  'ZONE-FLD-AP-02',
  'Godavari Basin Inundation Corridor',
  'flood',
  'AMBER',
  'HIGH',
  18,
  ST_Transform(ST_Buffer(ST_SetSRID(ST_MakePoint(81.800000, 16.950000), 4326)::geography, 18000)::geometry, 4326),
  ST_SetSRID(ST_MakePoint(81.800000, 16.950000), 4326),
  'Konaseema',
  'CWC River Level NWIC Model',
  'ADVISORY',
  42000,
  TRUE
) ON CONFLICT (id) DO UPDATE SET
  current_tier = EXCLUDED.current_tier,
  severity = EXCLUDED.severity,
  geom = EXCLUDED.geom,
  population_at_risk = EXCLUDED.population_at_risk,
  updated_at = NOW();

-- ----------------------------------------------------------------------------
-- 4. DOMAIN: GIS FEATURES (Citizen Incident Reports)
-- ----------------------------------------------------------------------------
INSERT INTO gis.citizen_reports (
  id, type, severity, location_text, geom, description, status, officer_notes, source, submitted_at, verified_at
) VALUES (
  'CR-2026-001',
  'Flash Flood',
  'High',
  'Subrahmanya Nagar, Kakinada',
  ST_SetSRID(ST_MakePoint(82.240000, 16.980000), 4326),
  'Inundation 1.2m deep. 4 elderly residents stranded on first floor.',
  'Verified',
  'Confirmed via SDRF drone feed. Boat team dispatched.',
  'CITIZEN_SOS',
  to_timestamp(1789697468.491),
  to_timestamp(1789701068.491)
) ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  officer_notes = EXCLUDED.officer_notes,
  verified_at = EXCLUDED.verified_at,
  updated_at = NOW();
INSERT INTO gis.citizen_reports (
  id, type, severity, location_text, geom, description, status, officer_notes, source, submitted_at, verified_at
) VALUES (
  'CR-2026-002',
  'Embankment Breach',
  'Critical',
  'Godavari Left Embankment, Rajahmundry Rural',
  ST_SetSRID(ST_MakePoint(81.780000, 16.920000), 4326),
  'Major seepage observed along irrigation bund, threat to 3 hamlets.',
  'Pending',
  NULL,
  'PANCHAYAT_REPRESENTATIVE',
  to_timestamp(1789702868.491),
  NULL
) ON CONFLICT (id) DO UPDATE SET
  status = EXCLUDED.status,
  officer_notes = EXCLUDED.officer_notes,
  verified_at = EXCLUDED.verified_at,
  updated_at = NOW();

-- ----------------------------------------------------------------------------
-- DRY-RUN VERIFICATION: ROLLBACK TRANSACTION
-- ----------------------------------------------------------------------------
SELECT COUNT(*) AS total_accounts FROM accounts.authority_users;
SELECT COUNT(*) AS total_shelters FROM gis.safe_sites;
SELECT COUNT(*) AS total_hazard_zones FROM gis.hazard_zones;
SELECT COUNT(*) AS total_citizen_reports FROM gis.citizen_reports;

ROLLBACK; -- Dry-run active: all test inserts rolled back cleanly without altering database