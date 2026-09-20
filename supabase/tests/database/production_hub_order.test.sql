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
select is((select library_position from public.productions where id='fa300000-0000-4000-8000-000000000003'),3::bigint,'New hubs append to saved order');
select ok(not has_function_privilege('anon','public.move_production_hub(uuid,uuid,bigint,bigint)','EXECUTE'),'Anonymous move denied');
select ok(not has_function_privilege('service_role','public.move_production_hub(uuid,uuid,bigint,bigint)','EXECUTE'),'Service role move denied');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa100000-0000-4000-8000-000000000001","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.move_production_hub('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000003',1,1)$$,'PT409',null,'Cannot skip another visible hub');
select lives_ok($$select public.move_production_hub('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002',1,1)$$,'Owner can move hub down');
select is(public.schedule_creation_destinations('fa200000-0000-4000-8000-000000000001')#>>'{productions,0,name}','Alpha hub','Fresh library read uses saved order');
select is(public.schedule_creation_destinations('fa200000-0000-4000-8000-000000000001')#>>'{productions,1,version}','2','Both moved versions increment');
select throws_ok($$select public.move_production_hub('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002',1,1)$$,'PT409',null,'Retry of old versions cannot undo saved move');
select lives_ok($$select public.move_production_hub('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002',2,2)$$,'Owner can move hub back up');
select is(public.schedule_creation_destinations('fa200000-0000-4000-8000-000000000001')#>>'{productions,0,name}','Zulu hub','Manual order overrides alphabetic order');
select throws_ok($$select public.move_production_hub('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000004',3,1)$$,'PT404',null,'Cross-organization move denied');
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000002","session_id":"fa100000-0000-4000-8000-000000000002","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.move_production_hub('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002',3,3)$$,'PT404',null,'Editor cannot reorder production hubs');
select set_config('request.jwt.claims','{}',true);
select throws_ok($$select public.move_production_hub('fa300000-0000-4000-8000-000000000001','fa300000-0000-4000-8000-000000000002',3,3)$$,'PT401',null,'Active session required');
reset role;
select is((select count(*)::integer from public.audit_events where organization_id='fa200000-0000-4000-8000-000000000001' and action='production.order'),2,'Only confirmed moves audited');
select * from finish();
rollback;
