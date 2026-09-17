-- Separate transaction: new enum values cannot be used before commit.
alter type public.production_role add value if not exists 'organizer';
