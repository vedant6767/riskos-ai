-- ============================================================
-- RiskOS AI — Auth Fix + Demo Seed
-- Run this in Supabase SQL Editor AFTER running 001_initial_schema.sql
-- ============================================================

-- Step 1: Disable email confirmation so signup works immediately
-- (Go to Supabase → Authentication → Providers → Email → disable "Confirm email")
-- OR run this to allow immediate login after signup:

-- Check that the users trigger exists
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  )
  ON CONFLICT (id) DO UPDATE
    SET email     = EXCLUDED.email,
        full_name = EXCLUDED.full_name,
        updated_at = now();
  RETURN NEW;
END;
$$;

-- Ensure the trigger is attached
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- DEMO SEED: 20 realistic transactions
-- Run ONLY after you have registered and confirmed your org_id
-- Replace 'YOUR-ORG-ID-HERE' with your actual org id from:
--   SELECT id FROM organizations LIMIT 1;
-- ============================================================

-- First find your org id:
-- SELECT id, name FROM public.organizations;

-- Then replace the placeholder below and run the INSERT blocks

DO $$
DECLARE
  v_org_id    uuid;
  v_cust_id   uuid;
  v_device_id uuid;
  v_tx_id     uuid;
  v_score_id  uuid;
  i           int;
BEGIN
  -- Get the first org (your demo org)
  SELECT id INTO v_org_id FROM public.organizations LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'No organization found. Register first, then re-run this script.';
    RETURN;
  END IF;

  -- Create a demo customer
  INSERT INTO public.customers (
    org_id, external_id, account_age_days, total_transactions,
    total_amount, avg_transaction_amount, risk_tier
  ) VALUES (
    v_org_id, 'CUST-DEMO-001', 180, 45, 225000, 5000, 'medium'
  )
  ON CONFLICT (org_id, external_id) DO UPDATE SET updated_at = now()
  RETURNING id INTO v_cust_id;

  -- Create a demo device
  INSERT INTO public.devices (
    org_id, device_fingerprint, device_type, os, is_known_fraudulent
  ) VALUES (
    v_org_id, 'FP-DEMO-ANDROID-001', 'mobile', 'Android', false
  )
  ON CONFLICT (org_id, device_fingerprint) DO UPDATE SET last_seen_at = now()
  RETURNING id INTO v_device_id;

  -- Insert 20 demo transactions with varying risk
  FOR i IN 1..20 LOOP
    INSERT INTO public.transactions (
      org_id, external_tx_id, customer_id, device_id,
      amount, currency, payment_method, payment_status,
      hour_of_day, day_of_week, is_international, ip_country,
      is_fraud, dataset_split,
      created_at, processed_at
    ) VALUES (
      v_org_id,
      'TX-DEMO-' || LPAD(i::text, 4, '0'),
      v_cust_id,
      v_device_id,
      CASE
        WHEN i <= 5  THEN (500  + (i * 300))::numeric
        WHEN i <= 10 THEN (8000 + (i * 1200))::numeric
        WHEN i <= 15 THEN (45000 + (i * 3000))::numeric
        ELSE              (120000 + (i * 5000))::numeric
      END,
      'INR',
      CASE (i % 4)
        WHEN 0 THEN 'card'
        WHEN 1 THEN 'upi'
        WHEN 2 THEN 'netbanking'
        ELSE        'wallet'
      END,
      CASE WHEN i % 7 = 0 THEN 'failed' ELSE 'success' END,
      CASE WHEN i > 15 THEN (1 + (i % 4)) ELSE (9 + (i % 8)) END,
      (i % 7),
      (i > 16),
      CASE WHEN i > 16 THEN 'US' ELSE 'IN' END,
      (i > 14),
      CASE WHEN i <= 14 THEN 'dev' ELSE 'test' END,
      now() - ((20 - i) * interval '1 hour'),
      now() - ((20 - i) * interval '1 hour') + interval '1 second'
    )
    ON CONFLICT (org_id, external_tx_id) DO NOTHING
    RETURNING id INTO v_tx_id;

    IF v_tx_id IS NULL THEN CONTINUE; END IF;

    -- Insert risk score for each transaction
    INSERT INTO public.risk_scores (
      transaction_id, org_id, score, level, model_version, calculated_at
    ) VALUES (
      v_tx_id,
      v_org_id,
      CASE
        WHEN i <= 5  THEN (10 + i * 2)
        WHEN i <= 10 THEN (35 + i * 2)
        WHEN i <= 15 THEN (62 + i)
        ELSE              (82 + i % 10)
      END,
      CASE
        WHEN i <= 5  THEN 'LOW'
        WHEN i <= 10 THEN 'MEDIUM'
        WHEN i <= 15 THEN 'HIGH'
        ELSE              'CRITICAL'
      END,
      'v1.0',
      now()
    )
    ON CONFLICT (transaction_id) DO NOTHING
    RETURNING id INTO v_score_id;

    IF v_score_id IS NULL THEN CONTINUE; END IF;

    -- Insert signals
    INSERT INTO public.risk_signals (transaction_id, org_id, signal_type, signal_value, contribution, description)
    VALUES
      (v_tx_id, v_org_id, 'amount_deviation',     i::numeric * 0.8, LEAST(25, i), 'Amount deviation from baseline'),
      (v_tx_id, v_org_id, 'velocity_anomaly',      i::numeric * 0.5, LEAST(20, i/2), 'Transaction frequency anomaly'),
      (v_tx_id, v_org_id, 'device_change',          0,                0, 'Known device'),
      (v_tx_id, v_org_id, 'time_anomaly',           (i%24)::numeric,  CASE WHEN i > 15 THEN 12 ELSE 0 END, 'Time of day check'),
      (v_tx_id, v_org_id, 'behavioral_deviation',   i::numeric * 0.3, LEAST(10, i/3), 'Behavioral pattern check')
    ON CONFLICT DO NOTHING;

    -- Create risk cases for HIGH and CRITICAL
    IF i > 10 THEN
      INSERT INTO public.risk_cases (
        org_id, transaction_id, risk_score_id, case_number, status, priority, created_at
      ) VALUES (
        v_org_id,
        v_tx_id,
        v_score_id,
        'CASE-2026-' || LPAD(i::text, 4, '0'),
        'open',
        CASE WHEN i > 15 THEN 'CRITICAL' ELSE 'HIGH' END,
        now() - ((20 - i) * interval '1 hour')
      )
      ON CONFLICT (org_id, case_number) DO NOTHING;
    END IF;

  END LOOP;

  -- Create default policy if none exists
  INSERT INTO public.risk_policies (
    org_id, name, is_active,
    low_max, medium_max, high_max,
    low_action, medium_action, high_action, critical_action,
    min_ai_confidence, human_approval_threshold
  ) VALUES (
    v_org_id, 'Default Policy', true,
    30, 60, 80,
    'allow', 'verify', 'review', 'escalate',
    70, 75
  )
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Seeded 20 demo transactions for org: %', v_org_id;
END $$;
