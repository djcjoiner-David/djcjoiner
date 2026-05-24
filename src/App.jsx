import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";

const SUPABASE_URL = "https://oixsdxhndezbymllkpqk.supabase.co";
const SUPABASE_KEY = "sb_publishable_AgjgZclgWWtRM8VGLn1How_2NQjjeeP";

async function db(method, table, body, query="") {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method,
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": method==="POST" ? "return=representation" : method==="PATCH"||method==="DELETE" ? "return=representation" : "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) { const e = await res.text(); throw new Error(e); }
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const TODAY = new Date();
TODAY.setHours(0,0,0,0);
const todayStr = isoDate(TODAY);

function isoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function parseISO(s) { const [y,m,d]=s.split("-").map(Number); return new Date(y,m-1,d); }
function addDays(d,n) { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function mondayOf(d) { const day=d.getDay(); return addDays(d,day===0?-6:1-day); }
function formatDate(d) { return d.toLocaleDateString("en-AU",{day:"numeric",month:"short"}); }
function formatDateLong(d) { return d.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short",year:"numeric"}); }
function isWeekend(d) { return d.getDay()===0||d.getDay()===6; }
function isPast(dateStr) { return dateStr < todayStr; }
function oneMonthAgo() { const d=new Date(TODAY); d.setMonth(d.getMonth()-1); return isoDate(d); }

function buildAutoFill(startDateStr, totalHours) {
  if (!totalHours||totalHours<=0) return [];
  const days=[]; let remaining=totalHours; let cur=parseISO(startDateStr);
  while (remaining>0) {
    if (!isWeekend(cur)) { const h=Math.min(8,remaining); days.push({dateStr:isoDate(cur),hours:h}); remaining-=h; }
    cur=addDays(cur,1);
    if (days.length>365) break;
  }
  return days;
}

const JOB_COLOUR_PRESETS = [
  {bgColor:"#EFF6FF",borderColor:"#3B82F6",textColor:"#1D4ED8"},
  {bgColor:"#F0FDF4",borderColor:"#22C55E",textColor:"#15803D"},
  {bgColor:"#FFFBEB",borderColor:"#F59E0B",textColor:"#B45309"},
  {bgColor:"#FDF2F8",borderColor:"#EC4899",textColor:"#9D174D"},
  {bgColor:"#F5F3FF",borderColor:"#8B5CF6",textColor:"#6D28D9"},
  {bgColor:"#FFF1F2",borderColor:"#F43F5E",textColor:"#BE123C"},
  {bgColor:"#ECFEFF",borderColor:"#06B6D4",textColor:"#0E7490"},
  {bgColor:"#FFF7ED",borderColor:"#F97316",textColor:"#C2410C"},
  {bgColor:"#F0FDF4",borderColor:"#10B981",textColor:"#065F46"},
  {bgColor:"#FEF9C3",borderColor:"#EAB308",textColor:"#854D0E"},
];

// ── UI Primitives ─────────────────────────────────────────────

function ColorPicker({label,value,onChange}) {
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:12,color:"#64748B",marginBottom:3,fontWeight:500}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <input type="color" value={value} onChange={e=>onChange(e.target.value)}
          style={{width:32,height:32,padding:2,border:"1px solid #CBD5E1",borderRadius:6,cursor:"pointer"}}/>
        <input type="text" value={value} onChange={e=>onChange(e.target.value)}
          style={{flex:1,padding:"5px 8px",border:"1px solid #CBD5E1",borderRadius:6,fontSize:12,fontFamily:"monospace"}}/>
      </div>
    </div>
  );
}

function Modal({title,onClose,children,wide,small}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:wide?820:small?400:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px 12px",borderBottom:"1px solid #E2E8F0"}}>
          <div style={{fontSize:16,fontWeight:600,color:"#1E293B"}}>{title}</div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#94A3B8"}}>×</button>
        </div>
        <div style={{padding:"16px 20px 20px"}}>{children}</div>
      </div>
    </div>
  );
}

function Inp({label,...props}) {
  return (
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:12,color:"#64748B",marginBottom:3,fontWeight:500}}>{label}</div>}
      <input style={{width:"100%",padding:"7px 10px",border:"1px solid #CBD5E1",borderRadius:8,fontSize:14,boxSizing:"border-box",outline:"none"}} {...props}/>
    </div>
  );
}

function Sel({label,children,...props}) {
  return (
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:12,color:"#64748B",marginBottom:3,fontWeight:500}}>{label}</div>}
      <select style={{width:"100%",padding:"7px 10px",border:"1px solid #CBD5E1",borderRadius:8,fontSize:14,background:"#fff",outline:"none"}} {...props}>
        {children}
      </select>
    </div>
  );
}

function Btn({variant="default",style:s,...props}) {
  const base={padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:500,cursor:"pointer",border:"none",transition:"all 0.15s"};
  const v={default:{background:"#F1F5F9",color:"#334155"},primary:{background:"#3B82F6",color:"#fff"},danger:{background:"#EF4444",color:"#fff"},ghost:{background:"none",border:"1px solid #CBD5E1",color:"#475569"}};
  return <button style={{...base,...v[variant],...s}} {...props}/>;
}

function Spinner() {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,border:"4px solid #E2E8F0",borderTop:"4px solid #E8A030",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <div style={{color:"#64748B",fontSize:14}}>Loading schedule...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

function JobBlock({job,subItem,hours,entry,onClick,onDragStart,onDragEnd,conflict}) {
  return (
    <div draggable onDragStart={e=>onDragStart(e,entry)} onDragEnd={onDragEnd} onClick={onClick}
      style={{background:conflict?"#FEF2F2":job.bgColor,border:conflict?"2px solid #EF4444":`1.5px solid ${job.borderColor}`,borderRadius:6,padding:"3px 6px",cursor:"grab",minHeight:44,display:"flex",flexDirection:"column",justifyContent:"center",overflow:"hidden",userSelect:"none",position:"relative"}}>
      {conflict&&<div style={{position:"absolute",top:2,right:4,fontSize:10,color:"#EF4444",fontWeight:700}}>⚠ CONFLICT</div>}
      <div style={{fontSize:11,fontWeight:700,color:conflict?"#EF4444":job.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{job.jobNo} · {job.name}</div>
      <div style={{fontSize:11,fontWeight:400,color:conflict?"#EF4444":job.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{subItem?subItem.name:"General"}</div>
      <div style={{fontSize:10,color:conflict?"#EF4444":job.textColor,opacity:0.7}}>{hours}h</div>
    </div>
  );
}

function EmptySlot({onClick,isDropTarget,isPastDate}) {
  if (isPastDate) return <div style={{minHeight:44,background:"#F8FAFC",borderRadius:6,border:"1px solid #F1F5F9"}}/>;
  return (
    <div onClick={onClick}
      style={{border:isDropTarget?"2px dashed #3B82F6":"1.5px dashed #CBD5E1",borderRadius:6,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:isDropTarget?"#3B82F6":"#CBD5E1",fontSize:16,background:isDropTarget?"rgba(59,130,246,0.06)":"transparent",transition:"all 0.12s"}}
      onMouseEnter={e=>{if(!isDropTarget){e.currentTarget.style.borderColor="#94A3B8";e.currentTarget.style.color="#94A3B8";}}}
      onMouseLeave={e=>{if(!isDropTarget){e.currentTarget.style.borderColor="#CBD5E1";e.currentTarget.style.color="#CBD5E1";}}}>
      {isDropTarget?"↓":"+"}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────

export default function DJCJoiner() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("schedule");
  const [viewWeeks, setViewWeeks] = useState(2);
  const [viewMode, setViewMode] = useState("weeks");
  const [anchorDate, setAnchorDate] = useState(()=>mondayOf(TODAY));

  const [staff, setStaff] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [subItems, setSubItems] = useState([]);
  const [entries, setEntries] = useState([]);

  const [jobModal, setJobModal] = useState(null);
  const [entryModal, setEntryModal] = useState(null);
  const [staffModal, setStaffModal] = useState(null);
  const [conflictAlert, setConflictAlert] = useState(null);
  const [error, setError] = useState(null);

  const dragEntry = useRef(null);
  const [dropTarget, setDropTarget] = useState(null);

  // ── Load all data from Supabase ──
  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [staffData, jobsData, subData, entriesData] = await Promise.all([
        db("GET","staff","","?order=created_at"),
        db("GET","jobs","","?order=created_at"),
        db("GET","sub_items","","?order=created_at"),
        db("GET","entries","","?order=created_at"),
      ]);
      setStaff(staffData.map(s=>({id:s.id,name:s.name})));
      setJobs(jobsData.map(j=>({id:j.id,jobNo:j.job_no,name:j.name,bgColor:j.bg_color,borderColor:j.border_color,textColor:j.text_color})));
      setSubItems(subData.map(s=>({id:s.id,jobId:s.job_id,name:s.name,totalHours:s.total_hours||0})));
      setEntries(entriesData.map(e=>({id:e.id,staffId:e.staff_id,jobId:e.job_id,subItemId:e.sub_item_id,dateStr:e.date_str,slot:e.slot,hours:e.hours})));
    } catch(e) {
      setError("Could not connect to database. Check your internet connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(()=>{ loadAll(); }, [loadAll]);

  const threshold = oneMonthAgo();

  const {activeJobs,archivedJobs} = useMemo(()=>{
    const active=[],archived=[];
    for (const job of jobs) {
      const jobEntries=entries.filter(e=>e.jobId===job.id);
      if (!jobEntries.length){active.push(job);continue;}
      const maxDate=jobEntries.map(e=>e.dateStr).sort().reverse()[0];
      if (maxDate<threshold) archived.push(job); else active.push(job);
    }
    return {activeJobs:active,archivedJobs:archived};
  },[jobs,entries,threshold]);

  const visibleDays = useMemo(()=>{
    const days=[]; const weeks=viewMode==="month"?4:viewWeeks;
    for (let w=0;w<weeks;w++) for (let d=0;d<5;d++) days.push(addDays(anchorDate,w*7+d));
    return days;
  },[anchorDate,viewWeeks,viewMode]);

  const totalWeeks=viewMode==="month"?4:viewWeeks;
  const weekStarts=Array.from({length:totalWeeks},(_,i)=>addDays(anchorDate,i*7));

  const {entryMap,conflictKeys} = useMemo(()=>{
    const map={},counts={};
    for (const e of entries) {
      const k=`${e.staffId}|${e.dateStr}|${e.slot}`;
      counts[k]=(counts[k]||0)+1;
      map[k]=e;
    }
    return {entryMap:map,conflictKeys:new Set(Object.keys(counts).filter(k=>counts[k]>1))};
  },[entries]);

  function navigate(dir) { const w=viewMode==="month"?4:viewWeeks; setAnchorDate(d=>addDays(d,dir*w*7)); }
  function goToday() { setAnchorDate(mondayOf(TODAY)); }

  function openNewEntry(staffId,dateStr,slot) {
    if (isPast(dateStr)) return;
    setEntryModal({mode:"new",staffId,dateStr,slot,jobId:"",subItemId:"",hours:8,autoFill:true});
  }
  function openEditEntry(entry) { setEntryModal({mode:"edit",...entry,autoFill:false}); }

  async function saveEntry(data,extraEntries) {
    setSaving(true);
    try {
      if (data.mode==="new") {
        const all=extraEntries&&extraEntries.length>0?extraEntries:[{dateStr:data.dateStr,hours:data.hours}];
        const valid=all.filter(p=>!isPast(p.dateStr));
        const conflicts=valid.filter(p=>!!entryMap[`${data.staffId}|${p.dateStr}|${data.slot}`]);
        if (conflicts.length>0) {
          setSaving(false);
          setConflictAlert({
            message:`⚠ ${conflicts.length} date${conflicts.length>1?"s":""} already have an entry in that slot. They will be shown in red.`,
            onConfirm:async()=>{
              setSaving(true);
              const rows=valid.map(({dateStr,hours})=>({staff_id:data.staffId,job_id:data.jobId,sub_item_id:data.subItemId||null,date_str:dateStr,slot:data.slot,hours}));
              const inserted=await db("POST","entries",rows);
              setEntries(prev=>[...prev,...inserted.map(e=>({id:e.id,staffId:e.staff_id,jobId:e.job_id,subItemId:e.sub_item_id,dateStr:e.date_str,slot:e.slot,hours:e.hours}))]);
              setConflictAlert(null); setEntryModal(null); setTab("schedule"); setSaving(false);
            },
            onCancel:()=>setConflictAlert(null),
          });
          return;
        }
        const rows=valid.map(({dateStr,hours})=>({staff_id:data.staffId,job_id:data.jobId,sub_item_id:data.subItemId||null,date_str:dateStr,slot:data.slot,hours}));
        const inserted=await db("POST","entries",rows);
        setEntries(prev=>[...prev,...inserted.map(e=>({id:e.id,staffId:e.staff_id,jobId:e.job_id,subItemId:e.sub_item_id,dateStr:e.date_str,slot:e.slot,hours:e.hours}))]);
      } else {
        const updated=await db("PATCH","entries",{staff_id:data.staffId,job_id:data.jobId,sub_item_id:data.subItemId||null,date_str:data.dateStr,slot:data.slot,hours:data.hours},`?id=eq.${data.id}`);
        setEntries(prev=>prev.map(e=>e.id===data.id?{...e,staffId:data.staffId,jobId:data.jobId,subItemId:data.subItemId||null,dateStr:data.dateStr,slot:data.slot,hours:data.hours}:e));
      }
      setEntryModal(null); setTab("schedule");
    } catch(e) { setError("Failed to save entry. Please try again."); }
    setSaving(false);
  }

  async function removeEntry(id) {
    setSaving(true);
    try {
      await db("DELETE","entries",null,`?id=eq.${id}`);
      setEntries(prev=>prev.filter(e=>e.id!==id));
      setEntryModal(null);
    } catch(e) { setError("Failed to remove entry."); }
    setSaving(false);
  }

  async function saveJob(data) {
    setSaving(true);
    try {
      if (data.isNew) {
        const [newJob]=await db("POST","jobs",[{job_no:data.jobNo,name:data.name,bg_color:data.bgColor,border_color:data.borderColor,text_color:data.textColor}]);
        setJobs(prev=>[...prev,{id:newJob.id,jobNo:newJob.job_no,name:newJob.name,bgColor:newJob.bg_color,borderColor:newJob.border_color,textColor:newJob.text_color}]);
        const validSubs=data.subItems.filter(s=>s.name.trim());
        if (validSubs.length>0) {
          const inserted=await db("POST","sub_items",validSubs.map(s=>({job_id:newJob.id,name:s.name,total_hours:s.totalHours||0})));
          setSubItems(prev=>[...prev,...inserted.map(s=>({id:s.id,jobId:s.job_id,name:s.name,totalHours:s.total_hours||0}))]);
        }
      } else {
        await db("PATCH","jobs",{job_no:data.jobNo,name:data.name,bg_color:data.bgColor,border_color:data.borderColor,text_color:data.textColor},`?id=eq.${data.id}`);
        setJobs(prev=>prev.map(j=>j.id===data.id?{...j,jobNo:data.jobNo,name:data.name,bgColor:data.bgColor,borderColor:data.borderColor,textColor:data.textColor}:j));
        const existing=subItems.filter(s=>s.jobId===data.id);
        const toDelete=existing.filter(s=>!data.subItems.find(ds=>ds.id===s.id));
        for (const s of toDelete) await db("DELETE","sub_items",null,`?id=eq.${s.id}`);
        setSubItems(prev=>prev.filter(s=>!toDelete.find(d=>d.id===s.id)));
        const toAdd=data.subItems.filter(s=>s.isNew&&s.name.trim());
        if (toAdd.length>0) {
          const inserted=await db("POST","sub_items",toAdd.map(s=>({job_id:data.id,name:s.name,total_hours:s.totalHours||0})));
          setSubItems(prev=>[...prev,...inserted.map(s=>({id:s.id,jobId:s.job_id,name:s.name,totalHours:s.total_hours||0}))]);
        }
        const toUpdate=data.subItems.filter(s=>!s.isNew&&s.name.trim());
        for (const s of toUpdate) {
          await db("PATCH","sub_items",{name:s.name,total_hours:s.totalHours||0},`?id=eq.${s.id}`);
          setSubItems(prev=>prev.map(si=>si.id===s.id?{...si,name:s.name,totalHours:s.totalHours||0}:si));
        }
      }
      setJobModal(null);
    } catch(e) { setError("Failed to save job."); }
    setSaving(false);
  }

  async function deleteJob(id) {
    setSaving(true);
    try {
      await db("DELETE","jobs",null,`?id=eq.${id}`);
      setJobs(prev=>prev.filter(j=>j.id!==id));
      setSubItems(prev=>prev.filter(s=>s.jobId!==id));
      setEntries(prev=>prev.filter(e=>e.jobId!==id));
      setJobModal(null);
    } catch(e) { setError("Failed to delete job."); }
    setSaving(false);
  }

  async function saveStaff(data) {
    setSaving(true);
    try {
      if (data.isNew) {
        const [newStaff]=await db("POST","staff",[{name:data.name}]);
        setStaff(prev=>[...prev,{id:newStaff.id,name:newStaff.name}]);
      } else {
        await db("PATCH","staff",{name:data.name},`?id=eq.${data.id}`);
        setStaff(prev=>prev.map(s=>s.id===data.id?{...s,name:data.name}:s));
      }
      setStaffModal(null);
    } catch(e) { setError("Failed to save staff."); }
    setSaving(false);
  }

  async function removeStaff(id) {
    setSaving(true);
    try {
      await db("DELETE","staff",null,`?id=eq.${id}`);
      setStaff(prev=>prev.filter(s=>s.id!==id));
      setEntries(prev=>prev.filter(e=>e.staffId!==id));
      setStaffModal(null);
    } catch(e) { setError("Failed to remove staff."); }
    setSaving(false);
  }

  function handleDragStart(e,entry) { dragEntry.current=entry; e.dataTransfer.effectAllowed="move"; }
  function handleDragOver(e,staffId,dateStr,slot) { if(isPast(dateStr))return; e.preventDefault(); setDropTarget({staffId,dateStr,slot}); }
  function handleDragLeave() { setDropTarget(null); }
  async function handleDrop(e,staffId,dateStr,slot) {
    e.preventDefault(); setDropTarget(null);
    const entry=dragEntry.current; if(!entry) return;
    if (isPast(dateStr)) return;
    if (entry.staffId===staffId&&entry.dateStr===dateStr&&entry.slot===slot) return;
    try {
      await db("PATCH","entries",{staff_id:staffId,date_str:dateStr,slot},`?id=eq.${entry.id}`);
      setEntries(prev=>prev.map(en=>en.id===entry.id?{...en,staffId,dateStr,slot}:en));
    } catch(e) { setError("Failed to move entry."); }
    dragEntry.current=null;
  }
  function handleDragEnd() { setDropTarget(null); dragEntry.current=null; }

  function nextPreset() { return JOB_COLOUR_PRESETS[jobs.length%JOB_COLOUR_PRESETS.length]; }

  if (loading) return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#F8FAFC",minHeight:"100vh"}}>
      <div style={{background:"#3D2E14",padding:"14px 24px",display:"flex",alignItems:"center",gap:14}}>
        <svg width="48" height="48" viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="none" stroke="#E8A030" strokeWidth="2.5"/><text x="24" y="29" textAnchor="middle" fontSize="15" fontWeight="700" fill="#F5C060">DJC</text></svg>
        <div><div style={{fontSize:20,fontWeight:700,color:"#FFF8EC"}}>DJC Joiner</div><div style={{fontSize:11,color:"#E8A030",letterSpacing:"2px",textTransform:"uppercase"}}>Consulting · Mentoring · Growth</div></div>
      </div>
      <Spinner/>
    </div>
  );

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#F8FAFC",minHeight:"100vh"}}>

      {/* Header */}
      <div style={{background:"#3D2E14",padding:"0 24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:14,paddingBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <svg width="48" height="48" viewBox="0 0 48 48">
              <circle cx="24" cy="24" r="22" fill="none" stroke="#E8A030" strokeWidth="2.5"/>
              <circle cx="24" cy="24" r="3" fill="#E8A030"/>
              <circle cx="24" cy="2" r="2.5" fill="#E8A030"/>
              <circle cx="24" cy="46" r="2.5" fill="#E8A030"/>
              <circle cx="2" cy="24" r="2.5" fill="#E8A030"/>
              <circle cx="46" cy="24" r="2.5" fill="#E8A030"/>
              <text x="24" y="29" textAnchor="middle" fontSize="15" fontWeight="700" fontFamily="'Segoe UI',system-ui,sans-serif" fill="#F5C060" letterSpacing="0.5">DJC</text>
            </svg>
            <div>
              <div style={{fontSize:20,fontWeight:700,color:"#FFF8EC",lineHeight:1.2}}>DJC Joiner</div>
              <div style={{fontSize:11,color:"#E8A030",letterSpacing:"2px",textTransform:"uppercase",marginTop:2}}>Consulting · Mentoring · Growth</div>
            </div>
            <div style={{width:1,height:36,background:"#E8A030",opacity:0.35,margin:"0 8px"}}/>
            <div style={{fontSize:14,color:"#FFF8EC",opacity:0.7}}>Production Schedule</div>
            {saving&&<div style={{fontSize:12,color:"#E8A030",marginLeft:8}}>Saving...</div>}
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setJobModal({isNew:true,jobNo:"",name:"",...nextPreset(),subItems:[]})}
              style={{padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",border:"1.5px solid #E8A030",background:"transparent",color:"#E8A030"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#E8A030";e.currentTarget.style.color="#3D2E14";}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#E8A030";}}>
              + Add Job
            </button>
            <button onClick={()=>setStaffModal({isNew:true,name:""})}
              style={{padding:"8px 16px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",border:"1.5px solid #E8A030",background:"#E8A030",color:"#3D2E14"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#F5C060";}}
              onMouseLeave={e=>{e.currentTarget.style.background="#E8A030";}}>
              + Add Staff
            </button>
          </div>
        </div>
        <div style={{display:"flex"}}>
          {[["schedule","📅 Schedule"],["summary","📋 Job Summary"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{padding:"9px 22px",fontSize:14,fontWeight:500,cursor:"pointer",background:"none",border:"none",borderBottom:tab===key?"2.5px solid #E8A030":"2.5px solid transparent",color:tab===key?"#E8A030":"rgba(255,248,236,0.55)",transition:"all 0.15s"}}>{label}</button>
          ))}
        </div>
      </div>

      {/* Error banner */}
      {error&&(
        <div style={{background:"#FEF2F2",border:"1px solid #FECACA",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <span style={{color:"#DC2626",fontSize:14}}>⚠ {error}</span>
          <button onClick={()=>setError(null)} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:16}}>×</button>
        </div>
      )}

      {/* Schedule Tab */}
      {tab==="schedule"&&(
        <div style={{padding:16}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",background:"#E2E8F0",borderRadius:8,padding:3,gap:2}}>
              {[[1,"1 Week"],[2,"2 Weeks"],[3,"3 Weeks"],[4,"4 Weeks"],["month","Month"]].map(([v,label])=>(
                <button key={v} onClick={()=>{if(v==="month"){setViewMode("month");}else{setViewMode("weeks");setViewWeeks(v);}}}
                  style={{padding:"5px 12px",borderRadius:6,border:"none",fontSize:13,fontWeight:500,cursor:"pointer",background:(v==="month"&&viewMode==="month")||(v===viewWeeks&&viewMode!=="month")?"#fff":"transparent",color:(v==="month"&&viewMode==="month")||(v===viewWeeks&&viewMode!=="month")?"#1E293B":"#64748B"}}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <button onClick={()=>navigate(-1)} style={{padding:"5px 11px",border:"1px solid #CBD5E1",borderRadius:7,background:"#fff",cursor:"pointer",fontSize:16,color:"#475569"}}>‹</button>
              <button onClick={goToday} style={{padding:"5px 14px",border:"1px solid #CBD5E1",borderRadius:7,background:"#fff",cursor:"pointer",fontSize:13,color:"#475569"}}>Today</button>
              <button onClick={()=>navigate(1)} style={{padding:"5px 11px",border:"1px solid #CBD5E1",borderRadius:7,background:"#fff",cursor:"pointer",fontSize:16,color:"#475569"}}>›</button>
            </div>
            <span style={{fontSize:13,color:"#64748B"}}>{formatDate(anchorDate)} – {formatDate(addDays(anchorDate,totalWeeks*7-3))}</span>
            <button onClick={loadAll} style={{marginLeft:"auto",padding:"5px 12px",border:"1px solid #CBD5E1",borderRadius:7,background:"#fff",cursor:"pointer",fontSize:12,color:"#64748B"}}>↻ Refresh</button>
          </div>

          {activeJobs.length>0&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              {activeJobs.map(j=>(
                <div key={j.id} onClick={()=>setJobModal({isNew:false,...j,subItems:subItems.filter(s=>s.jobId===j.id)})}
                  style={{background:j.bgColor,border:`1.5px solid ${j.borderColor}`,color:j.textColor,borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                  {j.jobNo} {j.name}
                </div>
              ))}
            </div>
          )}

          <div style={{fontSize:11,color:"#94A3B8",marginBottom:8}}>💡 Drag any job block to reassign it · Past date slots are locked</div>

          <div style={{overflowX:"auto",borderRadius:12,border:"1px solid #E2E8F0",background:"#fff"}}>
            <table style={{borderCollapse:"collapse",minWidth:"100%",tableLayout:"fixed"}}>
              <colgroup>
                <col style={{width:110}}/><col style={{width:44}}/>
                {visibleDays.map((_,i)=><col key={i} style={{width:118}}/>)}
              </colgroup>
              <thead>
                {totalWeeks>1&&(
                  <tr>
                    <td colSpan={2} style={{border:"1px solid #E2E8F0",background:"#F8FAFC"}}/>
                    {weekStarts.map((ws,wi)=>(
                      <td key={wi} colSpan={5} style={{border:"1px solid #E2E8F0",borderLeft:wi>0?"2px solid #94A3B8":"1px solid #E2E8F0",background:"#F1F5F9",padding:"5px 8px",fontSize:12,fontWeight:600,color:"#475569",textAlign:"center"}}>
                        Week of {formatDate(ws)}
                      </td>
                    ))}
                  </tr>
                )}
                <tr>
                  <th style={{border:"1px solid #E2E8F0",background:"#F8FAFC",padding:"8px 10px",fontSize:12,color:"#64748B",textAlign:"left",fontWeight:600}}>Staff</th>
                  <th style={{border:"1px solid #E2E8F0",background:"#F8FAFC",padding:"4px",fontSize:11,color:"#94A3B8",textAlign:"center"}}>Slot</th>
                  {visibleDays.map((d,i)=>{
                    const ds=isoDate(d); const isToday=ds===todayStr;
                    const weekIdx=Math.floor(i/5); const isWeekBound=d.getDay()===1&&weekIdx>0;
                    return (
                      <th key={i} style={{border:"1px solid #E2E8F0",borderLeft:isWeekBound?"2px solid #94A3B8":"1px solid #E2E8F0",background:isToday?"#DBEAFE":"#F8FAFC",padding:"6px 4px",fontSize:11,color:isToday?"#1D4ED8":isPast(ds)?"#CBD5E1":"#64748B",textAlign:"center",fontWeight:isToday?700:500}}>
                        <div>{d.toLocaleDateString("en-AU",{weekday:"short"})}</div>
                        <div style={{fontSize:12,fontWeight:600}}>{d.getDate()}</div>
                        <div style={{fontSize:10,opacity:0.8}}>{d.toLocaleDateString("en-AU",{month:"short"})}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {staff.length===0?(
                  <tr><td colSpan={visibleDays.length+2} style={{padding:40,textAlign:"center",color:"#94A3B8",fontSize:14}}>No staff yet — click "+ Add Staff" to get started</td></tr>
                ):staff.map((st,si)=>(
                  [0,1].map(slot=>(
                    <tr key={`${st.id}-${slot}`} style={{borderBottom:slot===1?"2px solid #CBD5E1":"none"}}>
                      {slot===0&&(
                        <td rowSpan={2} style={{border:"1px solid #E2E8F0",borderBottom:"2px solid #CBD5E1",padding:"6px 10px",verticalAlign:"middle",background:si%2===0?"#fff":"#FAFAFA"}}>
                          <div style={{fontWeight:600,fontSize:13,color:"#1E293B",marginBottom:2}}>{st.name}</div>
                          <button onClick={()=>setStaffModal({isNew:false,...st})} style={{fontSize:11,color:"#94A3B8",background:"none",border:"1px solid #E2E8F0",borderRadius:4,padding:"1px 6px",cursor:"pointer"}}>Edit</button>
                        </td>
                      )}
                      <td style={{border:"1px solid #E2E8F0",padding:"2px 4px",fontSize:10,color:"#94A3B8",textAlign:"center",background:si%2===0?"#fff":"#FAFAFA"}}>{slot===0?"S1":"S2"}</td>
                      {visibleDays.map((d,di)=>{
                        const ds=isoDate(d); const isToday=ds===todayStr;
                        const weekIdx=Math.floor(di/5); const isWeekBound=d.getDay()===1&&weekIdx>0;
                        const k=`${st.id}|${ds}|${slot}`;
                        const entry=entryMap[k];
                        const job=entry?jobs.find(j=>j.id===entry.jobId):null;
                        const subItem=entry&&entry.subItemId?subItems.find(s=>s.id===entry.subItemId):null;
                        const isDrop=dropTarget&&dropTarget.staffId===st.id&&dropTarget.dateStr===ds&&dropTarget.slot===slot&&!entry;
                        const isConflict=conflictKeys.has(k);
                        return (
                          <td key={di}
                            style={{border:"1px solid #E2E8F0",borderLeft:isWeekBound?"2px solid #94A3B8":"1px solid #E2E8F0",padding:3,verticalAlign:"top",background:isToday?"rgba(219,234,254,0.18)":si%2===0?"#fff":"#FAFAFA"}}
                            onDragOver={e=>handleDragOver(e,st.id,ds,slot)}
                            onDragLeave={handleDragLeave}
                            onDrop={e=>handleDrop(e,st.id,ds,slot)}>
                            {entry&&job
                              ?<JobBlock job={job} subItem={subItem} hours={entry.hours} entry={entry} conflict={isConflict} onClick={()=>openEditEntry(entry)} onDragStart={handleDragStart} onDragEnd={handleDragEnd}/>
                              :<EmptySlot onClick={()=>openNewEntry(st.id,ds,slot)} isDropTarget={isDrop} isPastDate={isPast(ds)}/>
                            }
                          </td>
                        );
                      })}
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Summary Tab */}
      {tab==="summary"&&(
        <div style={{padding:16,display:"flex",flexDirection:"column",gap:16}}>
          <SummarySection jobs={activeJobs} entries={entries} subItems={subItems} staff={staff} setJobModal={setJobModal} setEntryModal={setEntryModal} setTab={setTab} archived={false}/>
          {archivedJobs.length>0&&(
            <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginTop:8}}>
                <div style={{flex:1,height:1,background:"#E2E8F0"}}/>
                <span style={{fontSize:12,color:"#94A3B8",fontWeight:500,whiteSpace:"nowrap"}}>Archived Jobs (all entries &gt; 1 month ago)</span>
                <div style={{flex:1,height:1,background:"#E2E8F0"}}/>
              </div>
              <SummarySection jobs={archivedJobs} entries={entries} subItems={subItems} staff={staff} setJobModal={setJobModal} setEntryModal={setEntryModal} setTab={setTab} archived={true}/>
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {entryModal&&<EntryModal data={entryModal} staff={staff} jobs={activeJobs} subItems={subItems} onSave={saveEntry} onRemove={removeEntry} onClose={()=>setEntryModal(null)}/>}
      {jobModal&&<JobModal data={jobModal} onSave={saveJob} onDelete={deleteJob} onClose={()=>setJobModal(null)}/>}
      {staffModal&&<StaffModal data={staffModal} onSave={saveStaff} onRemove={removeStaff} onClose={()=>setStaffModal(null)}/>}
      {conflictAlert&&(
        <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.45)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:14,maxWidth:420,width:"100%",padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
            <div style={{fontSize:16,fontWeight:600,color:"#1E293B",marginBottom:12}}>⚠ Scheduling Conflict</div>
            <div style={{fontSize:14,color:"#475569",marginBottom:20,lineHeight:1.6}}>{conflictAlert.message}</div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <Btn variant="ghost" onClick={conflictAlert.onCancel}>Go Back</Btn>
              <Btn variant="danger" onClick={conflictAlert.onConfirm}>Schedule Anyway</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Summary Section ───────────────────────────────────────────

function SummarySection({jobs,entries,subItems,staff,setJobModal,setEntryModal,setTab,archived}) {
  return (
    <>
      {jobs.map(job=>{
        const jobEntries=entries.filter(e=>e.jobId===job.id);
        const jobSubs=subItems.filter(s=>s.jobId===job.id);
        const dates=jobEntries.map(e=>e.dateStr).sort();
        const totalHours=jobEntries.reduce((a,e)=>a+e.hours,0);
        const commDate=dates[0]?parseISO(dates[0]):null;
        const lastDate=dates[dates.length-1]?parseISO(dates[dates.length-1]):null;
        const generalEntries=jobEntries.filter(e=>!e.subItemId);
        return (
          <div key={job.id} style={{background:"#fff",borderRadius:14,border:`1.5px solid ${job.borderColor}`,overflow:"hidden",opacity:archived?0.75:1}}>
            <div style={{background:job.bgColor,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:job.textColor}}>{job.jobNo} — {job.name}</div>
                <div style={{fontSize:12,color:job.textColor,opacity:0.8,marginTop:2}}>
                  {commDate?<>From {formatDateLong(commDate)} · Last {formatDateLong(lastDate)} · </>:"Not yet scheduled · "}
                  <strong>{totalHours}h</strong> scheduled {archived&&<em>(archived)</em>}
                </div>
              </div>
              <button style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",border:`1px solid ${job.borderColor}`,background:"#fff",color:job.textColor}}
                onClick={()=>setJobModal({isNew:false,...job,subItems:jobSubs})}>Edit Job</button>
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#F8FAFC",borderBottom:"1px solid #E2E8F0"}}>
                  {["Joinery Item","Budget","Scheduled","Remaining","Dates","Staff",""].map((h,i)=>(
                    <th key={i} style={{padding:"7px 12px",textAlign:"left",fontWeight:600,color:"#64748B",fontSize:12}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobSubs.map((si,rowi)=>{
                  const siEntries=jobEntries.filter(e=>e.subItemId===si.id);
                  const siDates=siEntries.map(e=>e.dateStr).sort();
                  const scheduledHours=siEntries.reduce((a,e)=>a+e.hours,0);
                  const remaining=(si.totalHours||0)-scheduledHours;
                  const assignedStaff=[...new Set(siEntries.map(e=>e.staffId))].map(id=>staff.find(s=>s.id===id)?.name).filter(Boolean).join(", ");
                  let dateDisplay;
                  if(!siDates.length) dateDisplay=<em style={{color:"#94A3B8"}}>Not yet scheduled</em>;
                  else if(siDates.length===1) dateDisplay=formatDate(parseISO(siDates[0]));
                  else { const d1=parseISO(siDates[0]),d2=parseISO(siDates[siDates.length-1]); dateDisplay=`${formatDate(d1)} → ${formatDate(d2)} (${Math.round((d2-d1)/86400000)}d)`; }
                  return (
                    <tr key={si.id} style={{background:rowi%2===0?"#fff":"#FAFAFA",borderBottom:"1px solid #F1F5F9"}}>
                      <td style={{padding:"7px 12px",fontWeight:500,color:"#1E293B"}}>{si.name}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{si.totalHours?`${si.totalHours}h`:<em style={{color:"#94A3B8"}}>—</em>}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{scheduledHours>0?`${scheduledHours}h`:"—"}</td>
                      <td style={{padding:"7px 12px"}}>{si.totalHours>0?<span style={{color:remaining<0?"#EF4444":remaining===0?"#22C55E":"#F59E0B",fontWeight:600}}>{remaining>0?`${remaining}h left`:remaining===0?"✓ Done":`${Math.abs(remaining)}h over`}</span>:"—"}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{dateDisplay}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{assignedStaff||<em style={{color:"#94A3B8"}}>—</em>}</td>
                      <td style={{padding:"7px 12px"}}>{!archived&&<button style={{fontSize:11,color:"#3B82F6",background:"none",border:"1px solid #BFDBFE",borderRadius:6,padding:"3px 10px",cursor:"pointer"}} onClick={()=>{setEntryModal({mode:"new",staffId:"",dateStr:todayStr,slot:0,jobId:job.id,subItemId:si.id,hours:Math.min(8,remaining>0?remaining:8),autoFill:remaining>0,totalHours:remaining>0?remaining:8});setTab("schedule");}}>+ Schedule</button>}</td>
                    </tr>
                  );
                })}
                {generalEntries.length>0&&(
                  <tr style={{background:"#FFF7ED",borderTop:"1px solid #FED7AA"}}>
                    <td style={{padding:"7px 12px",fontWeight:500,color:"#92400E"}}>General (no item)</td>
                    <td style={{padding:"7px 12px"}}>—</td>
                    <td style={{padding:"7px 12px",color:"#92400E"}}>{generalEntries.reduce((a,e)=>a+e.hours,0)}h</td>
                    <td>—</td>
                    <td style={{padding:"7px 12px",color:"#92400E"}}>{(()=>{const gd=generalEntries.map(e=>e.dateStr).sort();if(gd.length===1)return formatDate(parseISO(gd[0]));return `${formatDate(parseISO(gd[0]))} → ${formatDate(parseISO(gd[gd.length-1]))}`;})()}</td>
                    <td style={{padding:"7px 12px",color:"#92400E"}}>{[...new Set(generalEntries.map(e=>e.staffId))].map(id=>staff.find(s=>s.id===id)?.name).filter(Boolean).join(", ")}</td>
                    <td/>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

// ── Entry Modal ───────────────────────────────────────────────

function EntryModal({data,staff,jobs,subItems,onSave,onRemove,onClose}) {
  const [form,setForm]=useState(()=>{
    const jobSubs=subItems.filter(s=>s.jobId===data.jobId);
    const defaultSub=data.subItemId||(jobSubs[0]?.id||"");
    const defaultHours=jobSubs[0]?.totalHours||0;
    return {...data,subItemId:defaultSub,totalHours:data.totalHours||defaultHours};
  });
  const [autoFill,setAutoFill]=useState(data.autoFill!==false);
  function set(k,v){setForm(f=>({...f,[k]:v}));}
  const jobSubs=subItems.filter(s=>s.jobId===form.jobId);
  const selectedSub=jobSubs.find(s=>s.id===form.subItemId);
  const totalHours=form.totalHours||selectedSub?.totalHours||0;
  function handleJobChange(jobId){const subs=subItems.filter(s=>s.jobId===jobId);const first=subs[0];setForm(f=>({...f,jobId,subItemId:first?.id||"",totalHours:first?.totalHours||0}));}
  function handleSubChange(subItemId){const sub=jobSubs.find(s=>s.id===subItemId);setForm(f=>({...f,subItemId,totalHours:sub?.totalHours||f.totalHours}));}
  const preview=useMemo(()=>{if(!autoFill||!form.dateStr||!totalHours)return[];return buildAutoFill(form.dateStr,totalHours);},[autoFill,form.dateStr,totalHours]);
  function handleSave(){if(!form.jobId)return;if(autoFill&&preview.length>0)onSave(form,preview.map(p=>({dateStr:p.dateStr,hours:p.hours})));else onSave(form,null);}
  return (
    <Modal title={form.mode==="new"?"New Schedule Entry":"Edit Schedule Entry"} onClose={onClose} small>
      <Sel label="Staff Member" value={form.staffId} onChange={e=>set("staffId",e.target.value)}>
        <option value="">— Select staff —</option>
        {staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </Sel>
      <Inp label="Start Date" type="date" value={form.dateStr} min={todayStr} onChange={e=>set("dateStr",e.target.value)}/>
      <Sel label="Slot" value={form.slot} onChange={e=>set("slot",Number(e.target.value))}>
        <option value={0}>Slot 1</option><option value={1}>Slot 2</option>
      </Sel>
      <Sel label="Job" value={form.jobId} onChange={e=>handleJobChange(e.target.value)}>
        <option value="">— Select job —</option>
        {jobs.map(j=><option key={j.id} value={j.id}>{j.jobNo} – {j.name}</option>)}
      </Sel>
      {form.jobId&&(
        <Sel label="Joinery Item" value={form.subItemId||""} onChange={e=>handleSubChange(e.target.value)}>
          {jobSubs.map(s=><option key={s.id} value={s.id}>{s.name}{s.totalHours?` (${s.totalHours}h budget)`:""}</option>)}
          <option value="">General / no item</option>
        </Sel>
      )}
      {form.mode==="new"&&(
        <div style={{marginBottom:10}}>
          <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#334155"}}>
            <input type="checkbox" checked={autoFill} onChange={e=>setAutoFill(e.target.checked)} style={{width:15,height:15}}/>
            Auto-fill consecutive days at 8h/day
          </label>
        </div>
      )}
      {autoFill&&form.mode==="new"?(
        <div style={{marginBottom:10}}>
          <div style={{fontSize:12,color:"#64748B",marginBottom:3,fontWeight:500}}>Total Hours to Schedule</div>
          <input type="number" min={1} max={999} step={1} value={form.totalHours||""} onChange={e=>set("totalHours",Number(e.target.value))} placeholder={totalHours?`${totalHours} (from budget)`:"Enter hours"} style={{width:"100%",padding:"7px 10px",border:"1px solid #CBD5E1",borderRadius:8,fontSize:14,boxSizing:"border-box",outline:"none"}}/>
          {preview.length>0&&(
            <div style={{marginTop:8,background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:12,fontWeight:600,color:"#15803D",marginBottom:5}}>📅 {preview.length} day{preview.length>1?"s":""} · {preview.reduce((a,p)=>a+p.hours,0)}h total</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                {preview.map((p,i)=><span key={i} style={{fontSize:11,background:"#DCFCE7",color:"#166534",borderRadius:4,padding:"2px 6px"}}>{formatDate(parseISO(p.dateStr))} · {p.hours}h</span>)}
              </div>
            </div>
          )}
        </div>
      ):(
        <Inp label="Hours" type="number" min={0.5} max={12} step={0.5} value={form.hours} onChange={e=>set("hours",Number(e.target.value))}/>
      )}
      <div style={{display:"flex",gap:8,justifyContent:"space-between",marginTop:10}}>
        <div>{form.mode==="edit"&&<Btn variant="danger" onClick={()=>onRemove(form.id)}>Remove</Btn>}</div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave}>{autoFill&&preview.length>0?`Schedule ${preview.length} days`:"Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Job Modal ─────────────────────────────────────────────────

function JobModal({data,onSave,onDelete,onClose}) {
  const [form,setForm]=useState({...data,subItems:data.subItems.map(s=>({...s}))});
  function set(k,v){setForm(f=>({...f,[k]:v}));}
  function addSubItem(){setForm(f=>({...f,subItems:[...f.subItems,{id:`new_${Date.now()}`,isNew:true,name:"",totalHours:0}]}));}
  function setSubItem(idx,field,value){setForm(f=>{const s=[...f.subItems];s[idx]={...s[idx],[field]:value};return{...f,subItems:s};});}
  function removeSubItem(idx){setForm(f=>{const s=[...f.subItems];s.splice(idx,1);return{...f,subItems:s};});}
  return (
    <Modal title={form.isNew?"New Job":"Edit Job"} wide onClose={onClose}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div>
          <Inp label="Job Number" value={form.jobNo} onChange={e=>set("jobNo",e.target.value)}/>
          <Inp label="Job Name" value={form.name} onChange={e=>set("name",e.target.value)}/>
          <ColorPicker label="Background Colour" value={form.bgColor} onChange={v=>set("bgColor",v)}/>
          <ColorPicker label="Border Colour" value={form.borderColor} onChange={v=>set("borderColor",v)}/>
          <ColorPicker label="Text Colour" value={form.textColor} onChange={v=>set("textColor",v)}/>
        </div>
        <div>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:12,color:"#64748B",marginBottom:6,fontWeight:500}}>Preview</div>
            <div style={{background:form.bgColor,border:`1.5px solid ${form.borderColor}`,borderRadius:8,padding:"10px 14px"}}>
              <div style={{fontSize:11,fontWeight:700,color:form.textColor}}>{form.jobNo} · {form.name}</div>
              <div style={{fontSize:11,fontWeight:400,color:form.textColor,margin:"3px 0"}}>Example Item Name</div>
              <div style={{fontSize:10,color:form.textColor,opacity:0.7}}>8h</div>
            </div>
          </div>
          <div style={{fontSize:12,color:"#64748B",marginBottom:6,fontWeight:500}}>Joinery Items <span style={{fontWeight:400,color:"#94A3B8"}}>(name + hour budget)</span></div>
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {form.subItems.map((si,i)=>(
              <div key={si.id} style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={si.name} onChange={e=>setSubItem(i,"name",e.target.value)} placeholder="Item name" style={{flex:2,padding:"6px 8px",border:"1px solid #CBD5E1",borderRadius:7,fontSize:13,outline:"none"}}/>
                <input type="number" value={si.totalHours||""} onChange={e=>setSubItem(i,"totalHours",Number(e.target.value))} placeholder="Hrs" min={0} step={1} style={{width:60,padding:"6px 8px",border:"1px solid #CBD5E1",borderRadius:7,fontSize:13,outline:"none"}}/>
                <button onClick={()=>removeSubItem(i)} style={{background:"none",border:"1px solid #FCA5A5",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:13}}>×</button>
              </div>
            ))}
            <Btn variant="ghost" onClick={addSubItem} style={{alignSelf:"flex-start",fontSize:12}}>+ Add Item</Btn>
          </div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:20,borderTop:"1px solid #F1F5F9",paddingTop:16}}>
        <div>{!form.isNew&&<Btn variant="danger" onClick={()=>onDelete(form.id)}>Delete Job</Btn>}</div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={()=>{if(!form.jobNo||!form.name)return;onSave(form);}}>Save Job</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Staff Modal ───────────────────────────────────────────────

function StaffModal({data,onSave,onRemove,onClose}) {
  const [form,setForm]=useState({...data});
  return (
    <Modal title={form.isNew?"New Staff Member":"Edit Staff Member"} onClose={onClose} small>
      <Inp label="Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
        <div>{!form.isNew&&<Btn variant="danger" onClick={()=>onRemove(form.id)}>Remove Staff</Btn>}</div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={()=>{if(form.name.trim())onSave(form);}}>Save</Btn>
        </div>
      </div>
    </Modal>
  );
}
