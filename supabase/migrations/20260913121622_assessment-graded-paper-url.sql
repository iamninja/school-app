-- Optional link to the graded paper the teacher attaches when marking an
-- assessment (typically a Google Drive share link). NULL means "no link
-- was attached" - the student/parent "view graded paper" button only
-- renders when this is set, mirroring teacher_comment's optionality.
alter table public.assessment_assignments
  add column graded_paper_url text
    check (graded_paper_url is null or graded_paper_url ~ '^https?://');
