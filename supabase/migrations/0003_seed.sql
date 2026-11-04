-- Sample data for the demo: one hospital system, six boards, six roles,
-- 18 months of hiring history, two live jobs and one A/B test.
revoke execute on function public.demo_employer_id() from anon, authenticated;

insert into public.employers (name) values ('Riverside Health System');

insert into public.job_boards (id, name, cpc, apply_rate, qual_rate, hire_rate, retention_365, default_share, color, sort) values
  ('indeed',   'Indeed',            0.95, 0.025, 0.32, 0.07,  0.76, 0.24, '#2a78d6', 1),
  ('linkedin', 'LinkedIn',          2.30, 0.028, 0.50, 0.08,  0.83, 0.16, '#eb6834', 2),
  ('vivian',   'Vivian Health',     1.70, 0.040, 0.58, 0.10,  0.85, 0.14, '#1baf7a', 3),
  ('incred',   'Incredible Health', 2.90, 0.055, 0.70, 0.11,  0.88, 0.12, '#eda100', 4),
  ('nursecom', 'Nurse.com',         1.40, 0.032, 0.45, 0.08,  0.80, 0.12, '#e87ba4', 5),
  ('zip',      'ZipRecruiter',      0.60, 0.020, 0.15, 0.045, 0.68, 0.22, '#008300', 6);

insert into public.roles (id, name, hire_factor, spend_share, sort) values
  ('icu',  'ICU RN',              0.90, 0.26, 1),
  ('ed',   'ED RN',               0.95, 0.20, 2),
  ('ms',   'Med/Surg RN',         1.20, 0.24, 3),
  ('np',   'Nurse Practitioner',  0.85, 0.12, 4),
  ('pa',   'Physician Assistant', 0.80, 0.08, 5),
  ('crna', 'CRNA',                0.55, 0.10, 6);

-- 18 months of history (May 2025 – Oct 2026). Cohorts hired May–Oct 2025
-- are a year old, so their 365-day retention is known.
do $$
declare
  e uuid := (select id from public.employers limit 1);
  m date; season numeric; b record; r record;
  v_spend numeric; v_clicks numeric; v_app numeric; v_qual numeric; v_hires numeric;
begin
  perform setseed(0.42);
  for m in select generate_series(date '2025-05-01', date '2026-10-01', interval '1 month')::date loop
    season := 0.88 + random()::numeric * 0.26;
    for b in select * from public.job_boards loop
      for r in select * from public.roles loop
        v_spend  := 60000 * b.default_share * r.spend_share * season * (0.85 + random()::numeric * 0.3);
        v_clicks := v_spend / (b.cpc * (0.9 + random()::numeric * 0.2));
        v_app    := v_clicks * b.apply_rate * (0.85 + random()::numeric * 0.3);
        v_qual   := v_app * b.qual_rate * (0.85 + random()::numeric * 0.3);
        v_hires  := v_qual * b.hire_rate * r.hire_factor * (0.8 + random()::numeric * 0.4);
        insert into public.hiring_monthly values (
          e, m, b.id, r.id, round(v_spend, 2), round(v_clicks, 2), round(v_app, 3), round(v_qual, 3),
          round(v_qual * 0.42 * (0.9 + random()::numeric * 0.2), 3), round(v_hires, 3),
          round(v_hires * least(0.97, b.retention_365 + 0.1), 3),
          case when m <= date '2025-10-01' then round(v_hires * least(0.95, b.retention_365 * (0.94 + random()::numeric * 0.1)), 3) end
        );
      end loop;
    end loop;
  end loop;
end $$;

insert into public.ab_tests (employer_id, name, variant, headline, body, views, applies, qualified)
select id, 'ICU RN post wording', v, h, bd, vw, ap, q from public.employers,
(values
  ('A', 'Registered Nurse – ICU', 'Full-time position in our Intensive Care Unit. BSN preferred. Competitive pay and benefits.', 4200, 118, 41),
  ('B', 'ICU RN · Nights · $15K sign-on bonus', '3x12 shifts, self-scheduling, 1:2 patient ratios. Pay range $46–$58/hr shown up front.', 4100, 171, 77)
) as t(v, h, bd, vw, ap, q);

-- two live sample jobs, run forward so they open with real results
do $$
declare v uuid;
begin
  v := public.post_job('ICU RN · Nights · $15K sign-on', 'icu', 'Indianapolis, IN', 9000,
                       array['indeed','linkedin','vivian','incred','nursecom','zip']);
  update public.jobs set is_sample = true, created_at = now() - interval '21 days' where id = v;
  perform public.advance_job(v, 14); perform public.advance_job(v, 7);

  v := public.post_job('CRNA · Main OR · Full-time', 'crna', 'Carmel, IN', 7000,
                       array['indeed','linkedin','vivian','incred','nursecom','zip']);
  update public.jobs set is_sample = true, created_at = now() - interval '14 days' where id = v;
  perform public.advance_job(v, 14);
end $$;
