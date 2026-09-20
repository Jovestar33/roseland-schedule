begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email) values
 ('fa000000-0000-4000-8000-000000000001','hub-owner@example.test'),
 ('fa000000-0000-4000-8000-000000000002','hub-editor@example.test');
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values
 ('fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001',now(),now(),'aal2'),
 ('fa100000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-000000000002',now(),now(),'aal2');
insert into public.organizations(id,name,slug) values
 ('fa200000-0000-4000-8000-000000000001','Hub order test','hub-order-test'),
 ('fa200000-0000-4000-8000-000000000002','Other hub tenant','hub-order-other');
insert into public.organization_memberships(organization_id,user_id,role,status,joined_at) values
 ('fa200000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001','owner','active',now()),
 ('fa200000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000002','member','active',now());
insert into public.productions(id,organization_id,name,slug) values
 ('fa300000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','Zulu hub','zulu-hub'),
 ('fa300000-0000-4000-8000-000000000002','fa200000-0000-4000-8000-000000000001','Alpha hub','alpha-hub'),
 ('fa300000-0000-4000-8000-000000000003','fa200000-0000-4000-8000-000000000001','Middle hub','middle-hub'),
 ('fa300000-0000-4000-8000-000000000004','fa200000-0000-4000-8000-000000000002','Foreign hub','foreign-hub');
insert into public.production_memberships(organization_id,production_id,user_id,role,status,joined_at) select organization_id,id,'fa000000-0000-4000-8000-000000000002','editor','active',now() from public.productions where organization_id='fa200000-0000-4000-8000-000000000001';

select ok(not has_function_privilege('anon','public.order_schedule_phase_group(uuid,uuid,uuid[],bigint[])','EXECUTE'),'Anonymous phase order denied');
select ok(not has_function_privilege('service_role','public.save_library_phase(uuid,uuid,text,bigint)','EXECUTE'),'Service phase writes denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa100000-0000-4000-8000-000000000001","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','Mountain hub',null)$$,'Owner creates named phase');
select lives_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000002','Coastal hub',null)$$,'Owner creates another phase');
select throws_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','Mountain hub',null)$$,'PT409',null,'Ambiguous create retry cannot duplicate phase');
reset role;
insert into public.production_days(id,organization_id,production_id,phase_id,position,created_by,updated_by) values
('fa500000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',0,'fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001');
set local role authenticated;
select public.create_schedule_in_production('fa600000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',null,'fa400000-0000-4000-8000-000000000001','Schedule 1','schedule-1','{"meta":{},"rows":[]}',1);
select public.create_schedule_in_production('fa600000-0000-4000-8000-000000000002','fa300000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001',null,'Schedule 2','schedule-2','{"meta":{},"rows":[]}',1);
select public.create_schedule_in_production('fa600000-0000-4000-8000-000000000003','fa300000-0000-4000-8000-000000000001',null,null,'Schedule 3','schedule-3','{"meta":{},"rows":[]}',1);
select public.create_schedule_in_production('fa600000-0000-4000-8000-000000000004','fa300000-0000-4000-8000-000000000001',null,'fa400000-0000-4000-8000-000000000002','Schedule 4','schedule-4','{"meta":{},"rows":[]}',1);

select throws_ok($$select public.order_schedule_phase_group('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',array['fa600000-0000-4000-8000-000000000001'::uuid],array[1::bigint])$$,'PT409',null,'Partial phase rejects missing day-assigned sibling');
select lives_ok($$select public.order_schedule_phase_group('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',array['fa600000-0000-4000-8000-000000000002'::uuid,'fa600000-0000-4000-8000-000000000001'::uuid],array[1::bigint,1::bigint])$$,'Mixed day and dayless phase orders atomically');
select is((select library_position from public.schedules where id='fa600000-0000-4000-8000-000000000002'),1::bigint,'Day-assigned row moved first');
select is((select library_position from public.schedules where id='fa600000-0000-4000-8000-000000000001'),2::bigint,'Dayless row moved second');
select throws_ok($$select public.order_schedule_phase_group('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',array['fa600000-0000-4000-8000-000000000001'::uuid,'fa600000-0000-4000-8000-000000000002'::uuid],array[2::bigint,1::bigint])$$,'PT409',null,'One stale sibling rejects whole order');
select is((select document_version from public.schedules where id='fa600000-0000-4000-8000-000000000001'),2::bigint,'Failed order did not partially increment first sibling');
select lives_ok($$select public.order_schedule_phase_group('fa300000-0000-4000-8000-000000000001',null,array['fa600000-0000-4000-8000-000000000003'::uuid],array[1::bigint])$$,'Unphased schedules order directly within production');
select throws_ok($$select public.order_schedule_phase_group('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',array['fa600000-0000-4000-8000-000000000001'::uuid,'fa600000-0000-4000-8000-000000000004'::uuid],array[2::bigint,1::bigint])$$,'PT409',null,'Cannot mix different phases');
select lives_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','Highlands hub',1)$$,'Owner renames with saved version');
select throws_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','Stale rename',1)$$,'PT409',null,'Stale rename refused');
select is(public.schedule_creation_destinations('fa200000-0000-4000-8000-000000000001')#>>'{productions,0,phases,0,name}','Highlands hub','Fresh destination returns renamed phase');
select is(public.schedule_creation_destinations('fa200000-0000-4000-8000-000000000001')#>>'{productions,0,phases,0,version}','2','Fresh phase version included');
select is((select document_version from public.schedules where id='fa600000-0000-4000-8000-000000000001'),2::bigint,'Phase rename leaves schedule unchanged');
select throws_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000004','fa400000-0000-4000-8000-000000000003','Foreign',null)$$,'PT404',null,'Cross-tenant phase creation refused');
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000002","session_id":"fa100000-0000-4000-8000-000000000002","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','Editor rename',2)$$,'PT404',null,'Editor cannot rename phases');
select throws_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000003','Editor phase',null)$$,'PT404',null,'Editor cannot create phases');
select throws_ok($$select public.order_schedule_phase_group('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',array['fa600000-0000-4000-8000-000000000002'::uuid,'fa600000-0000-4000-8000-000000000001'::uuid],array[2::bigint,2::bigint])$$,'PT404',null,'Editor cannot arrange schedules');
reset role;
insert into public.schedule_restrictions(organization_id,production_id,schedule_id,subject_user_id,denied_actions,authority,created_by) values ('fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001','fa600000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001',array['organize'],'owner','fa000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa100000-0000-4000-8000-000000000001","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.order_schedule_phase_group('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',array['fa600000-0000-4000-8000-000000000002'::uuid,'fa600000-0000-4000-8000-000000000001'::uuid],array[2::bigint,2::bigint])$$,'PT404',null,'Per-schedule Organizer restriction survives mixed phase order');
select is((select document_version from public.schedules where id='fa600000-0000-4000-8000-000000000002'),2::bigint,'Restriction denial preserves all sibling versions');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.order_schedule_phase_group('fa300000-0000-4000-8000-000000000001',null,array['fa600000-0000-4000-8000-000000000003'::uuid],array[2::bigint])$$,'PT401',null,'Phase ordering requires active session');
select throws_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000003','No session',null)$$,'PT401',null,'Phase creation requires active session');
reset role;
select * from finish();
rollback;
