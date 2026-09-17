-- Temporary receiving-preview authority must not bypass inherited template constraints.
create or replace function private.receiver_can_review(t private.schedule_transfers,actor uuid)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare s public.schedules;
begin
 if t.status<>'pending' or t.expires_at<=clock_timestamp() then return false; end if;
 select * into s from public.schedules where id=t.schedule_id;
 return found and s.deleted_at is null and s.production_id=t.source_id
 and private.schedule_actor_can(t.requester,'transfer',t.organization_id,t.source_id,t.schedule_id)
 and private.schedule_actor_can(actor,'organize',t.organization_id,t.destination_id,null)
 and private.schedule_actor_can(actor,'transfer',t.organization_id,t.destination_id,null)
 and private.schedule_actor_can(actor,'create',t.organization_id,t.destination_id,null)
 and private.schedule_template_bindings_allow(actor,'read',t.organization_id,t.schedule_id)
 and private.schedule_template_bindings_allow(actor,'transfer',t.organization_id,t.schedule_id)
 and not private.schedule_context_denied(actor,'read',t.organization_id,t.source_id,t.schedule_id,'organizer')
 and not private.schedule_context_denied(actor,'transfer',t.organization_id,t.source_id,t.schedule_id,'organizer');
end; $$;
