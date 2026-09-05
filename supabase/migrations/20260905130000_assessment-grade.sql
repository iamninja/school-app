-- Which Greek school grade an assessment targets - a tag for filtering,
-- and (app-layer only) for suggesting which classes/students to assign it
-- to. Same nullable-with-CHECK convention and code list as classes.grade
-- (20260821211516) - deliberately not a foreign key to it, since an
-- assessment's grade is just a label, not a relationship to any specific
-- class.
alter table public.assessments
  add column grade text
  check (grade is null or grade in (
    'gym_a', 'gym_b', 'gym_c',       -- Α/Β/Γ Γυμνασίου
    'lyk_a', 'lyk_b', 'lyk_c',       -- Α/Β/Γ Λυκείου
    'epal_a', 'epal_b', 'epal_c',    -- Α/Β/Γ ΕΠΑ.Λ.
    'lyk_grad',                      -- Τελειόφοιτοι Λυκείου (ΓΕΛ)
    'epal_grad'                      -- Τελειόφοιτοι ΕΠΑ.Λ.
  ));

create index assessments_teacher_grade_idx
  on public.assessments (teacher_id, grade)
  where grade is not null;
