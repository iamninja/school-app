-- The public front page's seasonal look (lib/site-season.ts), set from the
-- console's App tab. One row, like notification_settings.
--
-- christmas_mode: 'auto' shows the Christmas look from 1 December to
-- 7 January (Athens time) every year; 'on' shows it now (to preview it, or
-- to keep it a few days longer); 'off' never. The three switches pick its
-- parts: falling snow and figures, a Santa hat on the logo, and a short
-- message (christmas_message; empty means the built-in default).
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
  christmas_message text check (length(christmas_message) <= 160),

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
