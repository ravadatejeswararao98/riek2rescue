-- ============================================================================
-- Risk2Rescue: Master PostgreSQL Database Schema
-- Domains: accounts, gis, telemetry, ai
-- Extensions: uuid-ossp, postgis, pg_cron
-- ============================================================================

-- 0. Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- 1. Create Dedicated Namespaces (Domains)
CREATE SCHEMA IF NOT EXISTS accounts;
CREATE SCHEMA IF NOT EXISTS gis;
CREATE SCHEMA IF NOT EXISTS telemetry;
CREATE SCHEMA IF NOT EXISTS ai;

-- ============================================================================
-- DOMAIN A: ACCOUNTS & AUTHENTICATION
-- ============================================================================

-- Authority officers, commanders, and administrative personnel
CREATE TABLE IF NOT EXISTS accounts.authority_users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    officer_id VARCHAR(64) UNIQUE NOT NULL,             -- e.g. 'AP-SDMA-CMD-001'
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,                -- Argon2id or bcrypt hash
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(32),
    department VARCHAR(100) NOT NULL,                  -- e.g. 'AP SDMA Incident Command'
    district VARCHAR(100) NOT NULL,                    -- Jurisdiction (or 'Statewide')
    clearance_level VARCHAR(64) NOT NULL DEFAULT 'LEVEL-3 (VERIFIED DISPATCH)',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Active authenticated officer sessions & refresh tokens
CREATE TABLE IF NOT EXISTS accounts.auth_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES accounts.authority_users(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Append-only audit log for command actions
CREATE TABLE IF NOT EXISTS accounts.audit_log (
    id BIGSERIAL PRIMARY KEY,
    officer_id VARCHAR(64) NOT NULL,
    action VARCHAR(100) NOT NULL,                      -- e.g. 'VERIFY_REPORT', 'CREATE_ZONE', 'TRIGGER_BROADCAST'
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(128) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- DOMAIN B: GIS FEATURES (PostGIS)
-- ============================================================================

-- Safe Shelters, Evacuation Relief Camps, and Staging Grounds
CREATE TABLE IF NOT EXISTS gis.safe_sites (
    id VARCHAR(64) PRIMARY KEY,                         -- e.g. 'S_STATIC_01'
    name VARCHAR(200) NOT NULL,
    location_name VARCHAR(255) NOT NULL,
    geom GEOMETRY(Point, 4326) NOT NULL,
    district VARCHAR(100) NOT NULL,
    mandal VARCHAR(100),
    total_capacity INTEGER NOT NULL DEFAULT 0,
    current_occupancy INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(32) NOT NULL DEFAULT 'standby',        -- 'open', 'full', 'standby'
    amenities JSONB DEFAULT '[]'::jsonb,
    is_authoritative_baseline BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safe_sites_geom ON gis.safe_sites USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_safe_sites_district ON gis.safe_sites(district);

-- Hazard Zones, Red/Amber Corridors, and Dynamic Buffer Perimeters
CREATE TABLE IF NOT EXISTS gis.hazard_zones (
    id VARCHAR(64) PRIMARY KEY,                         -- e.g. 'ZONE-CYC-AP-01'
    name VARCHAR(255) NOT NULL,
    hazard_type VARCHAR(64) NOT NULL,                   -- 'cyclone', 'flood', 'fire', 'earthquake'
    current_tier VARCHAR(32) NOT NULL,                  -- 'RED', 'AMBER', 'YELLOW', 'GREEN'
    severity VARCHAR(32) NOT NULL,                      -- 'CRITICAL', 'HIGH', 'MODERATE'
    radius_km NUMERIC(6,2),
    geom GEOMETRY(Geometry, 4326) NOT NULL,             -- Polygon perimeter or geodesic buffer
    center_point GEOMETRY(Point, 4326) NOT NULL,
    district VARCHAR(100),
    source VARCHAR(150),
    evacuation_status VARCHAR(64) DEFAULT 'ADVISORY',
    population_at_risk INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR(64) REFERENCES accounts.authority_users(officer_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hazard_zones_geom ON gis.hazard_zones USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_hazard_zones_center ON gis.hazard_zones USING GIST(center_point);
CREATE INDEX IF NOT EXISTS idx_hazard_zones_active ON gis.hazard_zones(is_active) WHERE is_active = TRUE;

-- Citizen SOS and Incident Reports
CREATE TABLE IF NOT EXISTS gis.citizen_reports (
    id VARCHAR(64) PRIMARY KEY,                         -- e.g. 'CR-2026-001'
    type VARCHAR(100) NOT NULL,
    severity VARCHAR(32) NOT NULL,                      -- 'Critical', 'High', 'Moderate', 'Low'
    location_text VARCHAR(255),
    geom GEOMETRY(Point, 4326) NOT NULL,
    description TEXT,
    photo_urls TEXT[] DEFAULT '{}',
    status VARCHAR(32) NOT NULL DEFAULT 'Pending',        -- 'Pending', 'Verified', 'Rejected', 'Resolved'
    officer_notes TEXT,
    verified_by VARCHAR(64) REFERENCES accounts.authority_users(officer_id),
    source VARCHAR(64) NOT NULL DEFAULT 'CITIZEN_WEB',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    verified_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citizen_reports_geom ON gis.citizen_reports USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_citizen_reports_status ON gis.citizen_reports(status);

-- ============================================================================
-- DOMAIN C: HAZARD TIME-SERIES TELEMETRY & ALERTS
-- ============================================================================

-- Sensor Readings Partitioned by Ingestion / Recorded Timestamp
CREATE TABLE IF NOT EXISTS telemetry.sensor_readings (
    id BIGSERIAL,
    source_id VARCHAR(64) NOT NULL,                    -- 'cwc_nwic_river', 'cpcb_airquality', 'openmeteo_weather'
    station_id VARCHAR(100) NOT NULL,
    station_name VARCHAR(200),
    geom GEOMETRY(Point, 4326) NOT NULL,
    metric_type VARCHAR(64) NOT NULL,                  -- 'water_level_m', 'pm25_ugm3', 'wind_gust_kmh'
    metric_value NUMERIC(10,3) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    warning_threshold NUMERIC(10,3),
    danger_threshold NUMERIC(10,3),
    recorded_at TIMESTAMPTZ NOT NULL,
    ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (recorded_at, id)
) PARTITION BY RANGE (recorded_at);

-- Initial Partition for Current Month
CREATE TABLE IF NOT EXISTS telemetry.sensor_readings_2026_09 PARTITION OF telemetry.sensor_readings
    FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');

CREATE INDEX IF NOT EXISTS idx_telemetry_station_metric ON telemetry.sensor_readings(station_id, metric_type, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_telemetry_geom ON telemetry.sensor_readings USING GIST(geom);

-- Official Alerts (IMD CAP, NDMA, CWC)
CREATE TABLE IF NOT EXISTS telemetry.official_alerts (
    id VARCHAR(128) PRIMARY KEY,                        -- e.g. IMD CAP message ID
    source VARCHAR(64) NOT NULL,                       -- 'IMD', 'NDMA', 'CWC', 'AUTHORITY_BROADCAST'
    level VARCHAR(32) NOT NULL,                        -- 'CRITICAL', 'HIGH', 'ADVISORY'
    type VARCHAR(64) NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    area_description TEXT,
    affected_geom GEOMETRY(Geometry, 4326),
    confidence INTEGER DEFAULT 95,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    effective_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alerts_geom ON telemetry.official_alerts USING GIST(affected_geom);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON telemetry.official_alerts(is_active) WHERE is_active = TRUE;

-- ============================================================================
-- DOMAIN D: AI RESULTS & S3 OBJECT STORAGE REFERENCES
-- ============================================================================

-- AI Model Synthesis Runs & Multi-Hazard Evaluations
CREATE TABLE IF NOT EXISTS ai.orchestration_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    hazard_type VARCHAR(64) NOT NULL,
    trigger_source VARCHAR(100) NOT NULL,
    risk_score NUMERIC(5,2) NOT NULL,
    population_affected INTEGER NOT NULL DEFAULT 0,
    habitations_at_risk INTEGER NOT NULL DEFAULT 0,
    model_version VARCHAR(64) NOT NULL DEFAULT 'v2.6-synth',
    summary_text TEXT,
    state_payload JSONB NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Satellite Products, SAR Inundation Masks & Pre-Signed S3 Assets
CREATE TABLE IF NOT EXISTS ai.satellite_products (
    id VARCHAR(128) PRIMARY KEY,                        -- e.g. 'COPERNICUS-S1-SAR-FLOOD-20260918'
    mission VARCHAR(64) NOT NULL,                      -- 'Sentinel-1-SAR', 'Sentinel-2-MSI', 'Landsat-9'
    product_type VARCHAR(64) NOT NULL,                 -- 'FLOOD_WATER_MASK', 'BURNT_AREA', 'OPTICAL_TRUECOLOR'
    bbox GEOMETRY(Polygon, 4326) NOT NULL,
    acquisition_time TIMESTAMPTZ NOT NULL,
    storage_bucket VARCHAR(128) NOT NULL,              -- e.g. 'rzi-satellite-archive'
    storage_key VARCHAR(512) NOT NULL,                 -- e.g. 'flood_masks/2026/09/18/andhra_pradesh_sar_raw.tif'
    s3_uri VARCHAR(1024) NOT NULL,                     -- e.g. 's3://rzi-satellite-archive/...'
    file_size_bytes BIGINT NOT NULL,
    mime_type VARCHAR(100) DEFAULT 'image/tiff; application=geotiff',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_satellite_bbox ON ai.satellite_products USING GIST(bbox);
