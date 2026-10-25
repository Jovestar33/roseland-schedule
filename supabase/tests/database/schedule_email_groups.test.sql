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


select lives_ok($$select public.save_organization_contact('fa200000-0000-4000-8000-000000000001',null,null,'fb000000-0000-4000-8000-000000000001','{"id":"fb000000-0000-4000-8000-000000000001","type":"client","name":"Zelda Client","company":"Example Studio","role":"Producer","phone":"555-0199","email":"client@example.test"}',null)$$,'Organization client with company can be created independently of a schedule');
select lives_ok($$select public.save_organization_contact('fa200000-0000-4000-8000-000000000001',null,null,'fb000000-0000-4000-8000-000000000001','{"id":"fb000000-0000-4000-8000-000000000001","type":"client","name":"Zelda Client","company":"Example Studio","role":"Producer","phone":"555-0199","email":"client@example.test"}',null)$$,'Create retries keep one contact');
select is(public.organization_contact_directory('fa200000-0000-4000-8000-000000000001')#>>'{entries,0,contact,type}','client','Client category is returned');
select is(jsonb_array_length(public.organization_contact_directory('fa200000-0000-4000-8000-000000000001',search_text=>'studio')->'entries'),1,'Company search works');
select is(jsonb_array_length(public.organization_contact_directory('fa200000-0000-4000-8000-000000000001',type_filter=>'crew')->'entries'),0,'Type filters are applied before pagination');
select is(jsonb_array_length(public.organization_contact_directory('fa200000-0000-4000-8000-000000000001',production_filter=>'fa300000-0000-4000-8000-000000000001')->'entries'),0,'Unassigned organization contact is not falsely assigned to production');
reset role;
update public.schedules set document=jsonb_build_object('meta',jsonb_build_object('date','2026-10-24','productionContacts',jsonb_build_array('{"id":"fb000000-0000-4000-8000-000000000001","type":"client","name":"Zelda Client","company":"Example Studio","role":"Producer","phone":"555-0199","email":"client@example.test"}'::jsonb||jsonb_build_object('callTime','9:00 AM','makeupTime','9:15 AM','readyTime','9:30 AM','releaseTime','4:00 PM','pickup','Van','availability','All day')),'callsheet',jsonb_build_object('reportLocation','123 Example Street','crewCall','9:00 AM','timeZone','America/New_York','departmentNotes','Camera','mealHeadcount','12','preparedBy','Test producer','revisionNotes','Initial')),'rows',jsonb_build_array(jsonb_build_object('timeIn','9:00 AM','dur','01:00','action','Shoot','desc','Private shooting detail','contactName','Location manager','contactPhone','555-0100','contactEmail','location@example.test'))) where id='fa600000-0000-4000-8000-000000000001';
select lives_ok($$select private.validate_schedule_document((select document from public.schedules where id='fa600000-0000-4000-8000-000000000001'),1)$$,'All operational fields and client calls validate');
set local role authenticated;
select is(jsonb_array_length(public.organization_contact_directory('fa200000-0000-4000-8000-000000000001',production_filter=>'fa300000-0000-4000-8000-000000000001')->'entries'),2,'Assigned organization contact appears under production');
select is(jsonb_array_length(public.organization_contact_directory('fa200000-0000-4000-8000-000000000001',phase_filter=>'fa400000-0000-4000-8000-000000000001')->'entries'),2,'Assigned organization contact appears under phase');
select is(public.organization_contact_directory('fa200000-0000-4000-8000-000000000001',search_text=>'Location manager')#>>'{entries,0,contact,name}','Location manager','Existing row contacts are visible in the central directory');
select is(public.organization_contact_directory('fa200000-0000-4000-8000-000000000001',search_text=>'Location manager')#>>'{entries,0,schedule_id}','fa600000-0000-4000-8000-000000000001','Row contacts retain source schedule');
select throws_ok($$select public.organization_contact_directory('fa200000-0000-4000-8000-000000000002')$$,'PT404','Contacts unavailable','Foreign organization remains private');
select lives_ok($$select public.issue_call_sheet('fa600000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001',2,false,false)$$,'Saved snapshot can be issued');
select lives_ok($$select public.issue_call_sheet('fa600000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000001',2,false,false)$$,'Issue retries cannot create duplicate versions');
select is(public.read_issued_call_sheet('fa600000-0000-4000-8000-000000000001',1)#>>'{document,meta,productionContacts,0,phone}',null::text,'Personal phones are excluded');
select is(public.read_issued_call_sheet('fa600000-0000-4000-8000-000000000001',1)#>>'{document,rows,0,desc}',null::text,'Compact edition excludes full shooting description from payload');
select is(public.read_issued_call_sheet('fa600000-0000-4000-8000-000000000001',1)#>>'{document,meta,callsheet,reportLocation}','123 Example Street','Operational reporting instructions remain available');
select throws_ok($$select public.issue_call_sheet('fa600000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002',1,true,true)$$,'PT409','Save and review the latest schedule first','Stale source version cannot be issued');
select lives_ok($$select public.create_call_sheet_link('fa600000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','recipient@example.test',1)$$,'Recipient link created for issued version');
select lives_ok($$select public.create_call_sheet_link('fa600000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','recipient@example.test',1)$$,'Link creation retries are idempotent');
select is(public.claim_call_sheet_email('fd000000-0000-4000-8000-000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'fe000000-0000-4000-8000-000000000001')->>'state','claimed','Only explicit email claim begins delivery');
select is(public.claim_call_sheet_email('fd000000-0000-4000-8000-000000000001','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,'fe000000-0000-4000-8000-000000000001')->>'state','sending','Repeated requests cannot send twice');
reset role;set local role service_role;
select lives_ok($$select public.finish_call_sheet_email('fd000000-0000-4000-8000-000000000001','fe000000-0000-4000-8000-000000000001',true)$$,'Server records SMTP acceptance separately');
select is(public.read_call_sheet_recipient('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1)->>'acknowledged','true','Recipient can confirm exact version');
select is(public.read_call_sheet_recipient(repeat('b',64)),null::jsonb,'Unknown token gives no details');
reset role;
update public.schedules set document=jsonb_set(document,'{meta,callsheet,reportLocation}','"Changed draft address"') where id='fa600000-0000-4000-8000-000000000001';
set local role service_role;
select is(public.read_call_sheet_recipient('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')#>>'{document,meta,callsheet,reportLocation}','123 Example Street','Draft edits do not change published instructions');
reset role;set local role authenticated;
select lives_ok($$select public.issue_call_sheet('fa600000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002',3,true,true)$$,'Explicit revision publishes next immutable edition');
select is(jsonb_array_length(public.list_call_sheet_editions('fa600000-0000-4000-8000-000000000001')->'editions'),2,'Exactly two editions exist');
reset role;set local role service_role;
select is(public.read_call_sheet_recipient('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')->>'edition','2','Existing link opens latest issued edition');
select is(public.read_call_sheet_recipient('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')->>'acknowledged','false','Receipt of old edition does not imply receipt of revision');
select throws_ok($$select public.read_call_sheet_recipient('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1)$$,'PT409','A newer version is available','Cannot acknowledge unseen new edition');
reset role;set local role authenticated;
select lives_ok($$select public.revoke_call_sheet_link('fa600000-0000-4000-8000-000000000001','fd000000-0000-4000-8000-000000000001')$$,'Publisher can revoke link');
reset role;set local role service_role;
select is(public.read_call_sheet_recipient('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),null::jsonb,'Revoked links no longer read snapshots');
reset role;set local role authenticated;
select lives_ok($$select public.save_organization_contact('fa200000-0000-4000-8000-000000000001',null,null,'fb000000-0000-4000-8000-000000000001',null,1,true)$$,'Archive shared profile without changing schedules');
select lives_ok($$select public.save_organization_contact('fa200000-0000-4000-8000-000000000001',null,null,'fb000000-0000-4000-8000-000000000001',null,1,true)$$,'Archive retries are safe');
select is(public.organization_contact_directory('fa200000-0000-4000-8000-000000000001')#>>'{entries,0,scope}','schedule','Archived profile survives as saved schedule contact');
reset role;
select ok(not has_function_privilege('anon','public.read_call_sheet_recipient(text,integer)','execute'),'Anonymous users cannot bypass rate-limited HTTP exchange');
select ok(not has_table_privilege('authenticated','private.call_sheet_editions','select'),'Raw issued snapshots remain private');
select ok(not has_table_privilege('service_role','private.call_sheet_links','select'),'Raw link records remain private');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000001","session_id":"fa100000-0000-4000-8000-000000000001","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select lives_ok($$select public.save_schedule_email_group('fa600000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Core crew','[{"name":"Test Crew","email":"crew@example.test"}]',null)$$,'Reusable production email group created');
select lives_ok($$select public.save_schedule_email_group('fa600000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Core crew','[{"name":"Test Crew","email":"crew@example.test"}]',null)$$,'Ambiguous save retry keeps the same group');
select is(jsonb_array_length(public.list_schedule_email_groups('fa600000-0000-4000-8000-000000000001')),1,'Exactly one saved group');
select is(public.list_schedule_email_groups('fa600000-0000-4000-8000-000000000002')#>>'{0,name}','Core crew','Group reusable in another schedule in the production');
select throws_ok($$select public.save_schedule_email_group('fa600000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000002','Bad','[{"name":"A","email":"crew@example.test"},{"name":"B","email":"CREW@example.test"}]',null)$$,'PT400','Duplicate recipient email','Case-insensitive duplicate addresses rejected');
select throws_ok($$select public.save_schedule_email_group('fa600000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Changed','[{"name":"Test","email":"crew@example.test"}]',99)$$,'PT409',null,'Stale group update rejected');
select lives_ok($$select public.prepare_schedule_email_batch('fa600000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',3,'both','[{"id":"b3000000-0000-4000-8000-000000000001","hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"Test Crew","email":"crew@example.test"},{"id":"b3000000-0000-4000-8000-000000000002","hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","name":"Test Cast","email":"cast@example.test"}]',false,true)$$,'Prepare a group distribution atomically');
select lives_ok($$select public.prepare_schedule_email_batch('fa600000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',3,'both','[{"id":"b3000000-0000-4000-8000-000000000001","hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"Test Crew","email":"crew@example.test"},{"id":"b3000000-0000-4000-8000-000000000002","hash":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","name":"Test Cast","email":"cast@example.test"}]',false,true)$$,'Preparing the same request twice cannot duplicate batch or links');
select is(jsonb_array_length(public.list_schedule_email_batches('fa600000-0000-4000-8000-000000000001')),1,'One batch in sending history');
select is(jsonb_array_length(public.list_schedule_email_batches('fa600000-0000-4000-8000-000000000001')#>'{0,recipients}'),2,'Two distinct recipients, not a visible shared To list');
select is(public.list_schedule_email_batches('fa600000-0000-4000-8000-000000000001')#>>'{0,recipients,0,state}','not_sent','Preparation does not send mail');
select throws_ok($$select public.prepare_schedule_email_batch('fa600000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001',3,'schedule','[{"id":"b3000000-0000-4000-8000-000000000001","hash":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","name":"Test Crew","email":"crew@example.test"}]',false,true)$$,'PT409',null,'Same send ID cannot change recipient or documents');

select is(jsonb_array_length(public.list_call_sheet_editions('fa600000-0000-4000-8000-000000000001')->'editions'),2,'Group sending cannot publish a new general call-sheet edition');
select is(jsonb_array_length(public.list_call_sheet_editions('fa600000-0000-4000-8000-000000000001')->'links'),1,'Group recipient links stay out of general call-sheet link controls');
select is(public.claim_call_sheet_email('b3000000-0000-4000-8000-000000000001',repeat('b',64),1,'b4000000-0000-4000-8000-000000000001')->>'documents','both','SMTP claim carries the selected documents');
select is(public.claim_call_sheet_email('b3000000-0000-4000-8000-000000000001',repeat('b',64),1,'b4000000-0000-4000-8000-000000000002')->>'state','sending','Double click cannot claim a second send');
select lives_ok($$select public.issue_call_sheet('fa600000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001',3,true,true)$$,'Another edition can be issued independently');
reset role;set local role service_role;
select lives_ok($$select public.finish_call_sheet_email('b3000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',true)$$,'Server confirms first recipient acceptance');
select is(public.read_call_sheet_recipient(repeat('b',64))->>'edition','1','Batch link stays on its original issued version after a later issue');
select is(public.read_call_sheet_recipient(repeat('b',64))->>'documents','both','Recipient can view both selected documents');
reset role;
insert into private.organization_presentation(organization_id,version,config,updated_by) values('fa200000-0000-4000-8000-000000000001',1,'{"logoOnLight":"data:image/png;base64,SVNTVUVS"}','fa000000-0000-4000-8000-000000000001');
set local role service_role;
select is(public.read_call_sheet_recipient(repeat('b',64))->>'logo_on_light','data:image/png;base64,SVNTVUVS','Frozen group documents carry the issuing organization light logo');

select is(public.read_call_sheet_recipient(repeat('b',64))#>>'{document,meta,productionContacts,0,email}',null::text,'Personal email is excluded unless explicitly selected');
select is(public.read_call_sheet_recipient(repeat('b',64),1)->>'acknowledged','true','Recipient confirms exactly the sent version');
reset role;set local role authenticated;
select is(public.claim_call_sheet_email('b3000000-0000-4000-8000-000000000002',repeat('c',64),1,'b4000000-0000-4000-8000-000000000003')->>'state','claimed','Remaining recipient can still be sent the same frozen version');
select is(public.list_schedule_email_batches('fa600000-0000-4000-8000-000000000001')#>>'{0,recipients,1,state}','accepted','History separates accepted mail from uncertain delivery');
select throws_ok($$select public.list_schedule_email_groups('b6000000-0000-4000-8000-000000000001')$$,'PT404',null,'Unknown or inaccessible schedule cannot read groups');
select lives_ok($$select public.save_schedule_email_group('fa600000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Core crew','[{"name":"Changed crew","email":"new@example.test"}]',1)$$,'Saved group may be updated for future sends');
select is(public.list_schedule_email_batches('fa600000-0000-4000-8000-000000000001')#>>'{0,recipients,1,email}','crew@example.test','Changing group never rewrites previous send recipients');
reset role;
select ok(not has_table_privilege('authenticated','private.schedule_email_groups','select'),'Raw group records are private');
select ok(not has_function_privilege('anon','public.prepare_schedule_email_batch(uuid,uuid,bigint,text,jsonb,boolean,boolean)','execute'),'Anonymous clients cannot prepare or send');
select ok(not has_function_privilege('service_role','public.save_schedule_email_group(uuid,uuid,text,jsonb,bigint,boolean)','execute'),'Service key cannot impersonate a user creating groups');

set local role authenticated;
select public.create_schedule_in_production('fa600000-0000-4000-8000-000000000005','fa300000-0000-4000-8000-000000000002',null,null,'Other production','other-production','{"meta":{},"rows":[]}',1);
select is(jsonb_array_length(public.list_schedule_email_groups('fa600000-0000-4000-8000-000000000005')),0,'Groups do not leak into a different production');
select throws_ok($$select public.save_schedule_email_group('fa600000-0000-4000-8000-000000000005','b1000000-0000-4000-8000-000000000001','Stolen','[{"name":"A","email":"a@example.test"}]',2)$$,'PT404',null,'A different production cannot overwrite a saved group');
select lives_ok($$select public.prepare_schedule_email_batch('fa600000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000002',3,'schedule','[{"id":"b3000000-0000-4000-8000-000000000003","hash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","name":"Test","email":"test@example.test"}]',false,true)$$,'Schedule-only send prepares a separate snapshot');
reset role;set local role service_role;
select is(public.read_call_sheet_recipient(repeat('d',64))#>'{document,meta,callsheet}',null::jsonb,'Schedule-only recipients never receive call-sheet data');
select is(public.read_call_sheet_recipient(repeat('d',64))#>>'{document,rows,0,desc}','Private shooting detail','Schedule retains full shooting descriptions');
reset role;set local role authenticated;
select lives_ok($$select public.revoke_call_sheet_link('fa600000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000003')$$,'Batch recipient can be revoked');
reset role;set local role service_role;
select is(public.read_call_sheet_recipient(repeat('d',64)),null::jsonb,'Revocation also blocks batch documents');
reset role;set local role authenticated;
select set_config('request.jwt.claims','{"sub":"fa000000-0000-4000-8000-000000000002","session_id":"fa100000-0000-4000-8000-000000000002","exp":9999999999,"role":"authenticated","aal":"aal2"}',true);
select throws_ok($$select public.claim_call_sheet_email('b3000000-0000-4000-8000-000000000002',repeat('c',64),1,'b4000000-0000-4000-8000-000000000004')$$,'PT404',null,'Another editor cannot use another user private sending token');
reset role;

select * from finish();rollback;
