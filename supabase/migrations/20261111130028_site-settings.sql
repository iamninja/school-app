-- The public front page's seasonal look (lib/site-season.ts), set from the
-- console's App tab. One row, like notification_settings.
--
-- christmas_mode: 'auto' follows the dates below every year (Athens time);
-- 'on' shows everything now (to preview it, or keep it a few days longer);
-- 'off' never. The decorations (falling snow and figures, the Santa hat)
-- and the message each start on their own day and both end on
-- christmas_until - days of the year as 'MM-DD', so a window may run over
-- New Year. The three switches pick the parts; christmas_message empty
-- means the built-in default.
--
-- Readable by everyone, signed in or not: the front page shows it to
-- visitors, and nothing here is private. Only the teacher can change it.

create table public.site_settings (
  id integer primary key default 1,

  christmas_mode text not null default 'auto'
    check (christmas_mode in ('auto', 'on', 'off')),
  christmas_snow boolean not null default true,
  christmas_hat boolean not null default true,
  christmas_banner boolean not null default true,
  -- The snow and Santa hat also in the student and parent apps (no message there).
  christmas_portals boolean not null default true,
  christmas_message text check (length(christmas_message) <= 160),
  christmas_decorations_from text not null default '11-11'
    check (christmas_decorations_from ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  christmas_message_from text not null default '12-24'
    check (christmas_message_from ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  christmas_until text not null default '01-07'
    check (christmas_until ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),

  updated_at timestamptz not null default now(),

  constraint site_settings_singleton check (id = 1)
);

alter table public.site_settings enable row level security;

create policy "Anyone can read the site settings" on public.site_settings
  for select
  to anon, authenticated
  using (true);

create policy "Teachers manage the site settings" on public.site_settings
  using (public.is_teacher())
  with check (public.is_teacher());

insert into public.site_settings (id) values (1)
on conflict (id) do nothing;
