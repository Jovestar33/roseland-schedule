-- Admission checks the wall clock and may lock a session; do not promise STABLE.
alter function public.get_account_session_deadline() volatile;
notify pgrst,'reload schema';
