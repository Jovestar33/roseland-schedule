/* Pure utility helpers extracted from index.html.
   Keep this file dependency-free and side-effect-free. */
function t12m(s){
  if(!s) return null;
  s=s.replace(/\u202f/g,' ').trim();
  const m=s.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if(!m) return null;
  let h=+m[1],mn=+m[2],ap=m[3].toUpperCase();
  if(ap==='AM'&&h===12)h=0; if(ap==='PM'&&h!==12)h+=12;
  return h*60+mn;
}

function m12(v){
  if(v===null||v===undefined)return'';
  v=((v%1440)+1440)%1440;
  const h=Math.floor(v/60),m=v%60;
  return`${h%12===0?12:h%12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}`;
}

function durm(s){if(!s)return null;const m=s.match(/(\d+):(\d+)/);return m?+m[1]*60+ +m[2]:null;}
