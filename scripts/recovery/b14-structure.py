"""Catalog structure outside pg_dump's extension/ACL serialization details."""
QUERY="""set search_path=''; select jsonb_build_object(
'columns',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,a.attname,a.attnum,pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_catalog.pg_get_expr(d.adbin,d.adrelid))order by n.nspname,c.relname,a.attnum)from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace left join pg_catalog.pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname not like 'pg_%' and n.nspname<>'information_schema' and c.relkind in('r','v','m','p','f')and a.attnum>0 and not a.attisdropped),
'constraints',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,k.conname,pg_catalog.pg_get_constraintdef(k.oid,true))order by n.nspname,c.relname,k.conname)from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid=k.conrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where n.nspname not like 'pg_%'),
'indexes',(select jsonb_agg(to_jsonb(i)order by schemaname,tablename,indexname)from pg_catalog.pg_indexes i where schemaname not like 'pg_%'),
'rules',(select jsonb_agg(to_jsonb(r)order by schemaname,tablename,rulename)from pg_catalog.pg_rules r where schemaname not like 'pg_%'),
'views',(select jsonb_agg(to_jsonb(v)order by schemaname,viewname)from pg_catalog.pg_views v where schemaname not like 'pg_%'and schemaname<>'information_schema'),
'enums',(select jsonb_agg(jsonb_build_array(n.nspname,t.typname,e.enumlabel,e.enumsortorder)order by n.nspname,t.typname,e.enumsortorder)from pg_catalog.pg_enum e join pg_catalog.pg_type t on t.oid=e.enumtypid join pg_catalog.pg_namespace n on n.oid=t.typnamespace),
'triggers',(select jsonb_agg(jsonb_build_array(n.nspname,c.relname,t.tgname,t.tgenabled,pg_catalog.pg_get_triggerdef(t.oid,true))order by n.nspname,c.relname,t.tgname)from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid join pg_catalog.pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname not like 'pg_%'),
'eventTriggers',(select jsonb_agg(jsonb_build_array(evtname,evtevent,pg_catalog.pg_get_userbyid(evtowner),evtenabled,evtfoid::regprocedure::text,evttags)order by evtname)from pg_catalog.pg_event_trigger))"""


def logical(value):
    # pg_dump compacts dropped physical column slots; live column order remains
    # represented by the ordered list. Slot gaps are not a logical difference.
    return {**value, 'columns':[row[:3]+row[4:] for row in value['columns']]}
