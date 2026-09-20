create table public.projects (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120),
 purpose text not null default 'sale' check(purpose in ('sale','rental','event','personal','office')),
 budget_minor bigint check(budget_minor between 0 and 1000000000), currency text not null default 'USD' check(currency ~ '^[A-Z]{3}$'),
 created_at timestamptz not null default now(), unique(id,owner_id)
);
create index projects_owner_created on public.projects(owner_id,created_at desc);
create table public.spaces (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, owner_id uuid not null default auth.uid(),
 name text not null check(length(trim(name)) between 1 and 120),
 kind text not null default 'living_room' check(kind in ('living_room','bedroom','kitchen','bathroom','office','gym','backyard','other')),
 environment text not null default 'interior' check(environment in ('interior','exterior')),
 created_at timestamptz not null default now(), unique(id,owner_id),
 foreign key(project_id,owner_id) references public.projects(id,owner_id) on delete cascade
);
create index spaces_owner_project on public.spaces(owner_id,project_id);
create index spaces_project_owner on public.spaces(project_id,owner_id);
create table public.captures (
 id uuid primary key, space_id uuid not null, owner_id uuid not null,
 platform text not null check(platform in ('ios','android')),
 route text not null check((platform='ios' and route in ('roomplan','arkit_guided','reference_measurement')) or (platform='android' and route in ('arcore_guided','arcore_depth','reference_measurement'))),
 boundary_mm jsonb not null check(jsonb_typeof(boundary_mm)='array' and jsonb_array_length(boundary_mm) between 3 and 128),
 floor_area_m2 double precision not null check(floor_area_m2 between 0.25 and 10000),
 ceiling_height_mm double precision check(ceiling_height_mm between 500 and 30000),
 verification text not null default 'unverified' check(verification='unverified'),
 uncertainty_mm double precision check(uncertainty_mm is null), obstacles_mm jsonb check(obstacles_mm is null),
 delivery_access text not null default 'not_assessed' check(delivery_access='not_assessed'),
 schema_version integer not null default 1 check(schema_version=1), created_at timestamptz not null default now(),
 foreign key(space_id,owner_id) references public.spaces(id,owner_id) on delete cascade
);
create index captures_owner_space on public.captures(owner_id,space_id,created_at desc);
create index captures_space_owner on public.captures(space_id,owner_id);
create table public.media (
 id uuid primary key, space_id uuid not null, owner_id uuid not null default auth.uid(),
 object_path text not null unique,
 mime_type text not null check(mime_type in ('image/jpeg','image/png','video/mp4','video/quicktime','application/json')),
 byte_size bigint not null check(byte_size between 1 and 10485760),
 status text not null default 'reserved' check(status in ('reserved','ready')),
 created_at timestamptz not null default now(),
 foreign key(space_id,owner_id) references public.spaces(id,owner_id) on delete cascade,
 check(object_path=owner_id::text||'/'||space_id::text||'/'||id::text)
);
create index media_owner_space on public.media(owner_id,space_id,created_at desc);
create index media_space_owner on public.media(space_id,owner_id);
create table public.design_briefs (
 id uuid primary key default gen_random_uuid(), space_id uuid not null, owner_id uuid not null default auth.uid(),
 style text not null check(style in ('modern','contemporary','scandinavian','japandi','traditional','coastal','mid_century','industrial','bohemian','custom')),
 instructions text not null default '' check(length(instructions)<=4000),
 created_at timestamptz not null default now(),
 foreign key(space_id,owner_id) references public.spaces(id,owner_id) on delete cascade
);
create index design_briefs_owner_space on public.design_briefs(owner_id,space_id,created_at desc);
create index design_briefs_space_owner on public.design_briefs(space_id,owner_id);

-- Finite beta limits serialize writes per owner, preventing concurrent quota bypass.
create function public.enforce_beta_limit() returns trigger language plpgsql security invoker set search_path='' as $$
declare current_count bigint; allowed_count integer;
begin
 perform pg_advisory_xact_lock(hashtextextended(new.owner_id::text, 0));
 allowed_count := case TG_TABLE_NAME when 'projects' then 10 when 'spaces' then 40 when 'media' then 50 when 'captures' then 100 else 100 end;
 execute format('select count(*) from public.%I where owner_id=$1', TG_TABLE_NAME) into current_count using new.owner_id;
 if current_count>=allowed_count then raise exception 'Beta storage limit reached' using errcode='23514'; end if;
 return new;
end; $$;
revoke all on function public.enforce_beta_limit() from public,anon,authenticated;

alter table public.projects enable row level security;
alter table public.spaces enable row level security;
alter table public.captures enable row level security;
alter table public.media enable row level security;
alter table public.design_briefs enable row level security;
revoke all on public.projects,public.spaces,public.captures,public.media,public.design_briefs from anon,authenticated;
grant select,insert on public.projects,public.spaces,public.media,public.design_briefs to authenticated;
grant select on public.captures to authenticated;
grant update(name,purpose,budget_minor,currency) on public.projects to authenticated;
grant update(name,kind,environment) on public.spaces to authenticated;
grant update(status) on public.media to authenticated;
grant all on public.projects,public.spaces,public.captures,public.media,public.design_briefs to service_role;

create policy project_read on public.projects for select to authenticated using(owner_id=(select auth.uid()));
create policy project_create on public.projects for insert to authenticated with check(owner_id=(select auth.uid()));
create policy project_edit on public.projects for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy space_read on public.spaces for select to authenticated using(owner_id=(select auth.uid()));
create policy space_create on public.spaces for insert to authenticated with check(owner_id=(select auth.uid()));
create policy space_edit on public.spaces for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy capture_read on public.captures for select to authenticated using(owner_id=(select auth.uid()));
create policy media_read on public.media for select to authenticated using(owner_id=(select auth.uid()));
create policy media_create on public.media for insert to authenticated with check(owner_id=(select auth.uid()) and status='reserved');
create policy brief_read on public.design_briefs for select to authenticated using(owner_id=(select auth.uid()));
create policy brief_create on public.design_briefs for insert to authenticated with check(owner_id=(select auth.uid()));

create trigger projects_beta_limit before insert on public.projects for each row execute function public.enforce_beta_limit();
create trigger spaces_beta_limit before insert on public.spaces for each row execute function public.enforce_beta_limit();
create trigger captures_beta_limit before insert on public.captures for each row execute function public.enforce_beta_limit();
create trigger media_beta_limit before insert on public.media for each row execute function public.enforce_beta_limit();
create trigger briefs_beta_limit before insert on public.design_briefs for each row execute function public.enforce_beta_limit();

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('space-media','space-media',false,10485760,array['image/jpeg','image/png','video/mp4','video/quicktime','application/json']);
create policy space_media_read on storage.objects for select to authenticated using(
 bucket_id='space-media' and split_part(name,'/',1)=(select auth.uid())::text
);
create policy space_media_upload on storage.objects for insert to authenticated with check(
 bucket_id='space-media' and exists(select 1 from public.media m where m.object_path=name and m.owner_id=(select auth.uid()) and m.status='reserved'
 and (metadata->>'size')::bigint=m.byte_size and metadata->>'mimetype'=m.mime_type)
);
create policy media_complete on public.media for update to authenticated using(owner_id=(select auth.uid())) with check(
 owner_id=(select auth.uid()) and status='ready' and exists(select 1 from storage.objects o where o.bucket_id='space-media' and o.name=object_path)
);
