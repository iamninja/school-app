-- Which Greek school grade a class targets. Nullable - existing classes
-- have no value and nothing forces one to be set going forward, matching
-- how students.grade_level already works (free-text there since a student's
-- grade isn't constrained to a fixed list; a class's target grade is,
-- hence the CHECK here instead).
alter table public.classes
  add column grade text
  check (grade is null or grade in (
    'gym_a', 'gym_b', 'gym_c',       -- Α/Β/Γ Γυμνασίου
    'lyk_a', 'lyk_b', 'lyk_c',       -- Α/Β/Γ Λυκείου
    'epal_a', 'epal_b', 'epal_c',    -- Α/Β/Γ ΕΠΑ.Λ.
    'lyk_grad',                      -- Τελειόφοιτοι Λυκείου (ΓΕΛ)
    'epal_grad'                      -- Τελειόφοιτοι ΕΠΑ.Λ.
  ));
