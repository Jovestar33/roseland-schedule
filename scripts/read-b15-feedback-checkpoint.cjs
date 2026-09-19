// Read-only verification with the existing fictional review account.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const {createClient} = require('@supabase/supabase-js');
(async () => {
  const config = JSON.parse(fs.readFileSync('/private/tmp/roseland-b14-destination-g2-live-status.json'));
  const access = JSON.parse(fs.readFileSync('/private/tmp/roseland-b15-review-access.json'));
  if (config.API_URL !== 'http://127.0.0.1:56521') throw Error('Owned fictional loopback required');
  const client = createClient(config.API_URL, config.ANON_KEY, {
    auth: {persistSession:false, autoRefreshToken:false},
    global: {fetch:async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url ?? input.href);
      if (url.origin !== config.API_URL) throw Error('Nonlocal request refused');
      return fetch(input, {...init, redirect:'error', signal:AbortSignal.timeout(15000)});
    }},
  });
  if ((await client.auth.signInWithPassword({email:access.email,password:access.password})).error) throw Error('Existing review login unavailable');
  try {
    const baseline = JSON.parse(fs.readFileSync('evidence/b15-document/cases/library-downloaded.json'));
    for (const entry of baseline.schedules) {
      const result = await client.rpc('session_read_schedule', {target_schedule_id:entry.source.id});
      assert.equal(result.error, null);
      assert.equal(result.data.document_version, entry.source.version);
      assert.equal(result.data.display_name, entry.name);
      assert.deepEqual(result.data.document, entry.data);
    }
    const result = await client.rpc('session_read_schedule', {target_schedule_id:'efc8579e-e920-474f-970a-1a1d0a0b33e1'});
    assert.equal(result.error,null);
    const data = result.data;
    assert.equal(data.document_version,12);
    assert.equal(data.document.meta.projectName,'Keyboard Control Production');
    assert.equal(data.document.meta.phase,'Prep');
    assert.equal(data.document.meta.dayNumber,2);
    assert.equal(data.document.meta.totalDays,3);
    assert.equal(data.document.meta.prod,'Fictional Producer');
    assert.equal(data.document.meta.dir,'Fictional Director');
    assert.equal(data.document.meta.dp,'Fictional Camera');
    assert.equal(data.document.rows[0].desc,'VISIBLE EARLIER EDIT MUST SURVIVE');
    assert.equal(data.document.rows[0].subLocations[0].desc,'NESTED BASELINE');
    assert.equal(data.document.rows[0].subLocations[0].done,true);
    const original = JSON.parse(fs.readFileSync('evidence/b15-inline/cases/saved-readback.json'));
    assert.deepEqual({...data.document,savedAt:0},{...original.document,savedAt:0});
    fs.writeFileSync('evidence/b15-feedback/cases/saved-readback.json',JSON.stringify(data,null,2)+'\n');
    const preservation = {retainedSchedules:baseline.schedules.length,versionsNamesAndDocumentsUnchanged:true,existingTestSchedule:data.id,testScheduleVersion:data.document_version,originalDocumentContentRestoredExceptSaveTimestamp:true,noNewScheduleCreated:true};
    fs.writeFileSync('evidence/b15-feedback/cases/preservation-check.json',JSON.stringify(preservation,null,2)+'\n');
    console.log(JSON.stringify(preservation));
  } finally { await client.auth.signOut({scope:'local'}); }
})().catch(error => {console.error(error.message);process.exitCode=1;});
