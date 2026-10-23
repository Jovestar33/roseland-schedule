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

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa100000-0000-4000-8000-000000000001","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','Mountain hub',null)$$,'Owner creates named phase');
select lives_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000002','Coastal hub',null)$$,'Owner creates another phase');
select throws_ok($$select public.save_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','Mountain hub',null)$$,'PT409',null,'Ambiguous create retry cannot duplicate phase');
select lives_ok($$select public.move_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000002',1,1)$$,'Owner reorders neighboring phases');
select is((select position::bigint from public.phases where id='fa400000-0000-4000-8000-000000000001'),1::bigint,'Moved phase receives adjacent position');
select is((select position::bigint from public.phases where id='fa400000-0000-4000-8000-000000000002'),0::bigint,'Adjacent phase receives prior position');
select throws_ok($$select public.move_library_phase('fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000002',1,2)$$,'PT409',null,'Stale phase order is refused');
reset role;
insert into public.production_days(id,organization_id,production_id,phase_id,position,created_by,updated_by) values
('fa500000-0000-4000-8000-000000000001','fa200000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001','fa400000-0000-4000-8000-000000000001',0,'fa000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001');
set local role authenticated;
select public.create_schedule_in_production('fa600000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000001',null,'fa400000-0000-4000-8000-000000000001','Schedule 1','schedule-1','{"meta":{},"rows":[]}',1);
select public.create_schedule_in_production('fa600000-0000-4000-8000-000000000002','fa300000-0000-4000-8000-000000000001','fa500000-0000-4000-8000-000000000001',null,'Schedule 2','schedule-2','{"meta":{},"rows":[]}',1);
select public.create_schedule_in_production('fa600000-0000-4000-8000-000000000003','fa300000-0000-4000-8000-000000000001',null,null,'Schedule 3','schedule-3','{"meta":{},"rows":[]}',1);
select public.create_schedule_in_production('fa600000-0000-4000-8000-000000000004','fa300000-0000-4000-8000-000000000001',null,'fa400000-0000-4000-8000-000000000002','Schedule 4','schedule-4','{"meta":{},"rows":[]}',1);


select lives_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','organization','fb000000-0000-4000-8000-000000000001','{"id":"fb000000-0000-4000-8000-000000000001","type":"crew","name":"Org person","role":"Office","phone":"","email":""}',null,false)$$,'Owner creates organization contact');
select lives_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','production','fb000000-0000-4000-8000-000000000002','{"id":"fb000000-0000-4000-8000-000000000002","type":"crew","name":"Prod person","role":"Camera","phone":"","email":""}',null,false)$$,'Owner creates production contact');
select lives_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','phase','fb000000-0000-4000-8000-000000000003','{"id":"fb000000-0000-4000-8000-000000000003","type":"cast","name":"Phase person","role":"Host","phone":"","email":""}',null,false)$$,'Owner creates phase contact');
select is(jsonb_array_length(public.schedule_contact_directory('fa600000-0000-4000-8000-000000000001')->'entries'),3,'Schedule in phase sees all three levels');
select is(jsonb_array_length(public.schedule_contact_directory('fa600000-0000-4000-8000-000000000002')->'entries'),3,'Day-assigned schedule inherits effective phase');
select is(jsonb_array_length(public.schedule_contact_directory('fa600000-0000-4000-8000-000000000003')->'entries'),2,'Unphased schedule excludes phase contacts');
select is(jsonb_array_length(public.schedule_contact_directory('fa600000-0000-4000-8000-000000000004')->'entries'),2,'Other phase excludes sibling contacts');
select throws_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000003','phase','fb000000-0000-4000-8000-000000000005','{}',null,false)$$,'PT404','Phase unavailable','Unphased schedule cannot create phase contacts');
select throws_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','organization','fb000000-0000-4000-8000-000000000001','{"id":"fb000000-0000-4000-8000-000000000001","type":"crew","name":"Changed","role":"Office","phone":"","email":"","callTime":"9:00 AM"}',1,false)$$,'PT400','Invalid contact','Daily call time is forbidden in shared data');
select lives_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','organization','fb000000-0000-4000-8000-000000000001','{"id":"fb000000-0000-4000-8000-000000000001","type":"crew","name":"Org person","role":"Office","phone":"","email":""}',null,false)$$,'Lost create response retries idempotently');
select throws_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','production','fb000000-0000-4000-8000-000000000001','{}',1,false)$$,'PT400','Invalid contact','Malformed edit cannot bypass validation');
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000002","session_id":"fa100000-0000-4000-8000-000000000002","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select is(jsonb_array_length(public.schedule_contact_directory('fa600000-0000-4000-8000-000000000001')->'entries'),3,'Production editor can choose shared contacts');
select is(public.schedule_contact_directory('fa600000-0000-4000-8000-000000000001')#>>'{scopes,0,canManage}','false','Editor cannot manage organization directory');
select throws_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','production','fb000000-0000-4000-8000-000000000001','{}',1,false)$$,'PT404','Contacts unavailable','Editor cannot edit shared directory');
select throws_ok($$select public.schedule_contact_directory('fa600000-0000-4000-8000-000000000099')$$,'PT404','Contacts unavailable','Unknown or foreign schedule never reveals contacts');
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa100000-0000-4000-8000-000000000001","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','organization','fb000000-0000-4000-8000-000000000001','{"id":"fb000000-0000-4000-8000-000000000001","type":"crew","name":"Updated org person","role":"Office","phone":"","email":""}',1,false)$$,'Expected version permits shared update');
select lives_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','organization','fb000000-0000-4000-8000-000000000001','{"id":"fb000000-0000-4000-8000-000000000001","type":"crew","name":"Updated org person","role":"Office","phone":"","email":""}',1,false)$$,'Lost update response retries safely');
select throws_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','organization','fb000000-0000-4000-8000-000000000001','{"id":"fb000000-0000-4000-8000-000000000001","type":"crew","name":"Stale overwrite","role":"Office","phone":"","email":""}',1,false)$$,'PT409','Contact changed','Stale update cannot overwrite newer details');
select lives_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','phase','fb000000-0000-4000-8000-000000000003',null,1,true)$$,'Remove shared entry archives it');
select is(jsonb_array_length(public.schedule_contact_directory('fa600000-0000-4000-8000-000000000001')->'entries'),2,'Archived contact no longer offered');
select lives_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000001','phase','fb000000-0000-4000-8000-000000000003',null,1,true)$$,'Lost archive response retries safely');
select throws_ok($$select public.save_directory_contact('fa600000-0000-4000-8000-000000000004','phase','fb000000-0000-4000-8000-000000000003',null,2,true)$$,'PT404','Contacts unavailable','ID cannot cross phase boundaries');
reset role;
select ok(not has_table_privilege('authenticated','private.contact_directory','SELECT'),'Raw directory is not exposed');
select ok(not has_function_privilege('anon','public.schedule_contact_directory(uuid)','EXECUTE'),'Anonymous directory reads denied');
select is((select count(*)::integer from private.contact_directory),3,'Only three intended directory records');
select is((select document->'meta' from public.schedules where id='fa600000-0000-4000-8000-000000000001'),'{}'::jsonb,'Shared contact writes do not rewrite schedule documents');
select * from finish();
rollback;
