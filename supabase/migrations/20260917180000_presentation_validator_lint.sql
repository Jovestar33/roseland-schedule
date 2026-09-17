-- Make validator volatility and empty-array typing explicit.
create or replace function private.validate_organization_presentation(cfg jsonb)
returns void language plpgsql stable set search_path='' as $$
declare item record; entry jsonb; names text[]:=array[]::text[];
 colors text[]:=array['--pink','--pink-dark','--pink-light','--black','--row-even','--row-hover','--g100'];
 styles text[]:=array['aShoot','aLunch','aDinner','aWrap','aDayOff','aDrive','aMove','aCrewCall','aBreakfast','aBreak','aSetup','aOther'];
 labels text[]:=array['appTitle','hdrTitle','colAction','colLocation','colDesc','colNotes','colTimeIn','colDuration','colTimeOut','colDone','metaTown','metaDate','metaCall','metaProd','metaDir','metaDp','btnAddRow'];
begin
 if cfg is null or jsonb_typeof(cfg)<>'object' or octet_length(cfg::text)>3000000 or (cfg-array['actions','actionStyles','colors','labels','logo'])<>'{}' then raise sqlstate 'PT400' using message='Invalid organization configuration'; end if;
 for item in select * from jsonb_each(cfg) loop
  if item.key='actions' then
   if jsonb_typeof(item.value)<>'array' or jsonb_array_length(item.value)>100 then raise sqlstate 'PT400' using message='Invalid actions'; end if;
   for entry in select value from jsonb_array_elements(item.value) loop
    if jsonb_typeof(entry)<>'object' or (entry-array['name','color'])<>'{}' or jsonb_typeof(entry->'name') is distinct from 'string' or length(btrim(entry->>'name')) not between 1 and 100 or entry->>'name' ~ '[[:cntrl:]]' or lower(btrim(entry->>'name')) in ('other','sunrise','sunset') or lower(btrim(entry->>'name'))=any(names) or jsonb_typeof(entry->'color') is distinct from 'string' or not (entry->>'color'='' or entry->>'color'=any(styles)) then raise sqlstate 'PT400' using message='Invalid action name or style'; end if;
    names:=array_append(names,lower(btrim(entry->>'name')));
   end loop;
  elsif item.key in ('colors','actionStyles','labels') then
   if jsonb_typeof(item.value)<>'object' then raise sqlstate 'PT400' using message='Invalid presentation map'; end if;
   for entry in select jsonb_build_object('key',key,'value',value) from jsonb_each(item.value) loop
    if item.key='colors' then
     if not (entry->>'key'=any(colors)) or jsonb_typeof(entry->'value')<>'string' or entry->>'value' !~ '^#[0-9a-fA-F]{6}$' then raise sqlstate 'PT400' using message='Invalid palette color'; end if;
    elsif item.key='labels' then
     if not (entry->>'key'=any(labels)) or jsonb_typeof(entry->'value')<>'string' or length(entry->>'value')>160 or entry->>'value' ~ '[[:cntrl:]]' then raise sqlstate 'PT400' using message='Invalid label'; end if;
    else
     if not (entry->>'key'=any(styles)) or jsonb_typeof(entry->'value')<>'object' or ((entry->'value')-array['bg','text'])<>'{}' or jsonb_typeof(entry->'value'->'bg') is distinct from 'string' or jsonb_typeof(entry->'value'->'text') is distinct from 'string' or entry->'value'->>'bg' !~ '^#[0-9a-fA-F]{6}$' or entry->'value'->>'text' !~ '^#[0-9a-fA-F]{6}$' then raise sqlstate 'PT400' using message='Invalid action colors'; end if;
    end if;
   end loop;
  elsif item.key='logo' and item.value<>'null'::jsonb then
   if jsonb_typeof(item.value)<>'string' or length(cfg->>'logo')>2800000 or cfg->>'logo' !~ '^data:image/(png|jpeg|webp|svg\+xml);base64,[A-Za-z0-9+/]+={0,2}$' then raise sqlstate 'PT400' using message='Use an embedded PNG, JPEG, WebP or SVG logo'; end if;
  end if;
 end loop;
end; $$;

