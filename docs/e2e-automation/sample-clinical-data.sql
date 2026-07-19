-- =============================================================================
-- DBExec E2E — Synthetic HEALTHCARE / CLINICAL sample warehouse
-- =============================================================================
-- Target : local warehouse Postgres
--          host localhost  port 5432  database DbExec
--          user postgres   password <DB_PASSWORD>
--
-- ISOLATION (READ THIS):
--   The DBExec APP's own MASTER database is ALSO named "DbExec" and its master
--   tables live in the `public` schema; GauravOrg's per-org tables live in a
--   `dbexec` schema. To avoid ANY collision with app data, this script creates
--   everything in a DEDICATED schema named `clinical`. It never touches
--   `public` or `dbexec`.
--
-- IDEMPOTENT: begins with `DROP SCHEMA IF EXISTS clinical CASCADE`, so re-runs
--   are clean. Cleanup after the test is a single `DROP SCHEMA clinical CASCADE`.
--
-- SYNTHETIC ONLY: zero real PHI. MRNs, names, codes, dates are all generated.
--
-- RUN:
--   PGPASSWORD=<DB_PASSWORD> psql -h localhost -p 5432 -U postgres -d DbExec \
--     -v ON_ERROR_STOP=1 -f docs/e2e-automation/sample-clinical-data.sql
--
-- Volumes (approx): 10 facilities, 50 providers, 500 patients,
--   ~5,000 encounters spanning 2023-01-01 .. 2025-12-31,
--   ~1–3 diagnoses/encounter, ~0–2 procedures/encounter.
-- =============================================================================

\set ON_ERROR_STOP on

DROP SCHEMA IF EXISTS clinical CASCADE;
CREATE SCHEMA clinical;
SET search_path TO clinical;

-- Deterministic randomness so re-runs produce comparable data.
SELECT setseed(0.4242);

-- ---------------------------------------------------------------------------
-- 1. FACILITIES  (10 rows, real US states/regions + plausible lat/lon)
-- ---------------------------------------------------------------------------
CREATE TABLE facilities (
  id          integer PRIMARY KEY,
  name        varchar(120) NOT NULL,
  city        varchar(80)  NOT NULL,
  state       varchar(40)  NOT NULL,
  region      varchar(20)  NOT NULL,           -- Northeast / Midwest / South / West
  lat         numeric(9,6) NOT NULL,
  lon         numeric(9,6) NOT NULL
);

INSERT INTO facilities (id, name, city, state, region, lat, lon) VALUES
  (1,  'Beacon Hill Medical Center',   'Boston',        'Massachusetts', 'Northeast', 42.360081,  -71.058884),
  (2,  'Liberty General Hospital',     'Philadelphia',  'Pennsylvania',  'Northeast', 39.952583,  -75.165222),
  (3,  'Great Lakes Regional',         'Chicago',       'Illinois',      'Midwest',   41.878113,  -87.629799),
  (4,  'Riverside Health Institute',   'Minneapolis',   'Minnesota',     'Midwest',   44.977753,  -93.265015),
  (5,  'Magnolia Memorial Hospital',   'Atlanta',       'Georgia',       'South',     33.748997,  -84.387985),
  (6,  'Lone Star Medical Center',     'Houston',       'Texas',         'South',     29.760427,  -95.369804),
  (7,  'Bluegrass Community Hospital', 'Nashville',     'Tennessee',     'South',     36.162664,  -86.781602),
  (8,  'Pacific Crest Health',         'Seattle',       'Washington',    'West',      47.606209, -122.332069),
  (9,  'Desert Sun Medical Center',    'Phoenix',       'Arizona',       'West',      33.448376, -112.074036),
  (10, 'Golden Gate General',          'San Francisco', 'California',    'West',      37.774929, -122.419418);

-- ---------------------------------------------------------------------------
-- 2. PROVIDERS  (50 rows) — spread across facilities + specialties
-- ---------------------------------------------------------------------------
CREATE TABLE providers (
  id          integer PRIMARY KEY,
  name        varchar(120) NOT NULL,
  specialty   varchar(60)  NOT NULL,
  facility_id integer NOT NULL REFERENCES facilities(id)
);

-- Generate 50 providers. Name from a small pool + index; specialty + facility
-- deterministically distributed.
WITH specialties(s) AS (
  VALUES ('Cardiology'),('Oncology'),('Orthopedics'),('Neurology'),
         ('Pediatrics'),('Emergency Medicine'),('Internal Medicine'),
         ('Pulmonology'),('Nephrology'),('Endocrinology')
), firsts(f) AS (
  VALUES ('James'),('Mary'),('Robert'),('Patricia'),('John'),('Jennifer'),
         ('Michael'),('Linda'),('David'),('Elizabeth'),('Priya'),('Wei'),
         ('Ana'),('Omar'),('Sofia'),('Raj'),('Chen'),('Fatima'),('Diego'),('Yuki')
), lasts(l) AS (
  VALUES ('Smith'),('Johnson'),('Williams'),('Brown'),('Jones'),('Garcia'),
         ('Miller'),('Davis'),('Rodriguez'),('Martinez'),('Nguyen'),('Patel'),
         ('Kim'),('Chen'),('Okafor'),('Rossi'),('Haddad'),('Silva'),('Andersson'),('Sato')
)
INSERT INTO providers (id, name, specialty, facility_id)
SELECT
  g.i,
  'Dr. ' ||
    (SELECT f FROM firsts OFFSET (g.i * 7)  % 20 LIMIT 1) || ' ' ||
    (SELECT l FROM lasts  OFFSET (g.i * 3)  % 20 LIMIT 1),
  (SELECT s FROM specialties OFFSET (g.i % 10) LIMIT 1),
  ((g.i % 10) + 1)
FROM generate_series(1, 50) AS g(i);

-- ---------------------------------------------------------------------------
-- 3. PATIENTS  (500 rows) — synthetic MRN, demographics, registration date
-- ---------------------------------------------------------------------------
CREATE TABLE patients (
  id            integer PRIMARY KEY,
  mrn           varchar(16) NOT NULL UNIQUE,   -- synthetic medical record number
  birth_date    date        NOT NULL,
  sex           varchar(1)  NOT NULL,          -- M / F
  city          varchar(80) NOT NULL,
  state         varchar(40) NOT NULL,
  postal_code   varchar(10) NOT NULL,
  registered_on date        NOT NULL
);

-- Patient demographics reuse the facility city/state pool so geo joins line up.
WITH cities(city, state, zip) AS (
  VALUES ('Boston','Massachusetts','02108'),
         ('Philadelphia','Pennsylvania','19104'),
         ('Chicago','Illinois','60601'),
         ('Minneapolis','Minnesota','55401'),
         ('Atlanta','Georgia','30303'),
         ('Houston','Texas','77002'),
         ('Nashville','Tennessee','37203'),
         ('Seattle','Washington','98101'),
         ('Phoenix','Arizona','85004'),
         ('San Francisco','California','94103')
)
INSERT INTO patients (id, mrn, birth_date, sex, city, state, postal_code, registered_on)
SELECT
  g.i,
  'MRN' || lpad(g.i::text, 7, '0'),
  -- Ages roughly 1..95 years old.
  (DATE '2025-12-31' - ((floor(random() * 34675) + 400))::int),
  CASE WHEN random() < 0.5 THEN 'M' ELSE 'F' END,
  c.city, c.state, c.zip,
  -- Registered sometime in the 4 years before the encounter window closes.
  (DATE '2022-01-01' + (floor(random() * 1095))::int)
FROM generate_series(1, 500) AS g(i)
CROSS JOIN LATERAL (
  SELECT city, state, zip FROM cities OFFSET (g.i % 10) LIMIT 1
) AS c;

-- ---------------------------------------------------------------------------
-- 4. ENCOUNTERS  (~5,000 rows) over 2023-01-01 .. 2025-12-31
--    Rich measures: length_of_stay_days, total_charge, amount_paid.
--    encounter_type / department / provider / facility for categorical + geo.
-- ---------------------------------------------------------------------------
CREATE TABLE encounters (
  id                   integer PRIMARY KEY,
  patient_id           integer NOT NULL REFERENCES patients(id),
  provider_id          integer NOT NULL REFERENCES providers(id),
  facility_id          integer NOT NULL REFERENCES facilities(id),
  encounter_date       date    NOT NULL,
  encounter_type       varchar(20)  NOT NULL,  -- Inpatient/Outpatient/Emergency/Telehealth
  department           varchar(40)  NOT NULL,
  length_of_stay_days  integer      NOT NULL,  -- 1..30
  total_charge         numeric(12,2) NOT NULL, -- plausible $ ranges
  amount_paid          numeric(12,2) NOT NULL  -- <= total_charge (collection rate)
);

WITH etypes(t, dept, base_los, base_charge) AS (
  VALUES ('Inpatient',  'Surgery',            5, 18000),
         ('Inpatient',  'Cardiology',         4, 15000),
         ('Inpatient',  'Oncology',           7, 22000),
         ('Outpatient', 'Internal Medicine',  1,  1200),
         ('Outpatient', 'Orthopedics',        1,  2600),
         ('Emergency',  'Emergency',          2,  5400),
         ('Telehealth', 'Internal Medicine',  1,   320)
)
INSERT INTO encounters
  (id, patient_id, provider_id, facility_id, encounter_date, encounter_type,
   department, length_of_stay_days, total_charge, amount_paid)
SELECT
  g.i,
  ((floor(random() * 500))::int + 1),                       -- patient_id 1..500
  prov.id,
  prov.facility_id,                                         -- keep provider+facility consistent
  (DATE '2023-01-01' + (floor(random() * 1095))::int),      -- 3-year window
  e.t,
  e.dept,
  -- LOS: base +/- noise, clamped 1..30. Telehealth/Outpatient stay 1.
  GREATEST(1, LEAST(30,
    e.base_los + (CASE WHEN e.base_los = 1 THEN 0 ELSE (floor(random() * 12) - 3)::int END))),
  -- total_charge: base scaled 0.6..2.4  -> plausible spread, sums into millions.
  ROUND((e.base_charge * (0.6 + random() * 1.8))::numeric, 2) AS total_charge,
  0::numeric   -- amount_paid filled in the next UPDATE so it can reference total_charge
FROM generate_series(1, 5000) AS g(i)
CROSS JOIN LATERAL (
  SELECT id, facility_id FROM providers OFFSET (floor(random() * 50))::int LIMIT 1
) AS prov
CROSS JOIN LATERAL (
  SELECT t, dept, base_los, base_charge FROM etypes OFFSET (g.i % 7) LIMIT 1
) AS e;

-- amount_paid = collection rate 0.35..0.98 of total_charge → realistic ratios.
UPDATE encounters
SET amount_paid = ROUND((total_charge * (0.35 + random() * 0.63))::numeric, 2);

-- ---------------------------------------------------------------------------
-- 5. DIAGNOSES  (1..3 per encounter) — ICD-10-like codes, chronic flag
-- ---------------------------------------------------------------------------
CREATE TABLE diagnoses (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id integer NOT NULL REFERENCES encounters(id),
  icd10_code   varchar(10)  NOT NULL,
  description  varchar(120) NOT NULL,
  is_chronic   boolean      NOT NULL
);

WITH dx(code, descr, chronic) AS (
  VALUES ('I10',    'Essential (primary) hypertension',           true),
         ('E11.9',  'Type 2 diabetes mellitus without complications', true),
         ('J45.909','Unspecified asthma, uncomplicated',          true),
         ('I25.10', 'Atherosclerotic heart disease',              true),
         ('N18.3',  'Chronic kidney disease, stage 3',            true),
         ('J18.9',  'Pneumonia, unspecified organism',            false),
         ('S72.001A','Fracture of unspecified part of neck of femur', false),
         ('C50.911','Malignant neoplasm of breast',               true),
         ('K35.80', 'Acute appendicitis',                         false),
         ('R07.9',  'Chest pain, unspecified',                    false),
         ('A41.9',  'Sepsis, unspecified organism',               false),
         ('F32.9',  'Major depressive disorder, single episode',  true)
)
INSERT INTO diagnoses (encounter_id, icd10_code, description, is_chronic)
SELECT
  e.id,
  d.code, d.descr, d.chronic
FROM encounters e
-- 1..3 diagnosis rows per encounter
CROSS JOIN LATERAL generate_series(1, 1 + (floor(random() * 3))::int) AS n(k)
CROSS JOIN LATERAL (
  SELECT code, descr, chronic FROM dx OFFSET (floor(random() * 12))::int LIMIT 1
) AS d;

-- ---------------------------------------------------------------------------
-- 6. PROCEDURES  (0..2 per encounter) — CPT-like codes + cost
-- ---------------------------------------------------------------------------
CREATE TABLE procedures (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  encounter_id integer NOT NULL REFERENCES encounters(id),
  cpt_code     varchar(8)   NOT NULL,
  description  varchar(120) NOT NULL,
  cost         numeric(10,2) NOT NULL
);

WITH cpt(code, descr, base_cost) AS (
  VALUES ('99213', 'Office/outpatient visit, established',   150),
         ('99285', 'Emergency dept visit, high complexity',  900),
         ('93000', 'Electrocardiogram, complete',            120),
         ('71046', 'Chest X-ray, 2 views',                   240),
         ('80053', 'Comprehensive metabolic panel',           95),
         ('47562', 'Laparoscopic cholecystectomy',          6800),
         ('27130', 'Total hip arthroplasty',                21000),
         ('45378', 'Colonoscopy, diagnostic',               1400),
         ('36415', 'Routine venipuncture',                    25),
         ('70551', 'MRI brain without contrast',             1900)
)
INSERT INTO procedures (encounter_id, cpt_code, description, cost)
SELECT
  e.id,
  c.code, c.descr,
  ROUND((c.base_cost * (0.7 + random() * 1.6))::numeric, 2)
FROM encounters e
-- 0..2 procedures per encounter (some encounters get none)
CROSS JOIN LATERAL generate_series(1, (floor(random() * 3))::int) AS n(k)
CROSS JOIN LATERAL (
  SELECT code, descr, base_cost FROM cpt OFFSET (floor(random() * 10))::int LIMIT 1
) AS c;

-- ---------------------------------------------------------------------------
-- Helpful indexes (mirror what an analyst would add; keeps preview fast)
-- ---------------------------------------------------------------------------
CREATE INDEX idx_enc_date     ON encounters (encounter_date);
CREATE INDEX idx_enc_provider ON encounters (provider_id);
CREATE INDEX idx_enc_facility ON encounters (facility_id);
CREATE INDEX idx_enc_patient  ON encounters (patient_id);
CREATE INDEX idx_dx_enc       ON diagnoses  (encounter_id);
CREATE INDEX idx_proc_enc     ON procedures (encounter_id);

-- ---------------------------------------------------------------------------
-- Sanity summary (printed by psql; the executor should eyeball these).
-- Expect: facilities 10, providers 50, patients 500, encounters 5000,
--   diagnoses ~10k (1..3/enc), procedures ~5k (0..2/enc),
--   total_charge SUM in the multi-million range (big-number KPI fuel).
-- ---------------------------------------------------------------------------
SELECT 'facilities' AS tbl, count(*) AS rows FROM facilities
UNION ALL SELECT 'providers',  count(*) FROM providers
UNION ALL SELECT 'patients',   count(*) FROM patients
UNION ALL SELECT 'encounters', count(*) FROM encounters
UNION ALL SELECT 'diagnoses',  count(*) FROM diagnoses
UNION ALL SELECT 'procedures', count(*) FROM procedures;

SELECT
  to_char(sum(total_charge), 'FM$999,999,999.00') AS total_billed,
  to_char(sum(amount_paid),  'FM$999,999,999.00') AS total_collected,
  round(100.0 * sum(amount_paid) / nullif(sum(total_charge),0), 1) AS collection_rate_pct,
  min(encounter_date) AS first_encounter,
  max(encounter_date) AS last_encounter
FROM encounters;

-- =============================================================================
-- The generic reference view the DATASET will be built on (join of all six
-- tables). Creating it here is OPTIONAL — the plan's dataset step pastes the
-- equivalent SELECT into the Monaco editor instead. Provided for convenience
-- / manual verification. Comment out if you want the dataset SQL to be the
-- single source of the join.
-- =============================================================================
CREATE OR REPLACE VIEW clinical.encounter_analytics AS
SELECT
  e.id                     AS encounter_id,
  e.encounter_date,
  e.encounter_type,
  e.department,
  e.length_of_stay_days,
  e.total_charge,
  e.amount_paid,
  p.id                     AS patient_id,
  p.mrn,
  p.birth_date,
  p.sex,
  p.city                   AS patient_city,
  p.state                  AS patient_state,
  pr.id                    AS provider_id,
  pr.name                  AS provider_name,
  pr.specialty,
  f.id                     AS facility_id,
  f.name                   AS facility_name,
  f.city                   AS facility_city,
  f.state                  AS facility_state,
  f.region,
  f.lat                    AS facility_lat,
  f.lon                    AS facility_lon,
  dx.icd10_code            AS primary_icd10,
  dx.description           AS primary_diagnosis,
  dx.is_chronic
FROM clinical.encounters e
JOIN clinical.patients   p  ON p.id  = e.patient_id
JOIN clinical.providers  pr ON pr.id = e.provider_id
JOIN clinical.facilities f  ON f.id  = e.facility_id
-- one representative (lowest-id) diagnosis per encounter for a flat row
LEFT JOIN LATERAL (
  SELECT icd10_code, description, is_chronic
  FROM clinical.diagnoses d
  WHERE d.encounter_id = e.id
  ORDER BY d.id
  LIMIT 1
) dx ON true;

