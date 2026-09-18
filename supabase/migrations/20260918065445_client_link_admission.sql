-- Use the established genuine-session admission contract, with its policy and MFA checks.
do $$declare f regprocedure;d text;begin
 foreach f in array array['public.create_schedule_client_link(uuid,uuid,text,bigint)'::regprocedure,'public.list_schedule_client_links(uuid,uuid)'::regprocedure,'public.revoke_schedule_client_link(uuid,uuid,text)'::regprocedure]loop
  d:=pg_get_functiondef(f);d:=replace(d,'private.require_request_session()','public.require_active_schedule_session()');execute d;
 end loop;
end;$$;
notify pgrst,'reload schema';
