import type {WorkspaceOrganization} from '@/lib/platform/workspace-repository';
import styles from './workspace-organization.module.css';

type Props={organizations:WorkspaceOrganization[];current:WorkspaceOrganization|null;state:'loading'|'ready'|'error';more:boolean;disabled:boolean;onChange:(id:string)=>void;onRetry:()=>void;onMore:()=>void};
export default function WorkspaceOrganizationContext({organizations,current,state,more,disabled,onChange,onRetry,onMore}:Props){
 if(state==='loading')return <span className={styles.message} role="status">Loading your organizations…</span>;
 if(state==='error')return <div className={styles.context}><span role="status">Organization access could not be checked.</span><button className="btn btn-light btn-sm" disabled={disabled} onClick={onRetry}>Try again</button></div>;
 if(!organizations.length&&!current)return <span className={styles.message} role="status">No organization access yet. Review an invitation in Account &amp; settings.</span>;
 const choices=current&&!organizations.some(o=>o.id===current.id)?[current,...organizations]:organizations;
 if(choices.length===1&&!more&&current)return <div className={styles.identity}><span className={styles.caption}>Organization</span><strong>{current.name}</strong></div>;
 return <div className={styles.context}><label className={styles.identity}><span className={styles.caption}>Organization</span><select aria-label="Switch organization" value={current?.id??''} disabled={disabled} onChange={event=>onChange(event.target.value)}><option value="" disabled>Choose an organization</option>{choices.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>{more&&<button className="btn btn-light btn-sm" disabled={disabled} onClick={onMore}>More organizations</button>}</div>;
}
