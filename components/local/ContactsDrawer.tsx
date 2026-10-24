'use client';
import {useCallback,useContext,useState} from 'react';
import Modal,{ModalVisibilityContext} from '@/components/modals/Modal';
import CentralContacts from './CentralContacts';
import tools from './schedule-tools.module.css';

export default function ContactsDrawer({open,onClose,onState}:{open:boolean;onClose:()=>void;onState:(dirty:boolean,busy:boolean)=>void}){
  const parentVisible=useContext(ModalVisibilityContext);
  const [state,setState]=useState({dirty:false,busy:false,editing:false});
  const [closeNotice,setCloseNotice]=useState(false);
  const report=useCallback((dirty:boolean,busy:boolean,editing=false)=>{
    setState({dirty,busy,editing});onState(dirty,busy);
    if(!dirty&&!busy)setCloseNotice(false);
  },[onState]);
  return <ModalVisibilityContext.Provider value={open&&parentVisible}><Modal open retainWhenHidden title="Contacts" onClose={onClose} exitDuration={200}
    beforeClose={()=>{if(state.dirty||state.busy){setCloseNotice(true);return false;}return true;}}
    className={`${tools.drawer} contacts-drawer`}
    footer={!state.editing&&<button data-modal-close className="btn btn-light" onClick={onClose}>Close</button>}>
    <CentralContacts embedded onBack={onClose} onState={report} closeNotice={closeNotice}/>
  </Modal></ModalVisibilityContext.Provider>;
}
