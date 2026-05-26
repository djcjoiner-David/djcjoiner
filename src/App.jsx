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

function buildAutoFill(startDateStr, totalHours, productiveHoursPerDay) {
  if (!totalHours||totalHours<=0) return [];
  const ph = productiveHoursPerDay||8;
  const days=[]; let remaining=totalHours; let cur=parseISO(startDateStr);
  while (remaining>0) {
    if (!isWeekend(cur)) {
      const deducted=Math.min(ph,remaining);
      days.push({dateStr:isoDate(cur),hours:8,deducted});
      remaining-=ph;
    }
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
        <input type="color" value={value} onChange={e=>onChange(e.target.value)} style={{width:32,height:32,padding:2,border:"1px solid #CBD5E1",borderRadius:6,cursor:"pointer"}}/>
        <input type="text" value={value} onChange={e=>onChange(e.target.value)} style={{flex:1,padding:"5px 8px",border:"1px solid #CBD5E1",borderRadius:6,fontSize:12,fontFamily:"monospace"}}/>
      </div>
    </div>
  );
}

function Modal({title,onClose,children,wide,small}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:wide?820:small?420:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
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

function Spinner({text="Loading..."}) {
  return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"60vh",flexDirection:"column",gap:16}}>
      <div style={{width:40,height:40,border:"4px solid #E2E8F0",borderTop:"4px solid #E8A030",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/>
      <div style={{color:"#64748B",fontSize:14}}>{text}</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Job Block ─────────────────────────────────────────────────

function JobBlock({job,subItem,hours,productiveHours,entry,onClick,onDragStart,onDragEnd,conflict,canEdit}) {
  return (
    <div draggable={canEdit} onDragStart={canEdit?e=>onDragStart(e,entry):undefined} onDragEnd={canEdit?onDragEnd:undefined} onClick={canEdit?onClick:undefined}
      style={{background:conflict?"#FEF2F2":job.bgColor,border:conflict?"2px solid #EF4444":`1.5px solid ${job.borderColor}`,borderRadius:6,padding:"3px 6px",cursor:canEdit?"grab":"default",minHeight:44,display:"flex",flexDirection:"column",justifyContent:"center",overflow:"hidden",userSelect:"none",position:"relative"}}>
      {conflict&&<div style={{position:"absolute",top:2,right:4,fontSize:10,color:"#EF4444",fontWeight:700}}>⚠ CONFLICT</div>}
      <div style={{fontSize:11,fontWeight:700,color:conflict?"#EF4444":job.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{job.jobNo} · {job.name}</div>
      <div style={{fontSize:11,fontWeight:400,color:conflict?"#EF4444":job.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{subItem?subItem.name:"General"}</div>
      <div style={{fontSize:10,color:conflict?"#EF4444":job.textColor,opacity:0.7}}>
        {hours}h {productiveHours&&productiveHours<8?<span>· {productiveHours}h eff</span>:""}
      </div>
    </div>
  );
}

// ── Misc Block ────────────────────────────────────────────────

function MiscBlock({note,hours,entry,onClick,onDragStart,onDragEnd,conflict,canEdit}) {
  return (
    <div draggable={canEdit} onDragStart={canEdit?e=>onDragStart(e,entry):undefined} onDragEnd={canEdit?onDragEnd:undefined} onClick={canEdit?onClick:undefined}
      style={{background:conflict?"#FEF2F2":"#F1F5F9",border:conflict?"2px solid #EF4444":"1.5px solid #94A3B8",borderRadius:6,padding:"3px 6px",cursor:canEdit?"grab":"default",minHeight:44,display:"flex",flexDirection:"column",justifyContent:"center",overflow:"hidden",userSelect:"none",position:"relative"}}>
      {conflict&&<div style={{position:"absolute",top:2,right:4,fontSize:10,color:"#EF4444",fontWeight:700}}>⚠ CONFLICT</div>}
      <div style={{fontSize:11,fontWeight:700,color:conflict?"#EF4444":"#475569",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>📌 {note}</div>
      <div style={{fontSize:10,color:conflict?"#EF4444":"#64748B",opacity:0.8}}>{hours}h</div>
    </div>
  );
}

function EmptySlot({onClick,isDropTarget,isPastDate,canEdit}) {
  if (isPastDate||!canEdit) return <div style={{minHeight:44,background:"#F8FAFC",borderRadius:6,border:"1px solid #F1F5F9"}}/>;
  return (
    <div onClick={onClick}
      style={{border:isDropTarget?"2px dashed #3B82F6":"1.5px dashed #CBD5E1",borderRadius:6,minHeight:44,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:isDropTarget?"#3B82F6":"#CBD5E1",fontSize:16,background:isDropTarget?"rgba(59,130,246,0.06)":"transparent",transition:"all 0.12s"}}
      onMouseEnter={e=>{if(!isDropTarget){e.currentTarget.style.borderColor="#94A3B8";e.currentTarget.style.color="#94A3B8";}}}
      onMouseLeave={e=>{if(!isDropTarget){e.currentTarget.style.borderColor="#CBD5E1";e.currentTarget.style.color="#CBD5E1";}}}>
      {isDropTarget?"↓":"+"}
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────

function LoginScreen({onLogin}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    if (!email||!password){setError("Please enter your email and password.");return;}
    setLoading(true);setError("");
    try {
      const users=await db("GET","user_roles","",`?email=eq.${encodeURIComponent(email.toLowerCase().trim())}`);
      if (!users||users.length===0){setError("No account found for this email address.");setLoading(false);return;}
      const user=users[0];
      if (password!==user.password){setError("Incorrect password.");setLoading(false);return;}
      sessionStorage.setItem("djc_user",JSON.stringify({email:user.email,role:user.role,name:user.name,id:user.id}));
      onLogin({email:user.email,role:user.role,name:user.name,id:user.id});
    } catch(err){setError("Login failed. Please try again.");}
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",display:"flex",flexDirection:"column"}}>
      <div style={{background:"#3D2E14",padding:"16px 24px",display:"flex",alignItems:"center",gap:14}}>
        <img src="/logo.jpg" alt="Logo" style={{height:44,maxWidth:120,objectFit:"contain"}}/>
        <div>
          <div style={{fontSize:20,fontWeight:700,color:"#E8A030"}}>DJC Joiner</div>
          <div style={{fontSize:11,color:"#E8A030",letterSpacing:"2px",textTransform:"uppercase"}}>Consulting · Mentoring · Growth</div>
        </div>
      </div>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
        <div style={{background:"#fff",borderRadius:16,padding:36,width:"100%",maxWidth:380,boxShadow:"0 4px 24px rgba(0,0,0,0.08)"}}>
          <div style={{textAlign:"center",marginBottom:28}}>
            <div style={{fontSize:22,fontWeight:700,color:"#1E293B",marginBottom:6}}>Production Schedule</div>
            <div style={{fontSize:14,color:"#64748B"}}>Sign in to your account</div>
          </div>
          <form onSubmit={handleLogin}>
            <Inp label="Email address" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/>
            <Inp label="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"/>
            {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"8px 12px",fontSize:13,color:"#DC2626",marginBottom:12}}>{error}</div>}
            <button type="submit" disabled={loading}
              style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:"#3D2E14",color:"#E8A030",fontSize:15,fontWeight:600,cursor:loading?"not-allowed":"pointer",marginTop:4}}>
              {loading?"Signing in...":"Sign In"}
            </button>
          </form>
          <div style={{marginTop:20,padding:14,background:"#F8FAFC",borderRadius:8,fontSize:12,color:"#64748B",textAlign:"center"}}>Contact your administrator to get access</div>
        </div>
      </div>
    </div>
  );
}

// ── User Management Modal ─────────────────────────────────────

function UserManagementModal({onClose}) {
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({name:"",email:"",password:"",role:"staff"});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");

  useEffect(()=>{db("GET","user_roles","","?order=created_at").then(data=>{setUsers(data);setLoading(false);});},[]);

  async function addUser() {
    if (!form.name||!form.email||!form.password){setError("All fields are required.");return;}
    setSaving(true);setError("");
    try {
      const [newUser]=await db("POST","user_roles",[{name:form.name,email:form.email.toLowerCase().trim(),password:form.password,role:form.role}]);
      setUsers(prev=>[...prev,newUser]);
      setForm({name:"",email:"",password:"",role:"staff"});
    } catch(e){setError("Failed to add user. Email may already exist.");}
    setSaving(false);
  }

  async function removeUser(id) {
    if (!window.confirm("Remove this user?")) return;
    await db("DELETE","user_roles",null,`?id=eq.${id}`);
    setUsers(prev=>prev.filter(u=>u.id!==id));
  }

  async function changeRole(id,role) {
    await db("PATCH","user_roles",{role},`?id=eq.${id}`);
    setUsers(prev=>prev.map(u=>u.id===id?{...u,role}:u));
  }

  const roleColors={admin:{bg:"#FEF3C7",color:"#92400E"},manager:{bg:"#DBEAFE",color:"#1D4ED8"},staff:{bg:"#F0FDF4",color:"#15803D"}};

  return (
    <Modal title="👥 User Management" wide onClose={onClose}>
      {loading?<Spinner text="Loading users..."/>:(
        <>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:24}}>
            <thead>
              <tr style={{background:"#F8FAFC",borderBottom:"1px solid #E2E8F0"}}>
                {["Name","Email","Role",""].map((h,i)=>(
                  <th key={i} style={{padding:"8px 12px",textAlign:"left",fontWeight:600,color:"#64748B",fontSize:12}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u,i)=>(
                <tr key={u.id} style={{background:i%2===0?"#fff":"#FAFAFA",borderBottom:"1px solid #F1F5F9"}}>
                  <td style={{padding:"8px 12px",fontWeight:500,color:"#1E293B"}}>{u.name}</td>
                  <td style={{padding:"8px 12px",color:"#475569"}}>{u.email}</td>
                  <td style={{padding:"8px 12px"}}>
                    <select value={u.role} onChange={e=>changeRole(u.id,e.target.value)}
                      style={{padding:"3px 8px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:12,background:roleColors[u.role]?.bg,color:roleColors[u.role]?.color,fontWeight:600}}>
                      <option value="admin">Admin</option>
                      <option value="manager">Manager</option>
                      <option value="staff">Staff</option>
                    </select>
                  </td>
                  <td style={{padding:"8px 12px"}}>
                    <button onClick={()=>removeUser(u.id)} style={{background:"none",border:"1px solid #FECACA",color:"#EF4444",borderRadius:6,padding:"3px 8px",cursor:"pointer",fontSize:12}}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{borderTop:"1px solid #E2E8F0",paddingTop:16}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1E293B",marginBottom:12}}>Add New User</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Inp label="Full Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Tom B"/>
              <Inp label="Email" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="tom@example.com"/>
              <Inp label="Password" type="text" value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder="Set a password"/>
              <Sel label="Role" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value}))}>
                <option value="admin">Admin — full access</option>
                <option value="manager">Manager — edit jobs & entries</option>
                <option value="staff">Staff — view only</option>
              </Sel>
            </div>
            {error&&<div style={{background:"#FEF2F2",border:"1px solid #FECACA",borderRadius:8,padding:"8px 12px",fontSize:13,color:"#DC2626",marginBottom:10}}>{error}</div>}
            <Btn variant="primary" onClick={addUser} style={{marginTop:4}}>{saving?"Adding...":"Add User"}</Btn>
          </div>
          <div style={{marginTop:16,padding:12,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,fontSize:12,color:"#92400E"}}>
            <strong>Role permissions:</strong> Admin = full access · Manager = add/edit jobs & entries · Staff = view only
          </div>
        </>
      )}
    </Modal>
  );
}

// ── Main App ──────────────────────────────────────────────────

export default function DJCJoiner() {
  const [currentUser,setCurrentUser]=useState(()=>{
    try{const u=sessionStorage.getItem("djc_user");return u?JSON.parse(u):null;}catch{return null;}
  });
  if (!currentUser) return <LoginScreen onLogin={setCurrentUser}/>;
  return <MainApp currentUser={currentUser} onLogout={()=>{sessionStorage.removeItem("djc_user");setCurrentUser(null);}}/>;
}

function MainApp({currentUser,onLogout}) {
  const isAdmin=currentUser.role==="admin";
  const isManager=currentUser.role==="admin"||currentUser.role==="manager";
  const canEdit=isManager;

  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [tab,setTab]=useState("schedule");
  const [viewWeeks,setViewWeeks]=useState(2);
  const [viewMode,setViewMode]=useState("weeks");
  const [anchorDate,setAnchorDate]=useState(()=>mondayOf(TODAY));

  const [staff,setStaff]=useState([]);
  const [jobs,setJobs]=useState([]);
  const [subItems,setSubItems]=useState([]);
  const [entries,setEntries]=useState([]);

  const [jobModal,setJobModal]=useState(null);
  const [entryModal,setEntryModal]=useState(null);
  const [staffModal,setStaffModal]=useState(null);
  const [conflictAlert,setConflictAlert]=useState(null);
  const [userMgmtOpen,setUserMgmtOpen]=useState(false);
  const [error,setError]=useState(null);

  const dragEntry=useRef(null);
  const [dropTarget,setDropTarget]=useState(null);

  const loadAll=useCallback(async()=>{
    try {
      setLoading(true);
      const [staffData,jobsData,subData,entriesData]=await Promise.all([
        db("GET","staff","","?order=created_at"),
        db("GET","jobs","","?order=created_at"),
        db("GET","sub_items","","?order=created_at"),
        db("GET","entries","","?order=created_at"),
      ]);
      setStaff(staffData.map(s=>({id:s.id,name:s.name,productiveHours:s.productive_hours||8})));
      setJobs(jobsData.map(j=>({id:j.id,jobNo:j.job_no,name:j.name,bgColor:j.bg_color,borderColor:j.border_color,textColor:j.text_color})));
      setSubItems(subData.map(s=>({id:s.id,jobId:s.job_id,name:s.name,totalHours:s.total_hours||0})));
      setEntries(entriesData.map(e=>({id:e.id,staffId:e.staff_id,jobId:e.job_id,subItemId:e.sub_item_id,dateStr:e.date_str,slot:e.slot,hours:e.hours,miscNote:e.misc_note||null})));
    } catch(e){setError("Could not connect to database.");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);

  const threshold=oneMonthAgo();
  const {activeJobs,archivedJobs}=useMemo(()=>{
    const active=[],archived=[];
    for (const job of jobs){
      const je=entries.filter(e=>e.jobId===job.id);
      if(!je.length){active.push(job);continue;}
      const maxDate=je.map(e=>e.dateStr).sort().reverse()[0];
      if(maxDate<threshold)archived.push(job);else active.push(job);
    }
    return {activeJobs:active,archivedJobs:archived};
  },[jobs,entries,threshold]);

  const visibleDays=useMemo(()=>{
    const days=[];const weeks=viewMode==="month"?4:viewWeeks;
    for(let w=0;w<weeks;w++)for(let d=0;d<5;d++)days.push(addDays(anchorDate,w*7+d));
    return days;
  },[anchorDate,viewWeeks,viewMode]);

  const totalWeeks=viewMode==="month"?4:viewWeeks;
  const weekStarts=Array.from({length:totalWeeks},(_,i)=>addDays(anchorDate,i*7));

  const {entryMap,conflictKeys}=useMemo(()=>{
    const map={},counts={};
    for(const e of entries){const k=`${e.staffId}|${e.dateStr}|${e.slot}`;counts[k]=(counts[k]||0)+1;map[k]=e;}
    return {entryMap:map,conflictKeys:new Set(Object.keys(counts).filter(k=>counts[k]>1))};
  },[entries]);

  function navigate(dir){const w=viewMode==="month"?4:viewWeeks;setAnchorDate(d=>addDays(d,dir*w*7));}
  function goToday(){setAnchorDate(mondayOf(TODAY));}

  function openNewEntry(staffId,dateStr,slot){
    if(!canEdit||isPast(dateStr))return;
    setEntryModal({mode:"new",staffId,dateStr,slot,jobId:"",subItemId:"",hours:8,autoFill:true,entryType:"job",miscNote:""});
  }
  function openEditEntry(entry){
    if(!canEdit)return;
    setEntryModal({mode:"edit",...entry,autoFill:false,entryType:entry.miscNote?"misc":"job"});
  }

  async function saveEntry(data,extraEntries){
    setSaving(true);
    try{
      if(data.mode==="new"){
        const all=extraEntries&&extraEntries.length>0?extraEntries:[{dateStr:data.dateStr,hours:data.hours}];
        const valid=all.filter(p=>!isPast(p.dateStr));
        const conflicts=valid.filter(p=>!!entryMap[`${data.staffId}|${p.dateStr}|${data.slot}`]);
        const buildRows=(items)=>items.map(({dateStr,hours})=>({
          staff_id:data.staffId,
          job_id:data.entryType==="misc"?null:data.jobId,
          sub_item_id:data.entryType==="misc"?null:data.subItemId||null,
          date_str:dateStr,slot:data.slot,hours,
          misc_note:data.entryType==="misc"?data.miscNote:null
        }));
        if(conflicts.length>0){
          setSaving(false);
          setConflictAlert({
            message:`⚠ ${conflicts.length} date${conflicts.length>1?"s":""} already have an entry in that slot. They will be shown in red.`,
            onConfirm:async()=>{
              setSaving(true);
              const inserted=await db("POST","entries",buildRows(valid));
              setEntries(prev=>[...prev,...inserted.map(e=>({id:e.id,staffId:e.staff_id,jobId:e.job_id,subItemId:e.sub_item_id,dateStr:e.date_str,slot:e.slot,hours:e.hours,miscNote:e.misc_note||null}))]);
              setConflictAlert(null);setEntryModal(null);setTab("schedule");setSaving(false);
            },
            onCancel:()=>setConflictAlert(null),
          });
          return;
        }
        const inserted=await db("POST","entries",buildRows(valid));
        setEntries(prev=>[...prev,...inserted.map(e=>({id:e.id,staffId:e.staff_id,jobId:e.job_id,subItemId:e.sub_item_id,dateStr:e.date_str,slot:e.slot,hours:e.hours,miscNote:e.misc_note||null}))]);
      } else {
        await db("PATCH","entries",{
          staff_id:data.staffId,
          job_id:data.entryType==="misc"?null:data.jobId,
          sub_item_id:data.entryType==="misc"?null:data.subItemId||null,
          date_str:data.dateStr,slot:data.slot,hours:data.hours,
          misc_note:data.entryType==="misc"?data.miscNote:null
        },`?id=eq.${data.id}`);
        setEntries(prev=>prev.map(e=>e.id===data.id?{...e,staffId:data.staffId,jobId:data.entryType==="misc"?null:data.jobId,subItemId:data.entryType==="misc"?null:data.subItemId||null,dateStr:data.dateStr,slot:data.slot,hours:data.hours,miscNote:data.entryType==="misc"?data.miscNote:null}:e));
      }
      setEntryModal(null);setTab("schedule");
    }catch(e){setError("Failed to save entry.");}
    setSaving(false);
  }

  async function removeEntry(id){
    setSaving(true);
    try{await db("DELETE","entries",null,`?id=eq.${id}`);setEntries(prev=>prev.filter(e=>e.id!==id));setEntryModal(null);}
    catch(e){setError("Failed to remove entry.");}
    setSaving(false);
  }

  async function saveJob(data){
    setSaving(true);
    try{
      if(data.isNew){
        const [newJob]=await db("POST","jobs",[{job_no:data.jobNo,name:data.name,bg_color:data.bgColor,border_color:data.borderColor,text_color:data.textColor}]);
        setJobs(prev=>[...prev,{id:newJob.id,jobNo:newJob.job_no,name:newJob.name,bgColor:newJob.bg_color,borderColor:newJob.border_color,textColor:newJob.text_color}]);
        const validSubs=data.subItems.filter(s=>s.name.trim());
        if(validSubs.length>0){const inserted=await db("POST","sub_items",validSubs.map(s=>({job_id:newJob.id,name:s.name,total_hours:s.totalHours||0})));setSubItems(prev=>[...prev,...inserted.map(s=>({id:s.id,jobId:s.job_id,name:s.name,totalHours:s.total_hours||0}))]);}
      }else{
        await db("PATCH","jobs",{job_no:data.jobNo,name:data.name,bg_color:data.bgColor,border_color:data.borderColor,text_color:data.textColor},`?id=eq.${data.id}`);
        setJobs(prev=>prev.map(j=>j.id===data.id?{...j,jobNo:data.jobNo,name:data.name,bgColor:data.bgColor,borderColor:data.borderColor,textColor:data.textColor}:j));
        const existing=subItems.filter(s=>s.jobId===data.id);
        const toDelete=existing.filter(s=>!data.subItems.find(ds=>ds.id===s.id));
        for(const s of toDelete)await db("DELETE","sub_items",null,`?id=eq.${s.id}`);
        setSubItems(prev=>prev.filter(s=>!toDelete.find(d=>d.id===s.id)));
        const toAdd=data.subItems.filter(s=>s.isNew&&s.name.trim());
        if(toAdd.length>0){const inserted=await db("POST","sub_items",toAdd.map(s=>({job_id:data.id,name:s.name,total_hours:s.totalHours||0})));setSubItems(prev=>[...prev,...inserted.map(s=>({id:s.id,jobId:s.job_id,name:s.name,totalHours:s.total_hours||0}))]);}
        const toUpdate=data.subItems.filter(s=>!s.isNew&&s.name.trim());
        for(const s of toUpdate){await db("PATCH","sub_items",{name:s.name,total_hours:s.totalHours||0},`?id=eq.${s.id}`);setSubItems(prev=>prev.map(si=>si.id===s.id?{...si,name:s.name,totalHours:s.totalHours||0}:si));}
      }
      setJobModal(null);
    }catch(e){setError("Failed to save job.");}
    setSaving(false);
  }

  async function deleteJob(id){
    setSaving(true);
    try{await db("DELETE","jobs",null,`?id=eq.${id}`);setJobs(prev=>prev.filter(j=>j.id!==id));setSubItems(prev=>prev.filter(s=>s.jobId!==id));setEntries(prev=>prev.filter(e=>e.jobId!==id));setJobModal(null);}
    catch(e){setError("Failed to delete job.");}
    setSaving(false);
  }

  async function saveStaff(data){
    setSaving(true);
    try{
      if(data.isNew){
        const [ns]=await db("POST","staff",[{name:data.name,productive_hours:data.productiveHours||8}]);
        setStaff(prev=>[...prev,{id:ns.id,name:ns.name,productiveHours:ns.productive_hours||8}]);
      }else{
        await db("PATCH","staff",{name:data.name,productive_hours:data.productiveHours||8},`?id=eq.${data.id}`);
        setStaff(prev=>prev.map(s=>s.id===data.id?{...s,name:data.name,productiveHours:data.productiveHours||8}:s));
      }
      setStaffModal(null);
    }catch(e){setError("Failed to save staff.");}
    setSaving(false);
  }

  async function removeStaff(id){
    setSaving(true);
    try{await db("DELETE","staff",null,`?id=eq.${id}`);setStaff(prev=>prev.filter(s=>s.id!==id));setEntries(prev=>prev.filter(e=>e.staffId!==id));setStaffModal(null);}
    catch(e){setError("Failed to remove staff.");}
    setSaving(false);
  }

  function handleDragStart(e,entry){dragEntry.current=entry;e.dataTransfer.effectAllowed="move";}
  function handleDragOver(e,staffId,dateStr,slot){if(!canEdit||isPast(dateStr))return;e.preventDefault();setDropTarget({staffId,dateStr,slot});}
  function handleDragLeave(){setDropTarget(null);}
  async function handleDrop(e,staffId,dateStr,slot){
    e.preventDefault();setDropTarget(null);
    const entry=dragEntry.current;if(!entry||!canEdit)return;
    if(isPast(dateStr))return;
    if(entry.staffId===staffId&&entry.dateStr===dateStr&&entry.slot===slot)return;
    try{await db("PATCH","entries",{staff_id:staffId,date_str:dateStr,slot},`?id=eq.${entry.id}`);setEntries(prev=>prev.map(en=>en.id===entry.id?{...en,staffId,dateStr,slot}:en));}
    catch(e){setError("Failed to move entry.");}
    dragEntry.current=null;
  }
  function handleDragEnd(){setDropTarget(null);dragEntry.current=null;}
  function nextPreset(){return JOB_COLOUR_PRESETS[jobs.length%JOB_COLOUR_PRESETS.length];}

  const roleColors={admin:"#FEF3C7",manager:"#DBEAFE",staff:"#F0FDF4"};
  const roleTextColors={admin:"#92400E",manager:"#1D4ED8",staff:"#15803D"};

  if(loading) return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#F8FAFC",minHeight:"100vh"}}>
      <div style={{background:"#3D2E14",padding:"14px 24px",display:"flex",alignItems:"center",gap:14}}>
        <img src="/logo.jpg" alt="Logo" style={{height:44,maxWidth:120,objectFit:"contain"}}/>
        <div><div style={{fontSize:20,fontWeight:700,color:"#E8A030"}}>DJC Joiner</div><div style={{fontSize:11,color:"#E8A030",letterSpacing:"2px",textTransform:"uppercase"}}>Consulting · Mentoring · Growth</div></div>
      </div>
      <Spinner text="Loading schedule..."/>
    </div>
  );

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#F8FAFC",minHeight:"100vh"}}>

      {/* Header */}
      <div style={{background:"#3D2E14",padding:"0 24px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:14,paddingBottom:14}}>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <img src="/logo.jpg" alt="Logo" style={{height:48,maxWidth:130,objectFit:"contain"}}/>
            <div>
              <div style={{fontSize:20,fontWeight:700,color:"#E8A030",lineHeight:1.2}}>DJC Joiner</div>
              <div style={{fontSize:11,color:"#E8A030",letterSpacing:"2px",textTransform:"uppercase",marginTop:2}}>Consulting · Mentoring · Growth</div>
            </div>
            <div style={{width:1,height:36,background:"#E8A030",opacity:0.35,margin:"0 8px"}}/>
            <div style={{fontSize:14,color:"#FFF8EC",opacity:0.7}}>Production Schedule</div>
            {saving&&<div style={{fontSize:12,color:"#E8A030",marginLeft:8}}>Saving...</div>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.08)",borderRadius:8,padding:"6px 12px"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"#E8A030",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#3D2E14"}}>
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{fontSize:13,color:"#FFF8EC",fontWeight:500}}>{currentUser.name}</div>
                <div style={{fontSize:10,background:roleColors[currentUser.role],color:roleTextColors[currentUser.role],borderRadius:4,padding:"0 5px",fontWeight:600,textTransform:"uppercase",display:"inline-block"}}>{currentUser.role}</div>
              </div>
            </div>
            {isAdmin&&(
              <button onClick={()=>setUserMgmtOpen(true)}
                style={{padding:"7px 12px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:"1.5px solid rgba(232,160,48,0.4)",background:"transparent",color:"#E8A030"}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor="#E8A030";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(232,160,48,0.4)";}}>
                👥 Users
              </button>
            )}
            {isManager&&(
              <>
                <button onClick={()=>setJobModal({isNew:true,jobNo:"",name:"",...nextPreset(),subItems:[]})}
                  style={{padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",border:"1.5px solid #E8A030",background:"transparent",color:"#E8A030"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="#E8A030";e.currentTarget.style.color="#3D2E14";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color="#E8A030";}}>
                  + Add Job
                </button>
                <button onClick={()=>setStaffModal({isNew:true,name:"",productiveHours:8})}
                  style={{padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",border:"1.5px solid #E8A030",background:"#E8A030",color:"#3D2E14"}}
                  onMouseEnter={e=>{e.currentTarget.style.background="#F5C060";}}
                  onMouseLeave={e=>{e.currentTarget.style.background="#E8A030";}}>
                  + Add Staff
                </button>
              </>
            )}
            <button onClick={onLogout} style={{padding:"7px 12px",borderRadius:8,fontSize:12,cursor:"pointer",border:"1px solid rgba(255,255,255,0.15)",background:"transparent",color:"rgba(255,248,236,0.6)"}}>Sign Out</button>
          </div>
        </div>
        <div style={{display:"flex"}}>
          {[["schedule","📅 Schedule"],["summary","📋 Job Summary"]].map(([key,label])=>(
            <button key={key} onClick={()=>setTab(key)} style={{padding:"9px 22px",fontSize:14,fontWeight:500,cursor:"pointer",background:"none",border:"none",borderBottom:tab===key?"2.5px solid #E8A030":"2.5px solid transparent",color:tab===key?"#E8A030":"rgba(255,248,236,0.55)",transition:"all 0.15s"}}>{label}</button>
          ))}
        </div>
      </div>

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
                <div key={j.id} onClick={canEdit?()=>setJobModal({isNew:false,...j,subItems:subItems.filter(s=>s.jobId===j.id)}):undefined}
                  style={{background:j.bgColor,border:`1.5px solid ${j.borderColor}`,color:j.textColor,borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:600,cursor:canEdit?"pointer":"default"}}>
                  {j.jobNo} {j.name}
                </div>
              ))}
            </div>
          )}

          {canEdit&&<div style={{fontSize:11,color:"#94A3B8",marginBottom:8}}>💡 Drag any block to reassign · Past slots locked · Click + for job or misc entry</div>}
          {!canEdit&&<div style={{fontSize:11,color:"#94A3B8",marginBottom:8,background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:6,padding:"5px 10px",display:"inline-block"}}>👁 View only — contact a manager to make changes</div>}

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
                      <td key={wi} colSpan={5} style={{border:"1px solid #E2E8F0",borderLeft:wi>0?"2px solid #94A3B8":"1px solid #E2E8F0",background:"#F1F5F9",padding:"5px 8px",fontSize:12,fontWeight:600,color:"#475569",textAlign:"center"}}>Week of {formatDate(ws)}</td>
                    ))}
                  </tr>
                )}
                <tr>
                  <th style={{border:"1px solid #E2E8F0",background:"#F8FAFC",padding:"8px 10px",fontSize:12,color:"#64748B",textAlign:"left",fontWeight:600}}>Staff</th>
                  <th style={{border:"1px solid #E2E8F0",background:"#F8FAFC",padding:"4px",fontSize:11,color:"#94A3B8",textAlign:"center"}}>Slot</th>
                  {visibleDays.map((d,i)=>{
                    const ds=isoDate(d);const isToday=ds===todayStr;
                    const weekIdx=Math.floor(i/5);const isWeekBound=d.getDay()===1&&weekIdx>0;
                    return(
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
                  <tr><td colSpan={visibleDays.length+2} style={{padding:40,textAlign:"center",color:"#94A3B8",fontSize:14}}>No staff yet{canEdit?" — click \"+ Add Staff\" to get started":""}</td></tr>
                ):staff.map((st,si)=>(
                  [0,1].map(slot=>(
                    <tr key={`${st.id}-${slot}`} style={{borderBottom:slot===1?"2px solid #CBD5E1":"none"}}>
                      {slot===0&&(
                        <td rowSpan={2} style={{border:"1px solid #E2E8F0",borderBottom:"2px solid #CBD5E1",padding:"6px 10px",verticalAlign:"middle",background:si%2===0?"#fff":"#FAFAFA"}}>
                          <div style={{fontWeight:600,fontSize:13,color:"#1E293B",marginBottom:2}}>{st.name}</div>
                          <div style={{fontSize:10,color:"#94A3B8",marginBottom:2}}>{st.productiveHours}h productive/day</div>
                          {canEdit&&<button onClick={()=>setStaffModal({isNew:false,...st})} style={{fontSize:11,color:"#94A3B8",background:"none",border:"1px solid #E2E8F0",borderRadius:4,padding:"1px 6px",cursor:"pointer"}}>Edit</button>}
                        </td>
                      )}
                      <td style={{border:"1px solid #E2E8F0",padding:"2px 4px",fontSize:10,color:"#94A3B8",textAlign:"center",background:si%2===0?"#fff":"#FAFAFA"}}>{slot===0?"S1":"S2"}</td>
                      {visibleDays.map((d,di)=>{
                        const ds=isoDate(d);const isToday=ds===todayStr;
                        const weekIdx=Math.floor(di/5);const isWeekBound=d.getDay()===1&&weekIdx>0;
                        const k=`${st.id}|${ds}|${slot}`;
                        const entry=entryMap[k];
                        const job=entry&&!entry.miscNote?jobs.find(j=>j.id===entry.jobId):null;
                        const subItem=entry&&entry.subItemId?subItems.find(s=>s.id===entry.subItemId):null;
                        const isDrop=dropTarget&&dropTarget.staffId===st.id&&dropTarget.dateStr===ds&&dropTarget.slot===slot&&!entry;
                        const isConflict=conflictKeys.has(k);
                        return(
                          <td key={di}
                            style={{border:"1px solid #E2E8F0",borderLeft:isWeekBound?"2px solid #94A3B8":"1px solid #E2E8F0",padding:3,verticalAlign:"top",background:isToday?"rgba(219,234,254,0.18)":si%2===0?"#fff":"#FAFAFA"}}
                            onDragOver={e=>handleDragOver(e,st.id,ds,slot)}
                            onDragLeave={handleDragLeave}
                            onDrop={e=>handleDrop(e,st.id,ds,slot)}>
                            {entry
                              ? entry.miscNote
                                ? <MiscBlock note={entry.miscNote} hours={entry.hours} entry={entry} conflict={isConflict} onClick={()=>openEditEntry(entry)} onDragStart={handleDragStart} onDragEnd={handleDragEnd} canEdit={canEdit}/>
                                : job
                                  ? <JobBlock job={job} subItem={subItem} hours={entry.hours} productiveHours={st.productiveHours} entry={entry} conflict={isConflict} onClick={()=>openEditEntry(entry)} onDragStart={handleDragStart} onDragEnd={handleDragEnd} canEdit={canEdit}/>
                                  : <EmptySlot onClick={()=>openNewEntry(st.id,ds,slot)} isDropTarget={isDrop} isPastDate={isPast(ds)} canEdit={canEdit}/>
                              : <EmptySlot onClick={()=>openNewEntry(st.id,ds,slot)} isDropTarget={isDrop} isPastDate={isPast(ds)} canEdit={canEdit}/>
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
          <SummarySection jobs={activeJobs} entries={entries} subItems={subItems} staff={staff} setJobModal={canEdit?setJobModal:null} setEntryModal={canEdit?setEntryModal:null} setTab={setTab} archived={false} canEdit={canEdit}/>
          {archivedJobs.length>0&&(
            <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginTop:8}}>
                <div style={{flex:1,height:1,background:"#E2E8F0"}}/>
                <span style={{fontSize:12,color:"#94A3B8",fontWeight:500,whiteSpace:"nowrap"}}>Archived Jobs (all entries &gt; 1 month ago)</span>
                <div style={{flex:1,height:1,background:"#E2E8F0"}}/>
              </div>
              <SummarySection jobs={archivedJobs} entries={entries} subItems={subItems} staff={staff} setJobModal={canEdit?setJobModal:null} setEntryModal={canEdit?setEntryModal:null} setTab={setTab} archived={true} canEdit={canEdit}/>
            </>
          )}
        </div>
      )}

      {entryModal&&<EntryModal data={entryModal} staff={staff} jobs={activeJobs} subItems={subItems} onSave={saveEntry} onRemove={removeEntry} onClose={()=>setEntryModal(null)}/>}
      {jobModal&&<JobModal data={jobModal} onSave={saveJob} onDelete={deleteJob} onClose={()=>setJobModal(null)}/>}
      {staffModal&&<StaffModal data={staffModal} onSave={saveStaff} onRemove={removeStaff} onClose={()=>setStaffModal(null)}/>}
      {userMgmtOpen&&<UserManagementModal onClose={()=>setUserMgmtOpen(false)}/>}
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

function SummarySection({jobs,entries,subItems,staff,setJobModal,setEntryModal,setTab,archived,canEdit}) {
  return (
    <>
      {jobs.map(job=>{
        const jobEntries=entries.filter(e=>e.jobId===job.id&&!e.miscNote);
        const jobSubs=subItems.filter(s=>s.jobId===job.id);
        const dates=jobEntries.map(e=>e.dateStr).sort();
        const totalDeducted=jobEntries.reduce((a,e)=>{
          const st=staff.find(s=>s.id===e.staffId);
          const ph=st?.productiveHours||8;
          const days=e.hours/8;
          return a+(days*ph);
        },0);
        const commDate=dates[0]?parseISO(dates[0]):null;
        const lastDate=dates[dates.length-1]?parseISO(dates[dates.length-1]):null;
        const generalEntries=jobEntries.filter(e=>!e.subItemId);
        return(
          <div key={job.id} style={{background:"#fff",borderRadius:14,border:`1.5px solid ${job.borderColor}`,overflow:"hidden",opacity:archived?0.75:1}}>
            <div style={{background:job.bgColor,padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:8}}>
              <div>
                <div style={{fontSize:16,fontWeight:700,color:job.textColor}}>{job.jobNo} — {job.name}</div>
                <div style={{fontSize:12,color:job.textColor,opacity:0.8,marginTop:2}}>
                  {commDate?<>From {formatDateLong(commDate)} · Last {formatDateLong(lastDate)} · </>:"Not yet scheduled · "}
                  <strong>{Math.round(totalDeducted*10)/10}h</strong> deducted {archived&&<em>(archived)</em>}
                </div>
              </div>
              {canEdit&&setJobModal&&<button style={{padding:"6px 14px",borderRadius:8,fontSize:12,fontWeight:500,cursor:"pointer",border:`1px solid ${job.borderColor}`,background:"#fff",color:job.textColor}} onClick={()=>setJobModal({isNew:false,...job,subItems:jobSubs})}>Edit Job</button>}
            </div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{background:"#F8FAFC",borderBottom:"1px solid #E2E8F0"}}>
                  {["Joinery Item","Budget","Deducted","Remaining","Dates","Staff",""].map((h,i)=>(
                    <th key={i} style={{padding:"7px 12px",textAlign:"left",fontWeight:600,color:"#64748B",fontSize:12}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {jobSubs.map((si,rowi)=>{
                  const siEntries=jobEntries.filter(e=>e.subItemId===si.id);
                  const siDates=siEntries.map(e=>e.dateStr).sort();
                  const deductedHours=siEntries.reduce((a,e)=>{
                    const st=staff.find(s=>s.id===e.staffId);
                    const ph=st?.productiveHours||8;
                    const days=e.hours/8;
                    return a+(days*ph);
                  },0);
                  const remaining=(si.totalHours||0)-deductedHours;
                  const assignedStaff=[...new Set(siEntries.map(e=>e.staffId))].map(id=>staff.find(s=>s.id===id)?.name).filter(Boolean).join(", ");
                  let dateDisplay;
                  if(!siDates.length)dateDisplay=<em style={{color:"#94A3B8"}}>Not yet scheduled</em>;
                  else if(siDates.length===1)dateDisplay=formatDate(parseISO(siDates[0]));
                  else{const d1=parseISO(siDates[0]),d2=parseISO(siDates[siDates.length-1]);dateDisplay=`${formatDate(d1)} → ${formatDate(d2)} (${Math.round((d2-d1)/86400000)}d)`;}
                  return(
                    <tr key={si.id} style={{background:rowi%2===0?"#fff":"#FAFAFA",borderBottom:"1px solid #F1F5F9"}}>
                      <td style={{padding:"7px 12px",fontWeight:500,color:"#1E293B"}}>{si.name}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{si.totalHours?`${si.totalHours}h`:<em style={{color:"#94A3B8"}}>—</em>}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{deductedHours>0?`${Math.round(deductedHours*10)/10}h`:"—"}</td>
                      <td style={{padding:"7px 12px"}}>{si.totalHours>0?<span style={{color:remaining<0?"#EF4444":remaining===0?"#22C55E":"#F59E0B",fontWeight:600}}>{remaining>0?`${Math.round(remaining*10)/10}h left`:remaining===0?"✓ Done":`${Math.round(Math.abs(remaining)*10)/10}h over`}</span>:"—"}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{dateDisplay}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{assignedStaff||<em style={{color:"#94A3B8"}}>—</em>}</td>
                      <td style={{padding:"7px 12px"}}>{canEdit&&!archived&&setEntryModal&&<button style={{fontSize:11,color:"#3B82F6",background:"none",border:"1px solid #BFDBFE",borderRadius:6,padding:"3px 10px",cursor:"pointer"}} onClick={()=>{setEntryModal({mode:"new",staffId:"",dateStr:todayStr,slot:0,jobId:job.id,subItemId:si.id,hours:8,autoFill:remaining>0,totalHours:remaining>0?remaining:8,entryType:"job",miscNote:""});setTab("schedule");}}>+ Schedule</button>}</td>
                    </tr>
                  );
                })}
                {generalEntries.length>0&&(
                  <tr style={{background:"#FFF7ED",borderTop:"1px solid #FED7AA"}}>
                    <td style={{padding:"7px 12px",fontWeight:500,color:"#92400E"}}>General (no item)</td>
                    <td style={{padding:"7px 12px"}}>—</td>
                    <td style={{padding:"7px 12px",color:"#92400E"}}>{Math.round(generalEntries.reduce((a,e)=>{const st=staff.find(s=>s.id===e.staffId);return a+((e.hours/8)*(st?.productiveHours||8));},0)*10)/10}h</td>
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
    return{...data,subItemId:defaultSub,totalHours:data.totalHours||jobSubs[0]?.totalHours||0,entryType:data.entryType||"job",miscNote:data.miscNote||""};
  });
  const [autoFill,setAutoFill]=useState(data.autoFill!==false);

  function set(k,v){setForm(f=>({...f,[k]:v}));}
  const jobSubs=subItems.filter(s=>s.jobId===form.jobId);
  const selectedStaff=staff.find(s=>s.id===form.staffId);
  const productiveHours=selectedStaff?.productiveHours||8;
  const selectedSub=jobSubs.find(s=>s.id===form.subItemId);
  const totalHours=form.totalHours||selectedSub?.totalHours||0;

  function handleJobChange(jobId){const subs=subItems.filter(s=>s.jobId===jobId);const first=subs[0];setForm(f=>({...f,jobId,subItemId:first?.id||"",totalHours:first?.totalHours||0}));}
  function handleSubChange(subItemId){const sub=jobSubs.find(s=>s.id===subItemId);setForm(f=>({...f,subItemId,totalHours:sub?.totalHours||f.totalHours}));}

  const preview=useMemo(()=>{
    if(!autoFill||!form.dateStr||!totalHours||form.entryType==="misc")return[];
    return buildAutoFill(form.dateStr,totalHours,productiveHours);
  },[autoFill,form.dateStr,totalHours,productiveHours,form.entryType]);

  function handleSave(){
    if(form.entryType==="misc"){if(!form.miscNote.trim())return;onSave(form,null);return;}
    if(!form.jobId)return;
    if(autoFill&&preview.length>0)onSave(form,preview.map(p=>({dateStr:p.dateStr,hours:p.hours})));
    else onSave(form,null);
  }

  return(
    <Modal title={form.mode==="new"?"New Schedule Entry":"Edit Schedule Entry"} onClose={onClose} small>
      {/* Entry type switcher */}
      <div style={{display:"flex",gap:6,marginBottom:12,background:"#F1F5F9",borderRadius:8,padding:3}}>
        {[["job","📋 Job Entry"],["misc","📌 Misc Entry"]].map(([type,label])=>(
          <button key={type} onClick={()=>set("entryType",type)}
            style={{flex:1,padding:"6px",borderRadius:6,border:"none",fontSize:12,fontWeight:500,cursor:"pointer",background:form.entryType===type?"#fff":"transparent",color:form.entryType===type?"#1E293B":"#64748B",boxShadow:form.entryType===type?"0 1px 3px rgba(0,0,0,0.1)":"none"}}>
            {label}
          </button>
        ))}
      </div>
      <Sel label="Staff Member" value={form.staffId} onChange={e=>set("staffId",e.target.value)}>
        <option value="">— Select staff —</option>
        {staff.map(s=><option key={s.id} value={s.id}>{s.name} ({s.productiveHours}h/day)</option>)}
      </Sel>
      <Inp label="Start Date" type="date" value={form.dateStr} min={todayStr} onChange={e=>set("dateStr",e.target.value)}/>
      <Sel label="Slot" value={form.slot} onChange={e=>set("slot",Number(e.target.value))}>
        <option value={0}>Slot 1</option><option value={1}>Slot 2</option>
      </Sel>
      {form.entryType==="misc"?(
        <>
          <Inp label="Description (e.g. Wash Cars, Study Leave)" value={form.miscNote} onChange={e=>set("miscNote",e.target.value)} placeholder="Enter description..."/>
          <Inp label="Hours" type="number" min={0.5} max={12} step={0.5} value={form.hours} onChange={e=>set("hours",Number(e.target.value))}/>
        </>
      ):(
        <>
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
              <div style={{fontSize:12,color:"#64748B",marginBottom:3,fontWeight:500}}>Total Hours to Deduct from Budget</div>
              <input type="number" min={1} max={999} step={1} value={form.totalHours||""} onChange={e=>set("totalHours",Number(e.target.value))} placeholder={totalHours?`${totalHours} (from budget)`:"Enter hours"} style={{width:"100%",padding:"7px 10px",border:"1px solid #CBD5E1",borderRadius:8,fontSize:14,boxSizing:"border-box",outline:"none"}}/>
              {productiveHours<8&&<div style={{fontSize:11,color:"#F59E0B",marginTop:3}}>⚡ {selectedStaff?.name} is at {productiveHours}h/day productive rate</div>}
              {preview.length>0&&(
                <div style={{marginTop:8,background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,padding:"8px 10px"}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#15803D",marginBottom:5}}>📅 {preview.length} day{preview.length>1?"s":""} · {preview.reduce((a,p)=>a+(p.deducted||p.hours),0)}h deducted · {productiveHours}h/day rate</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                    {preview.map((p,i)=><span key={i} style={{fontSize:11,background:"#DCFCE7",color:"#166534",borderRadius:4,padding:"2px 6px"}}>{formatDate(parseISO(p.dateStr))} · 8h slot · {p.deducted}h eff</span>)}
                  </div>
                </div>
              )}
            </div>
          ):(
            <Inp label="Hours" type="number" min={0.5} max={12} step={0.5} value={form.hours} onChange={e=>set("hours",Number(e.target.value))}/>
          )}
        </>
      )}
      <div style={{display:"flex",gap:8,justifyContent:"space-between",marginTop:10}}>
        <div>{form.mode==="edit"&&<Btn variant="danger" onClick={()=>onRemove(form.id)}>Remove</Btn>}</div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave}>{autoFill&&preview.length>0&&form.entryType!=="misc"?`Schedule ${preview.length} days`:"Save"}</Btn>
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
  return(
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
  const [form,setForm]=useState({...data,productiveHours:data.productiveHours||8});
  return(
    <Modal title={form.isNew?"New Staff Member":"Edit Staff Member"} onClose={onClose} small>
      <Inp label="Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
      <div style={{marginBottom:12}}>
        <div style={{fontSize:12,color:"#64748B",marginBottom:4,fontWeight:500}}>Productive hours per 8h day</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <input type="range" min={1} max={8} step={0.5} value={form.productiveHours}
            onChange={e=>setForm(f=>({...f,productiveHours:Number(e.target.value)}))}
            style={{flex:1,accentColor:"#3B82F6"}}/>
          <div style={{minWidth:44,textAlign:"center",fontWeight:700,fontSize:16,color:"#1E293B"}}>{form.productiveHours}h</div>
        </div>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:4}}>Slot shows 8h · deducts {form.productiveHours}h from job budget</div>
      </div>
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
