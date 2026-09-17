begin;
select plan(6);
select ok(not has_table_privilege('authenticated','private.organization_presentation','SELECT'),'No direct configuration read');
select ok(not has_table_privilege('service_role','private.organization_presentation','INSERT'),'No direct configuration write');
select ok(not has_table_privilege('authenticated','private.organization_presentation_receipts','SELECT'),'Receipts are private');
select ok(not has_function_privilege('authenticated','private.validate_organization_presentation(jsonb)','EXECUTE'),'Validator is private');
select ok(has_function_privilege('authenticated','public.read_organization_presentation(uuid)','EXECUTE'),'Authenticated read entrypoint');
select ok(not has_function_privilege('anon','public.save_organization_presentation(uuid,uuid,bigint,jsonb)','EXECUTE'),'Anonymous settings writes unavailable');
select * from finish();rollback;
