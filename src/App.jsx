import React, { useState, useMemo, useRef, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";

// ╔══════════════════════════════════════════════════════════════╗
// ║           CLIENT CONFIGURATION — EDIT THIS SECTION           ║
// ╠══════════════════════════════════════════════════════════════╣

const CLIENT_NAME     = "DJC Joiner";
const CLIENT_TAGLINE  = "Consulting · Mentoring · Growth";
const CLIENT_LOGO     = "/logo.jpg";
const PAGE_TITLE      = "Production Schedule";

const BRAND_HEADER_BG = "#3D2E14";
const BRAND_GOLD      = "#E8A030";
const BRAND_CREAM     = "#FFF8EC";

// ╚══════════════════════════════════════════════════════════════╝

// Colour themes for the top header/nav bar only (logo row + Schedule/Job
// Summary tabs) - nothing else in the app changes. "Timber and brass" is
// kept pixel-identical to the app's original hardcoded look above; the rest
// come from the client's own quote-spreadsheet colour palette.
const THEMES = {
  timber_and_brass:    { name: "Timber and brass",    header: "#3D2E14", heading: "#E8A030", sub: "#FFF8EC" },
  classic_navy:        { name: "Classic navy",        header: "#1F2D3D", heading: "#3E5871", sub: "#D9D9D9" },
  charcoal_and_copper: { name: "Charcoal and copper", header: "#2B2B2B", heading: "#B87333", sub: "#E6E0D8" },
  forest_and_sand:     { name: "Forest and sand",     header: "#2F4F3D", heading: "#7A9471", sub: "#E9E4D4" },
  slate_and_bronze:    { name: "Slate and bronze",    header: "#34394A", heading: "#A9793D", sub: "#E3DFD8" },
  steel_blue:          { name: "Steel blue",          header: "#1C3A4B", heading: "#4A7A94", sub: "#DCE6EA" },
  warm_terracotta:     { name: "Warm terracotta",     header: "#5C2A1C", heading: "#C8683F", sub: "#F0E2D6" },
  deep_teal:           { name: "Deep teal",           header: "#0E3A38", heading: "#2E7D78", sub: "#D9E8E6" },
  graphite_and_sage:   { name: "Graphite and sage",   header: "#3A3F3A", heading: "#8FA089", sub: "#E5E7E1" },
};
const DEFAULT_THEME_KEY = "timber_and_brass";

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// A phone's narrow side never really exceeds 640px in either orientation,
// so checking both queries (not just width) keeps a rotated phone
// classified as mobile instead of quietly falling back to the desktop layout.
function useIsMobile() {
  const query = "(max-width: 640px), (max-height: 640px) and (orientation: landscape)";
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isMobile;
}

function useIsLandscapePhone() {
  const query = "(max-height: 640px) and (orientation: landscape)";
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setIsLandscape(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isLandscape;
}

function useViewportHeight() {
  const getHeight = () => typeof window !== "undefined"
    ? Math.min(
        window.visualViewport ? window.visualViewport.height : Infinity,
        window.innerHeight || Infinity
      )
    : 0;
  const [height, setHeight] = useState(getHeight);
  useEffect(() => {
    const update = () => setHeight(getHeight());
    update();
    // iOS Safari sometimes reports a stale/too-tall value until its chrome
    // (address bar, bottom toolbar) finishes settling after load - a couple
    // of delayed re-checks catch that without needing a scroll/resize event.
    const t1 = setTimeout(update, 300);
    const t2 = setTimeout(update, 1000);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return height;
}

const LOGO_MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5MB - just a sanity cap before we even try to process it
const LOGO_MAX_HEIGHT = 200; // stored/display size - the logo never renders taller than ~48px in the app

// Shrinks an uploaded image down before it's stored, so a phone photo doesn't
// turn into a multi-megabyte row in the database. Keeps transparency (PNG)
// since logos are usually shown on a coloured header background.
function resizeImageToDataUrl(file, maxHeight) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("Please choose an image file.")); return; }
    if (file.size > LOGO_MAX_UPLOAD_BYTES) { reject(new Error("That image is too large (max 5MB).")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image."));
      img.onload = () => {
        const scale = Math.min(1, maxHeight / img.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function parseQuery(query) {
  // Converts Supabase-style "?order=created_at" or "?id=eq.123" into an object
  const params = new URLSearchParams(query.replace(/^\?/, ""));
  const obj = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return obj;
}

function getSessionToken() {
  try { return JSON.parse(sessionStorage.getItem("djc_user")||"null")?.token; } catch { return undefined; }
}

async function db(method, table, body, query="") {
  const extraParams = parseQuery(query);
  const isLogin = table === "user_roles" && extraParams.login === "1";
  const qs = new URLSearchParams({ table, ...extraParams }).toString();
  const token = getSessionToken();
  const res = await fetch(`/api/db?${qs}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": import.meta.env.VITE_API_SECRET,
      ...(token ? { "x-session-token": token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const e = await res.text();
    // A rejected/missing session (e.g. an older tab open from before this
    // was added, or a role that changed) - send them back to a clean login
    // instead of leaving the app stuck on confusing errors. A wrong password
    // at the login screen itself is also a 401 but isn't a stale session, so
    // it's excluded here and left for the login form to show as an error.
    if (res.status === 401 && !isLogin) { sessionStorage.removeItem("djc_user"); window.location.reload(); }
    throw new Error(e);
  }
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
function formatDateRangeCompact(start,end) {
  const sameMonth=start.getMonth()===end.getMonth()&&start.getFullYear()===end.getFullYear();
  return sameMonth?`${start.getDate()}–${end.getDate()} ${start.toLocaleDateString("en-AU",{month:"short"})}`:`${formatDate(start)} – ${formatDate(end)}`;
}
function formatDateLong(d) { return d.toLocaleDateString("en-AU",{weekday:"short",day:"numeric",month:"short",year:"numeric"}); }
function isWeekend(d) { return d.getDay()===0||d.getDay()===6; }
function isSunday(d) { return d.getDay()===0; }

// Count working days (Mon-Sat) between two dates
function workingDaysBetween(d1,d2) {
  let count=0;
  const step=d2>d1?1:-1;
  let cur=new Date(d1);
  cur.setDate(cur.getDate()+step);
  while(isoDate(cur)!==isoDate(d2)) {
    if(!isSunday(cur)) count+=step;
    cur.setDate(cur.getDate()+step);
  }
  if(!isSunday(d2)) count+=step;
  return count;
}

// Shift a date by N working days (Mon-Sat, skip Sundays only)
function addWorkingDays(d, n) {
  let cur=new Date(d);
  const step=n>0?1:-1;
  let remaining=Math.abs(n);
  while(remaining>0) {
    cur.setDate(cur.getDate()+step);
    if(!isWeekend(cur)) remaining--;
  }
  return cur;
}
function isSaturday(d) { return d.getDay()===6; }
function isPast(dateStr) { return dateStr < todayStr; }
// No single entry can ever count for more than the staff member's daily cap
// (their Productive Hours) - it's a hard ceiling on how much of a day one
// person can be allocated, not just a cross-slot conflict check. Whichever
// entry (slot 1 or slot 2) was actually scheduled FIRST that day gets first
// claim on the cap; whichever was scheduled SECOND only gets whatever
// capacity the first one left over - regardless of which slot number either
// one happens to sit in. It's this reduced figure - not the raw scheduled
// hours - that counts toward the joinery item's budget.
function wasScheduledFirst(a, b) {
  const ca = a.createdAt ? new Date(a.createdAt).getTime() : null;
  const cb = b.createdAt ? new Date(b.createdAt).getTime() : null;
  if (ca !== null && cb !== null && ca !== cb) return ca < cb;
  // No reliable creation-order signal (missing or identical timestamps,
  // which happens for older data) - comparing database ids here would be an
  // arbitrary tie-break with no relation to real scheduling order, and can
  // disagree with other checks that rely on the same "who's first" answer
  // (e.g. a slot getting capped to 0 without the Overcommitted flag
  // agreeing). Falling back to slot 1 always taking priority is at least
  // deterministic and consistent everywhere this is checked.
  return a.slot < b.slot;
}
function effectiveEntryHours(e, allEntries, staffList) {
  const myHours = Number(e.hours) || 0;
  const stf = staffList.find(s => s.id === e.staffId);
  const cap = Number(stf?.productiveHours) || 8;
  const other = allEntries.find(o => o.staffId === e.staffId && o.dateStr === e.dateStr && o.slot !== e.slot);
  if (!other || wasScheduledFirst(e, other)) return Math.min(myHours, cap);
  const otherHours = Math.min(Number(other.hours) || 0, cap);
  return Math.min(myHours, Math.max(0, cap - otherHours));
}
// The most this entry's slot could ever contribute that day, regardless of
// what its own "hours" field actually says - same capacity rule as
// effectiveEntryHours, just without clamping to the entry's own raw value.
// Used to tell whether a day genuinely has enough room left to finish a
// joinery item, or whether even a full day there wouldn't be enough.
function maxPossibleHours(e, allEntries, staffList) {
  const stf = staffList.find(s => s.id === e.staffId);
  const cap = Number(stf?.productiveHours) || 8;
  const other = allEntries.find(o => o.staffId === e.staffId && o.dateStr === e.dateStr && o.slot !== e.slot);
  if (!other || wasScheduledFirst(e, other)) return cap;
  const otherHours = Math.min(Number(other.hours) || 0, cap);
  return Math.max(0, cap - otherHours);
}
function oneMonthAgo() { const d=new Date(TODAY); d.setMonth(d.getMonth()-1); return isoDate(d); }

// Shared between undo and redo: the row shape the API expects for an insert,
// and the entry shape the app uses once that insert comes back with an id.
function entryFields(e) { return {staff_id:e.staffId,job_id:e.jobId,sub_item_id:e.subItemId,date_str:e.dateStr,slot:e.slot,hours:e.hours,misc_note:e.miscNote,hours_locked:!!e.hoursLocked}; }
function mapInsertedEntry(inserted) { return {id:inserted.id,staffId:inserted.staff_id,jobId:inserted.job_id,subItemId:inserted.sub_item_id,dateStr:inserted.date_str,slot:inserted.slot,hours:Number(inserted.hours),miscNote:inserted.misc_note||null,createdAt:inserted.created_at,hoursLocked:!!inserted.hours_locked}; }

function buildAutoFill(startDateStr, totalHours, productiveHoursPerDay) {
  if (!totalHours||totalHours<=0) return [];
  const ph = productiveHoursPerDay||8;
  const days=[]; let remaining=totalHours; let cur=parseISO(startDateStr);
  while (remaining>0) {
    if (!isWeekend(cur)) {
      const deducted=Math.min(ph,remaining);
      days.push({dateStr:isoDate(cur),hours:deducted,deducted});
      remaining-=ph;
    }
    cur=addDays(cur,1);
    if (days.length>365) break;
  }
  return days;
}


function nextAvailableDate(staffIds, slot, entries, fromDateStr) {
  const startStr=fromDateStr&&fromDateStr>=todayStr?fromDateStr:todayStr;
  let cur=parseISO(startStr);
  for(let i=0;i<730;i++){
    if(!isWeekend(cur)){
      const ds=isoDate(cur);
      const conflict=staffIds.some(sid=>entries.some(e=>e.staffId===sid&&e.dateStr===ds&&e.slot===slot));
      if(!conflict)return ds;
    }
    cur=addDays(cur,1);
  }
  return startStr;
}

// Like nextAvailableDate, but for an auto-fill block that spans multiple
// days per person: checks that EVERY day each person's share would actually
// land on is free, not just the first day. staffShares is [{sid,ph,hours}].
function blockFits(staffShares, slot, entries, startDateStr) {
  return staffShares.every(({sid,ph,hours})=>{
    const days=buildAutoFill(startDateStr,hours,ph);
    return days.every(d=>!entries.some(e=>e.staffId===sid&&e.dateStr===d.dateStr&&e.slot===slot));
  });
}

function nextAvailableBlockDate(staffShares, slot, entries, fromDateStr) {
  const startStr=fromDateStr&&fromDateStr>=todayStr?fromDateStr:todayStr;
  let cur=parseISO(startStr);
  for(let i=0;i<730;i++){
    if(!isWeekend(cur)){
      const ds=isoDate(cur);
      if(blockFits(staffShares,slot,entries,ds))return ds;
    }
    cur=addDays(cur,1);
  }
  return startStr;
}

// Splits totalHours across staff proportional to each person's productive
// rate, so equal-rate staff get an equal share and different-rate staff get
// shares matching their own daily rate. Each share is rounded to the nearest
// half hour; the last person absorbs whatever rounding leaves over, so the
// total always adds up to exactly totalHours. Used by both the modal preview
// and the actual save so they can never disagree.
function splitHoursByStaff(staffWithPh, totalHours) {
  const totalPh=staffWithPh.reduce((a,x)=>a+x.ph,0)||1;
  let alloc=0;
  return staffWithPh.map(({sid,name,ph},idx)=>{
    const isLast=idx===staffWithPh.length-1;
    let hours;
    if(isLast){
      hours=Math.round((totalHours-alloc)*2)/2;
    }else{
      const share=totalHours*(ph/totalPh);
      hours=Math.round(share*2)/2;
    }
    alloc+=hours;
    return{sid,name,ph,hours};
  });
}

// Hues chosen for maximum separation around the colour wheel. Teal and cyan
// (originally #5 and #6) sat only ~15° apart - inside the blue-green band
// where the human eye is naturally worst at telling hues apart - so teal was
// swapped for yellow, which sits far from both its neighbours (~97°/143°).
// Backgrounds sit halfway between the original, near-invisible tier and a
// more saturated pass that turned out too strong - a compromise checked
// against contrast math, still comfortably legible (4.5:1+) for every colour.
const JOB_COLOUR_PRESETS = [
  {bgColor:"#FEEAEA",borderColor:"#EF4444",textColor:"#B91C1C"}, // red
  {bgColor:"#FFF2E1",borderColor:"#F97316",textColor:"#C2410C"}, // orange
  {bgColor:"#F2FDD9",borderColor:"#84CC16",textColor:"#4D7C0F"}, // lime
  {bgColor:"#E6FDEE",borderColor:"#22C55E",textColor:"#15803D"}, // green
  {bgColor:"#FEFBD6",borderColor:"#EAB308",textColor:"#854D0E"}, // yellow
  {bgColor:"#DEFCFF",borderColor:"#06B6D4",textColor:"#0E7490"}, // cyan
  {bgColor:"#E5F0FF",borderColor:"#3B82F6",textColor:"#1D4ED8"}, // blue
  {bgColor:"#F1EEFF",borderColor:"#8B5CF6",textColor:"#6D28D9"}, // violet
  {bgColor:"#FCEEFF",borderColor:"#D946EF",textColor:"#A21CAF"}, // fuchsia
  {bgColor:"#FDEDF6",borderColor:"#EC4899",textColor:"#9D174D"}, // pink
];


const JOINERY_ITEM_PRESETS = [
  "Kitchen W","Kitchen S","Pantry W","Pantry S",
  "Butlers W","Butlers S","Laundry W","Laundry S",
  "Vanity W","Vanity S","Robe W","Robe S",
  "WIR W","WIR S","Mudroom W","Mudroom S",
  "Living W","Living S","Office W","Office S",
  "Delivery",
];

// ── UI Primitives ─────────────────────────────────────────────

function ColorPicker({label,value,onChange}) {
  return (
    <div style={{marginBottom:10}}>
      <div style={{fontSize:12,color:"#64748B",marginBottom:3,fontWeight:500}}>{label}</div>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <input type="color" value={value} onChange={e=>onChange(e.target.value)} style={{width:32,height:32,padding:2,border:"1px solid #CBD5E1",borderRadius:6,cursor:"pointer"}}/>
        <input type="text" value={value} onChange={e=>onChange(e.target.value)} style={{flex:1,padding:"5px 8px",border:"1px solid #CBD5E1",borderRadius:6,fontSize:16,fontFamily:"monospace"}}/>
      </div>
    </div>
  );
}

function Modal({title,onClose,children,wide,small}) {
  const [pos,setPos]=useState(null);
  const isDragging=useRef(false);
  const offset=useRef({x:0,y:0});
  const modalRef=useRef(null);

  function onMouseDown(e){
    if(e.target.tagName==="BUTTON")return;
    isDragging.current=true;
    const rect=modalRef.current?.getBoundingClientRect();
    offset.current={x:e.clientX-(rect?.left||0),y:e.clientY-(rect?.top||0)};
    e.preventDefault();
  }
  useEffect(()=>{
    function onMove(e){
      if(!isDragging.current)return;
      setPos({x:e.clientX-offset.current.x,y:e.clientY-offset.current.y});
    }
    function onUp(){isDragging.current=false;}
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
    return()=>{window.removeEventListener("mousemove",onMove);window.removeEventListener("mouseup",onUp);};
  },[]);

  const style=pos
    ?{position:"fixed",left:pos.x,top:pos.y,margin:0,transform:"none"}
    :{};

  return (
    <div style={{position:"fixed",inset:0,background:pos?"transparent":"rgba(15,23,42,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:16,pointerEvents:pos?"none":"auto"}}
      onClick={e=>{if(!pos&&e.target===e.currentTarget)onClose();}}>
      <div ref={modalRef} style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:wide?820:small?420:460,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 20px 60px rgba(0,0,0,0.2)",pointerEvents:"auto",...style}}>
        <div onMouseDown={onMouseDown} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 20px 12px",borderBottom:"1px solid #E2E8F0",cursor:"grab",userSelect:"none"}}>
          <div style={{fontSize:16,fontWeight:600,color:"#1E293B"}}>{title} <span style={{fontSize:11,color:"#94A3B8",fontWeight:400}}>drag to move</span></div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:20,cursor:"pointer",color:"#94A3B8"}}>×</button>
        </div>
        <div style={{padding:"16px 20px 20px"}}>{children}</div>
      </div>
    </div>
  );
}

// A centered, app-styled stand-in for window.confirm/alert - those render
// as a generic browser dialog wherever the browser decides to put it,
// instead of looking like part of the app.
function ConfirmModal({title="Confirm",message,confirmLabel="Confirm",cancelLabel="Cancel",danger,onConfirm,onCancel}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.45)",zIndex:1100,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}
      onClick={e=>{if(e.target===e.currentTarget)onCancel();}}>
      <div style={{background:"#fff",borderRadius:14,maxWidth:420,width:"100%",padding:24,boxShadow:"0 20px 60px rgba(0,0,0,0.2)"}}>
        <div style={{fontSize:16,fontWeight:600,color:"#1E293B",marginBottom:12}}>{title}</div>
        <div style={{fontSize:14,color:"#475569",marginBottom:20,lineHeight:1.6}}>{message}</div>
        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <Btn variant="ghost" onClick={onCancel}>{cancelLabel}</Btn>
          <Btn variant={danger?"danger":"primary"} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

function Inp({label,...props}) {
  return (
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:12,color:"#64748B",marginBottom:3,fontWeight:500}}>{label}</div>}
      <input style={{width:"100%",padding:"7px 10px",border:"1px solid #CBD5E1",borderRadius:8,fontSize:16,boxSizing:"border-box",outline:"none"}} {...props}/>
    </div>
  );
}

function Sel({label,children,...props}) {
  return (
    <div style={{marginBottom:10}}>
      {label&&<div style={{fontSize:12,color:"#64748B",marginBottom:3,fontWeight:500}}>{label}</div>}
      <select style={{width:"100%",padding:"7px 10px",border:"1px solid #CBD5E1",borderRadius:8,fontSize:16,background:"#fff",outline:"none"}} {...props}>
        {children}
      </select>
    </div>
  );
}

function Btn({variant="default",style:s,loading,disabled,children,...props}) {
  const base={padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:500,cursor:"pointer",border:"none",transition:"all 0.15s",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:8};
  const v={default:{background:"#F1F5F9",color:"#334155"},primary:{background:"#3B82F6",color:"#fff"},danger:{background:"#EF4444",color:"#fff"},ghost:{background:"none",border:"1px solid #CBD5E1",color:"#475569"}};
  return (
    <button disabled={disabled||loading} style={{...base,...v[variant],...(loading?{cursor:"not-allowed",opacity:0.75}:{}),...s}} {...props}>
      {loading&&<span style={{width:13,height:13,border:"2px solid currentColor",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",opacity:0.8,flexShrink:0}}/>}
      {children}
      {loading&&<style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>}
    </button>
  );
}

const contextMenuItemStyle={display:"block",width:"100%",textAlign:"left",padding:"7px 10px",border:"none",background:"none",cursor:"pointer",fontSize:13,color:"#334155",borderRadius:5};

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

function JobBlock({job,subItem,hours,entry,onClick,onContextMenu,onDragStart,onDragEnd,conflict,canEdit,copyMode,moveMode,isCompletingEntry,budgetRemaining,totalBudget,selected,selectionMode,isOverRun,isUnderCap,underAmount,isPersonalLastEntry,isMobile,isPastDate,isOvercommitted}) {
  // An entry the background correction has reduced to nothing (e.g. another
  // staff member now covers the whole day/budget) shouldn't be labelled
  // "over-run" or any other budget-math term - it has zero real hours left,
  // so say that plainly. It's the clearest signal that it's now empty and
  // safe to remove, since it's no longer auto-deleted on its own.
  const isZeroHours=Math.abs(Number(hours))<0.05;
  const hoursLabel=isZeroHours?"0h"
    :isOverRun?"over-run"
    :isUnderCap?`${underAmount}h under`
    :isCompletingEntry?`${budgetRemaining}h`
    :isPersonalLastEntry?`${hours}h`
    :(totalBudget?`${totalBudget}h`:`${hours}h`);
  const flagColor=isOverRun||isUnderCap?"#D97706":undefined;
  return (
    <div
      draggable={!isMobile&&canEdit&&!copyMode&&!moveMode}
      onDragStart={canEdit&&!copyMode&&!moveMode?e=>onDragStart(e,entry):undefined}
      onDragEnd={canEdit?onDragEnd:undefined}
      onClick={canEdit?onClick:undefined}
      onContextMenu={canEdit&&onContextMenu?onContextMenu:undefined}
      style={{background:conflict?"#FEF2F2":selected?"#DBEAFE":job.bgColor,border:conflict?"2px solid #EF4444":selected?"2px solid #3B82F6":`1.5px solid ${job.borderColor}`,borderRadius:5,padding:isMobile?"4px 6px":"2px 5px",minHeight:isMobile?48:34,cursor:canEdit?"pointer":"default",display:"flex",flexDirection:"column",justifyContent:"center",userSelect:"none",position:"relative",opacity:isPastDate?0.45:1,...(isMobile?{}:{overflow:"hidden"})}}>
      {conflict&&<div style={{fontSize:9,fontWeight:700,color:"#EF4444",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:1}}>⚠ Conflict</div>}
      {isMobile?(
        <>
          <div style={{fontSize:12,fontWeight:700,color:conflict?"#EF4444":job.textColor,whiteSpace:"nowrap",lineHeight:1.3}}>{job.jobNo} {job.name}</div>
          <div style={{fontSize:11,fontWeight:500,color:conflict?"#EF4444":job.textColor,whiteSpace:"nowrap",lineHeight:1.25}}>
            {subItem?subItem.name:"General"} · <span style={{color:flagColor,fontWeight:(isOverRun||isUnderCap)?700:undefined}}>{hoursLabel}</span>
          </div>
          {isOvercommitted&&<div style={{fontSize:10,fontWeight:700,color:"#7C3AED",lineHeight:1.3,whiteSpace:"nowrap"}}>⚠ Overcommitted</div>}
        </>
      ):(
        <>
          <div style={{fontSize:10,fontWeight:700,color:conflict?"#EF4444":job.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.3}}>{job.jobNo} {job.name}</div>
          <div style={{fontSize:10,fontWeight:400,color:conflict?"#EF4444":job.textColor,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.3}}>
            {subItem?subItem.name:"General"} · <span style={{color:flagColor,fontWeight:(isOverRun||isUnderCap)?700:undefined}}>{hoursLabel}</span>
          </div>
          {isOvercommitted&&<div style={{fontSize:9,fontWeight:700,color:"#7C3AED",lineHeight:1.3,whiteSpace:"nowrap"}}>⚠ Overcommitted</div>}
        </>
      )}
    </div>
  );
}

function MiscBlock({note,hours,entry,onClick,onContextMenu,onDragStart,onDragEnd,conflict,canEdit,copyMode,moveMode,selected,selectionMode,isMobile,isPastDate,isOvercommitted}) {
  return (
    <div
      draggable={!isMobile&&canEdit&&!copyMode&&!moveMode}
      onDragStart={canEdit&&!copyMode&&!moveMode?e=>onDragStart(e,entry):undefined}
      onDragEnd={canEdit?onDragEnd:undefined}
      onClick={canEdit?onClick:undefined}
      onContextMenu={canEdit&&onContextMenu?onContextMenu:undefined}
      style={{background:conflict?"#FEF2F2":selected?"#DBEAFE":"#F1F5F9",border:conflict?"2px solid #EF4444":selected?"2px solid #3B82F6":"1.5px solid #94A3B8",borderRadius:5,padding:isMobile?"3px 6px":"2px 5px",cursor:canEdit?"pointer":"default",minHeight:isMobile?38:34,display:"flex",flexDirection:"column",justifyContent:"center",overflow:"hidden",userSelect:"none",position:"relative",opacity:isPastDate?0.45:1}}>
      {conflict&&<div style={{fontSize:9,fontWeight:700,color:"#EF4444",lineHeight:1.2,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",marginBottom:1}}>⚠ Conflict</div>}
      <div style={{fontSize:isMobile?12:10,fontWeight:700,color:conflict?"#EF4444":"#475569",whiteSpace:"normal",overflowWrap:"break-word",wordBreak:"break-word",overflow:"hidden",lineHeight:1.3,maxWidth:"17ch",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{note}</div>
      <div style={{fontSize:isMobile?11:10,fontWeight:400,color:conflict?"#EF4444":"#475569",whiteSpace:"nowrap",lineHeight:1.3}}>{hours}h</div>
      {isOvercommitted&&<div style={{fontSize:isMobile?10:9,fontWeight:700,color:"#7C3AED",lineHeight:1.3,whiteSpace:"nowrap"}}>⚠ Overcommitted</div>}
    </div>
  );
}

function EmptySlot({onClick,isDropTarget,isPastDate,canEdit,available}) {
  // Copy and Move both just arm a plain click-to-target on an empty slot -
  // no special "Paste here" fill, so they look and behave identically.
  if (isPastDate||!canEdit) return <div style={{minHeight:34,background:"#F8FAFC",borderRadius:5,border:"1px solid #F1F5F9"}}/>;
  // A job that wrapped up without using this staff member's whole day
  // leaves the day's other slot free - flag that leftover capacity instead
  // of showing a plain "+", with the same pale grey used elsewhere in the
  // app (e.g. Saturday columns). Misc entries carry their own solid border,
  // so the shared grey tone doesn't need to compete with that for contrast.
  return (
    <div onClick={onClick}
      style={{border:isDropTarget?"2px dashed #3B82F6":"1.5px dashed #CBD5E1",borderRadius:5,minHeight:34,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",color:isDropTarget?"#3B82F6":available?"#334155":"#CBD5E1",fontSize:available?10:16,fontWeight:available?600:400,textAlign:"center",lineHeight:1.2,padding:available?"2px 4px":0,background:available?"#F1F5F9":"transparent",transition:"all 0.12s"}}
      onMouseEnter={e=>{if(!isDropTarget&&!available){e.currentTarget.style.borderColor="#94A3B8";e.currentTarget.style.color="#94A3B8";}}}
      onMouseLeave={e=>{if(!isDropTarget&&!available){e.currentTarget.style.borderColor="#CBD5E1";e.currentTarget.style.color="#CBD5E1";}}}>
      {isDropTarget?"↓":available?"Available Hours":"+"}
    </div>
  );
}

// ── Login Screen ──────────────────────────────────────────────

function LoginScreen({onLogin}) {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const [logoSrc,setLogoSrc]=useState(CLIENT_LOGO);
  const [companyName,setCompanyName]=useState(CLIENT_NAME);
  const [companyTagline,setCompanyTagline]=useState(CLIENT_TAGLINE);

  useEffect(()=>{
    db("GET","app_settings").then(rows=>{
      const saved=rows?.[0];
      if(saved?.logo_data)setLogoSrc(saved.logo_data);
      if(saved?.company_name)setCompanyName(saved.company_name);
      if(saved?.company_tagline)setCompanyTagline(saved.company_tagline);
    }).catch(()=>{}); // table may not exist yet on older deployments - just keep the defaults
  },[]);

  async function handleLogin(e) {
    e.preventDefault();
    if (!email||!password){setError("Please enter your email and password.");return;}
    setLoading(true);setError("");
    try {
      const user=await db("POST","user_roles",{email:email.toLowerCase().trim(),password},"?login=1");
      sessionStorage.setItem("djc_user",JSON.stringify({email:user.email,role:user.role,name:user.name,id:user.id,token:user.token}));
      onLogin({email:user.email,role:user.role,name:user.name,id:user.id});
    } catch(err){
      // The server's login errors are all safe, deliberate messages (wrong
      // credentials, or a lockout notice with a wait time) - show them as-is
      // instead of a generic message that would hide the lockout countdown.
      let msg="Incorrect email or password.";
      try{const parsed=JSON.parse(err.message);if(parsed?.error)msg=parsed.error;}catch{}
      setError(msg);
    }
    setLoading(false);
  }

  return (
    <div style={{minHeight:"100vh",background:"#F8FAFC",display:"flex",flexDirection:"column"}}>
      <div style={{background:BRAND_HEADER_BG,padding:"16px 24px",display:"flex",alignItems:"center",gap:14}}>
        <img src={logoSrc} alt="Logo" style={{height:44,maxWidth:120,objectFit:"contain"}}/>
        <div>
          <div style={{fontSize:20,fontWeight:700,color:"#E8A030"}}>{companyName}</div>
          <div style={{fontSize:11,color:BRAND_GOLD,letterSpacing:"2px",textTransform:"uppercase"}}>{companyTagline}</div>
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
              style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:BRAND_HEADER_BG,color:"#E8A030",fontSize:15,fontWeight:600,cursor:loading?"not-allowed":"pointer",marginTop:4}}>
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

function UserManagementModal({onClose,themeKey,onChangeTheme,logoSrc,onChangeLogo,onResetLogo,companyName,onChangeCompanyName,companyTagline,onChangeCompanyTagline}) {
  const [users,setUsers]=useState([]);
  const [loading,setLoading]=useState(true);
  const [form,setForm]=useState({name:"",email:"",password:"",role:"staff"});
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [logoUploading,setLogoUploading]=useState(false);
  const [nameInput,setNameInput]=useState(companyName);
  const [taglineInput,setTaglineInput]=useState(companyTagline);
  const [confirmDialog,setConfirmDialog]=useState(null);

  async function handleLogoFile(e){
    const file=e.target.files[0];
    if(!file)return;
    setLogoUploading(true);setError("");
    try{
      const dataUrl=await resizeImageToDataUrl(file,LOGO_MAX_HEIGHT);
      await onChangeLogo(dataUrl);
    }catch(err){setError(err.message||"Could not use that image.");}
    setLogoUploading(false);
    e.target.value="";
  }

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

  function removeUser(id) {
    setConfirmDialog({message:"Remove this user?",danger:true,confirmLabel:"Remove",onConfirm:async()=>{
      setConfirmDialog(null);
      await db("DELETE","user_roles",null,`?id=eq.${id}`);
      setUsers(prev=>prev.filter(u=>u.id!==id));
    }});
  }

  async function changeRole(id,role) {
    await db("PATCH","user_roles",{role},`?id=eq.${id}`);
    setUsers(prev=>prev.map(u=>u.id===id?{...u,role}:u));
  }

  const roleColors={admin:{bg:"#FEF3C7",color:"#92400E"},manager:{bg:"#DBEAFE",color:"#1D4ED8"},staff:{bg:"#F0FDF4",color:"#15803D"}};

  return (
    <>
    <Modal title="👥 User Management" wide onClose={onClose}>
      {loading?<Spinner text="Loading users..."/>:(
        <>
          <div style={{borderBottom:"1px solid #E2E8F0",paddingBottom:16,marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1E293B",marginBottom:8}}>Colour Theme</div>
            <div style={{fontSize:12,color:"#64748B",marginBottom:10}}>Sets the colour of the header bar (logo, tabs, buttons) for everyone.</div>
            <Sel label="" value={themeKey} onChange={e=>onChangeTheme(e.target.value)}>
              {Object.entries(THEMES).map(([key,t])=><option key={key} value={key}>{t.name}</option>)}
            </Sel>
          </div>
          <div style={{borderBottom:"1px solid #E2E8F0",paddingBottom:16,marginBottom:20}}>
            <div style={{fontSize:14,fontWeight:600,color:"#1E293B",marginBottom:8}}>Company Branding</div>
            <div style={{fontSize:12,color:"#64748B",marginBottom:10}}>Shown on the login screen and in the header, for everyone.</div>
            <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:14}}>
              <div style={{width:64,height:64,border:"1px solid #E2E8F0",borderRadius:8,display:"flex",alignItems:"center",justifyContent:"center",background:"#F8FAFC",overflow:"hidden",flexShrink:0}}>
                <img src={logoSrc} alt="Current logo" style={{maxWidth:"100%",maxHeight:"100%",objectFit:"contain"}}/>
              </div>
              <div>
                <label style={{display:"inline-flex",alignItems:"center",gap:8,padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:600,cursor:logoUploading?"not-allowed":"pointer",border:"1px solid #CBD5E1",background:"#fff",color:"#475569",opacity:logoUploading?0.75:1}}>
                  {logoUploading&&<span style={{width:13,height:13,border:"2px solid currentColor",borderTopColor:"transparent",borderRadius:"50%",animation:"spin 0.8s linear infinite",flexShrink:0}}/>}
                  {logoUploading?"Uploading...":"Upload New Logo"}
                  <input type="file" accept="image/*" onChange={handleLogoFile} disabled={logoUploading} style={{display:"none"}}/>
                  {logoUploading&&<style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>}
                </label>
                <button onClick={onResetLogo} style={{marginLeft:8,padding:"7px 12px",borderRadius:8,fontSize:12,cursor:"pointer",border:"1px solid #E2E8F0",background:"none",color:"#94A3B8"}}>Reset to default</button>
                <div style={{fontSize:11,color:"#94A3B8",marginTop:6}}>PNG, JPG, or similar - up to 5MB.</div>
              </div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <Inp label="Company Name" value={nameInput} onChange={e=>setNameInput(e.target.value)} onBlur={()=>onChangeCompanyName(nameInput)} placeholder="Company Name"/>
              <Inp label="Tagline" value={taglineInput} onChange={e=>setTaglineInput(e.target.value)} onBlur={()=>onChangeCompanyTagline(taglineInput)} placeholder="Tagline"/>
            </div>
          </div>
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
                      style={{padding:"3px 8px",borderRadius:6,border:"1px solid #CBD5E1",fontSize:16,background:roleColors[u.role]?.bg,color:roleColors[u.role]?.color,fontWeight:600}}>
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
            <Btn variant="primary" onClick={addUser} loading={saving} style={{marginTop:4}}>{saving?"Adding...":"Add User"}</Btn>
          </div>
          <div style={{marginTop:16,padding:12,background:"#FFFBEB",border:"1px solid #FDE68A",borderRadius:8,fontSize:12,color:"#92400E"}}>
            <strong>Role permissions:</strong> Admin = full access · Manager = add/edit jobs & entries · Staff = view only
          </div>
        </>
      )}
    </Modal>
    {confirmDialog&&<ConfirmModal {...confirmDialog} onCancel={()=>setConfirmDialog(null)}/>}
    </>
  );
}

// ── Main App ──────────────────────────────────────────────────

export default function DJCJoiner() {
  useEffect(()=>{
    // Lock the viewport so iOS Safari stops auto-zooming on rotation/focus and
    // renders at native device width instead of a shrunk desktop-style layout.
    let meta=document.querySelector('meta[name="viewport"]');
    if(!meta){
      meta=document.createElement("meta");
      meta.name="viewport";
      document.head.appendChild(meta);
    }
    meta.setAttribute("content","width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover");
    document.body.style.overscrollBehavior="none";
    document.body.style.webkitTextSizeAdjust="100%";
  },[]);
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
  const isMobile=useIsMobile();
  const isLandscapePhone=useIsLandscapePhone();
  const viewportHeight=useViewportHeight();
  const staffColWidth=isMobile?56:90;
  const headerRef=useRef(null);
  const [headerHeight,setHeaderHeight]=useState(115);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    if(!headerRef.current)return;
    const el=headerRef.current;
    const update=()=>setHeaderHeight(el.getBoundingClientRect().height);
    update();
    const ro=new ResizeObserver(update);
    ro.observe(el);
    return()=>ro.disconnect();
  },[loading]);
  const toolbarBlockRef=useRef(null);
  const [toolbarBlockHeight,setToolbarBlockHeight]=useState(70);
  useEffect(()=>{
    if(!toolbarBlockRef.current)return;
    const el=toolbarBlockRef.current;
    const update=()=>setToolbarBlockHeight(el.getBoundingClientRect().height);
    update();
    const ro=new ResizeObserver(update);
    ro.observe(el);
    return()=>ro.disconnect();
  },[loading]);
  const mobileTableMaxHeight=Math.max(150,viewportHeight-headerHeight-toolbarBlockHeight-16);

  const [saving,setSaving]=useState(false);
  const [tab,setTab]=useState("schedule");
  useEffect(()=>{if(isMobile&&tab!=="schedule")setTab("schedule");},[isMobile,tab]);
  const [themeKey,setThemeKey]=useState(DEFAULT_THEME_KEY);
  const theme=THEMES[themeKey]||THEMES[DEFAULT_THEME_KEY];
  const [logoSrc,setLogoSrc]=useState(CLIENT_LOGO);
  const [companyName,setCompanyName]=useState(CLIENT_NAME);
  const [companyTagline,setCompanyTagline]=useState(CLIENT_TAGLINE);

  useEffect(()=>{
    db("GET","app_settings").then(rows=>{
      const saved=rows?.[0];
      if(saved?.theme&&THEMES[saved.theme])setThemeKey(saved.theme);
      if(saved?.logo_data)setLogoSrc(saved.logo_data);
      if(saved?.company_name)setCompanyName(saved.company_name);
      if(saved?.company_tagline)setCompanyTagline(saved.company_tagline);
    }).catch(()=>{}); // table may not exist yet on older deployments - just keep the defaults
  },[]);

  async function changeTheme(key){
    setThemeKey(key); // apply immediately, save in the background
    try{await db("PATCH","app_settings",{theme:key},"?id=eq.1");}
    catch{setError("Could not save the theme choice - it'll reset next time the page loads.");}
  }

  async function changeLogo(dataUrl){
    setLogoSrc(dataUrl); // apply immediately, save in the background
    try{await db("PATCH","app_settings",{logo_data:dataUrl},"?id=eq.1");}
    catch{setError("Could not save the new logo - it'll reset next time the page loads.");}
  }

  async function resetLogo(){
    setLogoSrc(CLIENT_LOGO);
    try{await db("PATCH","app_settings",{logo_data:null},"?id=eq.1");}
    catch{setError("Could not reset the logo - it'll reappear next time the page loads.");}
  }

  async function changeCompanyName(name){
    const value=name.trim()||CLIENT_NAME;
    setCompanyName(value);
    try{await db("PATCH","app_settings",{company_name:value},"?id=eq.1");}
    catch{setError("Could not save the company name - it'll reset next time the page loads.");}
  }

  async function changeCompanyTagline(tagline){
    const value=tagline.trim()||CLIENT_TAGLINE;
    setCompanyTagline(value);
    try{await db("PATCH","app_settings",{company_tagline:value},"?id=eq.1");}
    catch{setError("Could not save the tagline - it'll reset next time the page loads.");}
  }

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
  const [confirmDialog,setConfirmDialog]=useState(null);
  const [userMgmtOpen,setUserMgmtOpen]=useState(false);
  const [workHoursOpen,setWorkHoursOpen]=useState(false);
  const [workStart,setWorkStart]=useState("07:00");
  const [workEnd,setWorkEnd]=useState("15:30");

  const workHoursPerDay=useMemo(()=>{
    const [sh,sm]=workStart.split(":").map(Number);
    const [eh,em]=workEnd.split(":").map(Number);
    const total=(eh*60+em-sh*60-sm)/60;
    return Math.max(1,Math.round(total*2)/2);
  },[workStart,workEnd]);
  const [error,setError]=useState(null);

  const dragEntry=useRef(null);
  const dragStaff=useRef(null);
  const [staffOrder,setStaffOrder]=useState([]);

  useEffect(()=>{
    if(staff.length>0&&staffOrder.length===0) setStaffOrder(staff.map(s=>s.id));
  },[staff]);

  const orderedStaff=useMemo(()=>{
    if(staffOrder.length===0) return staff;
    const map=Object.fromEntries(staff.map(s=>[s.id,s]));
    return staffOrder.filter(id=>map[id]).map(id=>map[id]).concat(staff.filter(s=>!staffOrder.includes(s.id)));
  },[staff,staffOrder]);

  function persistStaffOrder(ids){
    ids.forEach((id,i)=>db("PATCH","staff",{sort_order:i},`?id=eq.${id}`).catch(()=>{}));
  }
  function handleStaffDragStart(e,staffId){
    dragStaff.current=staffId;
    e.dataTransfer.effectAllowed="move";
  }
  function moveStaffOrder(staffId,direction){
    const ids=orderedStaff.map(s=>s.id);
    const idx=ids.indexOf(staffId);
    const swapIdx=idx+(direction==="up"?-1:1);
    if(idx===-1||swapIdx<0||swapIdx>=ids.length)return;
    [ids[idx],ids[swapIdx]]=[ids[swapIdx],ids[idx]];
    setStaffOrder(ids);
    persistStaffOrder(ids);
  }
  function handleStaffDrop(e,targetStaffId){
    e.preventDefault();
    if(!dragStaff.current||dragStaff.current===targetStaffId)return;
    const order=[...orderedStaff.map(s=>s.id)];
    const fromIdx=order.indexOf(dragStaff.current);
    const toIdx=order.indexOf(targetStaffId);
    if(fromIdx===-1||toIdx===-1){dragStaff.current=null;return;}
    order.splice(fromIdx,1);
    order.splice(toIdx,0,dragStaff.current);
    setStaffOrder(order);
    persistStaffOrder(order);
    dragStaff.current=null;
  }
  const [undoStack,setUndoStack]=useState([]); // each item: {type, data}
  const [redoStack,setRedoStack]=useState([]); // same shapes, populated by undo/redo themselves

  function pushUndo(type, data) {
    setUndoStack(prev=>[...prev.slice(-19),{type,data}]);
    setRedoStack([]); // a genuine new action invalidates whatever could have been redone
  }

  async function handleUndo() {
    if(undoStack.length===0) return;
    const last=undoStack[undoStack.length-1];
    setUndoStack(prev=>prev.slice(0,-1));
    // Every branch applies its change to the screen first and talks to the
    // server in the background, same as drag/copy/delete - rolling back (and
    // popping the redo entry it just pushed) if the save actually fails.
    if(last.type==="addEntries") {
      const removed=entries.filter(e=>last.data.ids.includes(e.id));
      const rows=removed.map(entryFields);
      setEntries(prev=>prev.filter(e=>!last.data.ids.includes(e.id)));
      setRedoStack(prev=>[...prev,{type:"addEntries",data:{rows}}]);
      try{
        await Promise.all(last.data.ids.map(id=>db("DELETE","entries",null,`?id=eq.${id}`)));
      }catch(e){
        setError("Undo failed - restored.");
        setEntries(prev=>[...prev,...removed]);
        setRedoStack(prev=>prev.slice(0,-1));
      }
    } else if(last.type==="editEntry") {
      const e=last.data.prev;
      const current=entries.find(en=>en.id===e.id);
      setEntries(prev=>prev.map(en=>en.id===e.id?e:en));
      if(current)setRedoStack(prev=>[...prev,{type:"editEntry",data:{state:current}}]);
      try{
        await db("PATCH","entries",{staff_id:e.staffId,job_id:e.jobId,sub_item_id:e.subItemId,date_str:e.dateStr,slot:e.slot,hours:e.hours,misc_note:e.miscNote,hours_locked:!!e.hoursLocked},`?id=eq.${e.id}`);
      }catch(err){
        setError("Undo failed - reverted.");
        if(current){setEntries(prev=>prev.map(en=>en.id===e.id?current:en));setRedoStack(prev=>prev.slice(0,-1));}
      }
    } else if(last.type==="deleteEntry") {
      const e=last.data.entry;
      const tempId=`temp_undo_${Date.now()}`;
      setEntries(prev=>[...prev,{...e,id:tempId}]);
      try{
        const [inserted]=await db("POST","entries",[entryFields(e)]);
        const real=mapInsertedEntry(inserted);
        setEntries(prev=>prev.map(en=>en.id===tempId?real:en));
        setRedoStack(prev=>[...prev,{type:"deleteEntry",data:{id:real.id}}]);
      }catch(err){
        setError("Undo failed.");
        setEntries(prev=>prev.filter(en=>en.id!==tempId));
      }
    } else if(last.type==="moveEntry") {
      const {id,prevStaffId,prevDateStr,prevSlot,prevCreatedAt,prevHours}=last.data;
      const current=entries.find(e=>e.id===id);
      setEntries(prev=>prev.map(e=>e.id===id?{...e,staffId:prevStaffId,dateStr:prevDateStr,slot:prevSlot,createdAt:prevCreatedAt,...(prevHours!==undefined?{hours:prevHours}:{})}:e));
      if(current)setRedoStack(prev=>[...prev,{type:"moveEntry",data:{id,staffId:current.staffId,dateStr:current.dateStr,slot:current.slot,createdAt:current.createdAt,hours:current.hours}}]);
      try{
        await db("PATCH","entries",{staff_id:prevStaffId,date_str:prevDateStr,slot:prevSlot,created_at:prevCreatedAt,...(prevHours!==undefined?{hours:prevHours}:{})},`?id=eq.${id}`);
      }catch(err){
        setError("Undo failed - reverted.");
        if(current){setEntries(prev=>prev.map(e=>e.id===id?current:e));setRedoStack(prev=>prev.slice(0,-1));}
      }
    } else if(last.type==="moveMultiple") {
      const states=last.data.prevStates.map(ps=>{const cur=entries.find(e=>e.id===ps.id);return cur?{id:ps.id,staffId:cur.staffId,dateStr:cur.dateStr,slot:cur.slot,createdAt:cur.createdAt,hours:cur.hours}:null;}).filter(Boolean);
      setEntries(prev=>prev.map(e=>{const ps=last.data.prevStates.find(x=>x.id===e.id);return ps?{...e,staffId:ps.prevStaffId,dateStr:ps.prevDateStr,slot:ps.prevSlot,createdAt:ps.prevCreatedAt,...(ps.prevHours!==undefined?{hours:ps.prevHours}:{})}:e;}));
      setRedoStack(prev=>[...prev,{type:"moveMultiple",data:{states}}]);
      try{
        await Promise.all(last.data.prevStates.map(({id,prevStaffId,prevDateStr,prevSlot,prevCreatedAt,prevHours})=>
          db("PATCH","entries",{staff_id:prevStaffId,date_str:prevDateStr,slot:prevSlot,created_at:prevCreatedAt,...(prevHours!==undefined?{hours:prevHours}:{})},`?id=eq.${id}`)
        ));
      }catch(err){
        setError("Undo failed - reverted.");
        setEntries(prev=>prev.map(e=>{const s=states.find(x=>x.id===e.id);return s?{...e,staffId:s.staffId,dateStr:s.dateStr,slot:s.slot,createdAt:s.createdAt,hours:s.hours}:e;}));
        setRedoStack(prev=>prev.slice(0,-1));
      }
    } else if(last.type==="deleteMultiple"||last.type==="unscheduleItem") {
      // Re-insert all of them in a single batched request, not one at a time
      const tempMap=last.data.deletedEntries.map((en,i)=>({tempId:`temp_undo_${Date.now()}_${i}`,en}));
      setEntries(prev=>[...prev,...tempMap.map(({tempId,en})=>({...en,id:tempId}))]);
      const tempIds=tempMap.map(t=>t.tempId);
      try{
        const inserted=await db("POST","entries",last.data.deletedEntries.map(entryFields));
        const mapped=inserted.map(mapInsertedEntry);
        setEntries(prev=>[...prev.filter(e=>!tempIds.includes(e.id)),...mapped]);
        setRedoStack(prev=>[...prev,{type:last.type,data:{ids:mapped.map(e=>e.id)}}]);
      }catch(err){
        setError("Undo failed.");
        setEntries(prev=>prev.filter(e=>!tempIds.includes(e.id)));
      }
    }
  }

  async function handleRedo() {
    if(redoStack.length===0) return;
    const last=redoStack[redoStack.length-1];
    setRedoStack(prev=>prev.slice(0,-1));
    if(last.type==="addEntries") {
      const tempMap=last.data.rows.map((row,i)=>({tempId:`temp_redo_${Date.now()}_${i}`,row}));
      setEntries(prev=>[...prev,...tempMap.map(({tempId,row})=>({id:tempId,staffId:row.staff_id,jobId:row.job_id,subItemId:row.sub_item_id,dateStr:row.date_str,slot:row.slot,hours:Number(row.hours),miscNote:row.misc_note||null,createdAt:new Date().toISOString(),hoursLocked:!!row.hours_locked}))]);
      const tempIds=tempMap.map(t=>t.tempId);
      try{
        const inserted=await db("POST","entries",last.data.rows);
        const mapped=inserted.map(mapInsertedEntry);
        setEntries(prev=>[...prev.filter(e=>!tempIds.includes(e.id)),...mapped]);
        setUndoStack(prev=>[...prev,{type:"addEntries",data:{ids:mapped.map(e=>e.id)}}]);
      }catch(err){
        setError("Redo failed.");
        setEntries(prev=>prev.filter(e=>!tempIds.includes(e.id)));
      }
    } else if(last.type==="editEntry") {
      const s=last.data.state;
      const current=entries.find(en=>en.id===s.id);
      setEntries(prev=>prev.map(en=>en.id===s.id?s:en));
      if(current)setUndoStack(prev=>[...prev,{type:"editEntry",data:{prev:current}}]);
      try{
        await db("PATCH","entries",{staff_id:s.staffId,job_id:s.jobId,sub_item_id:s.subItemId,date_str:s.dateStr,slot:s.slot,hours:s.hours,misc_note:s.miscNote,hours_locked:!!s.hoursLocked},`?id=eq.${s.id}`);
      }catch(err){
        setError("Redo failed - reverted.");
        if(current){setEntries(prev=>prev.map(en=>en.id===s.id?current:en));setUndoStack(prev=>prev.slice(0,-1));}
      }
    } else if(last.type==="deleteEntry") {
      const {id}=last.data;
      const entry=entries.find(e=>e.id===id);
      setEntries(prev=>prev.filter(e=>e.id!==id));
      if(entry)setUndoStack(prev=>[...prev,{type:"deleteEntry",data:{entry}}]);
      try{
        await db("DELETE","entries",null,`?id=eq.${id}`);
      }catch(err){
        setError("Redo failed - restored.");
        if(entry){setEntries(prev=>[...prev,entry]);setUndoStack(prev=>prev.slice(0,-1));}
      }
    } else if(last.type==="moveEntry") {
      const {id,staffId,dateStr,slot,createdAt,hours}=last.data;
      const current=entries.find(e=>e.id===id);
      setEntries(prev=>prev.map(e=>e.id===id?{...e,staffId,dateStr,slot,createdAt,...(hours!==undefined?{hours}:{})}:e));
      if(current)setUndoStack(prev=>[...prev,{type:"moveEntry",data:{id,prevStaffId:current.staffId,prevDateStr:current.dateStr,prevSlot:current.slot,prevCreatedAt:current.createdAt,prevHours:current.hours}}]);
      try{
        await db("PATCH","entries",{staff_id:staffId,date_str:dateStr,slot,created_at:createdAt,...(hours!==undefined?{hours}:{})},`?id=eq.${id}`);
      }catch(err){
        setError("Redo failed - reverted.");
        if(current){setEntries(prev=>prev.map(e=>e.id===id?current:e));setUndoStack(prev=>prev.slice(0,-1));}
      }
    } else if(last.type==="moveMultiple") {
      const prevStates=last.data.states.map(s=>{const cur=entries.find(e=>e.id===s.id);return cur?{id:s.id,prevStaffId:cur.staffId,prevDateStr:cur.dateStr,prevSlot:cur.slot,prevCreatedAt:cur.createdAt,prevHours:cur.hours}:null;}).filter(Boolean);
      setEntries(prev=>prev.map(e=>{const s=last.data.states.find(x=>x.id===e.id);return s?{...e,staffId:s.staffId,dateStr:s.dateStr,slot:s.slot,createdAt:s.createdAt,...(s.hours!==undefined?{hours:s.hours}:{})}:e;}));
      setUndoStack(prev=>[...prev,{type:"moveMultiple",data:{prevStates}}]);
      try{
        await Promise.all(last.data.states.map(({id,staffId,dateStr,slot,createdAt,hours})=>
          db("PATCH","entries",{staff_id:staffId,date_str:dateStr,slot,created_at:createdAt,...(hours!==undefined?{hours}:{})},`?id=eq.${id}`)
        ));
      }catch(err){
        setError("Redo failed - reverted.");
        setEntries(prev=>prev.map(e=>{const ps=prevStates.find(p=>p.id===e.id);return ps?{...e,staffId:ps.prevStaffId,dateStr:ps.prevDateStr,slot:ps.prevSlot,createdAt:ps.prevCreatedAt,hours:ps.prevHours}:e;}));
        setUndoStack(prev=>prev.slice(0,-1));
      }
    } else if(last.type==="deleteMultiple"||last.type==="unscheduleItem") {
      const {ids}=last.data;
      const deletedEntries=entries.filter(e=>ids.includes(e.id));
      setEntries(prev=>prev.filter(e=>!ids.includes(e.id)));
      setUndoStack(prev=>[...prev,{type:last.type,data:{deletedEntries}}]);
      try{
        await db("DELETE","entries",null,`?id=in.(${ids.join(",")})`);
      }catch(err){
        setError("Redo failed - restored.");
        setEntries(prev=>[...prev,...deletedEntries]);
        setUndoStack(prev=>prev.slice(0,-1));
      }
    }
  }
  const [copyMode,setCopyMode]=useState(false); // tap-to-copy, arms via Select toolbar's Copy button
  const [selectedEntries,setSelectedEntries]=useState(new Set()); // for multi-select
  const [selectionMode,setSelectionMode]=useState(false);
  const [moveMode,setMoveMode]=useState(false); // tap-to-move, for touch devices where drag-and-drop can't fire
  const [dropTarget,setDropTarget]=useState(null);
  const [contextMenu,setContextMenu]=useState(null); // {x,y,entry} - right-click quick actions

  useEffect(()=>{
    function onKeyDown(e){
      const isFormField=["INPUT","TEXTAREA","SELECT"].includes(e.target.tagName);
      if(e.key==="Escape"||(e.key==="Enter"&&!isFormField)){
        setSelectedEntries(new Set());
        setSelectionMode(false);
        setMoveMode(false);
        setCopyMode(false);
        setContextMenu(null);
        return;
      }
      if((e.key==="Delete"||e.key==="Backspace")&&!isFormField&&selectionMode&&selectedEntries.size>0){
        e.preventDefault();
        deleteSelectedEntries();
      }
    }
    window.addEventListener("keydown",onKeyDown);
    return ()=>window.removeEventListener("keydown",onKeyDown);
  },[selectionMode,selectedEntries]);

  // Right-click quick-action menu on an entry - dismiss on any left click or
  // scroll elsewhere, the same way a native context menu would behave.
  useEffect(()=>{
    if(!contextMenu)return;
    function close(){setContextMenu(null);}
    window.addEventListener("click",close);
    window.addEventListener("scroll",close,true);
    return ()=>{
      window.removeEventListener("click",close);
      window.removeEventListener("scroll",close,true);
    };
  },[contextMenu]);

  function openContextMenu(e,entry){
    if(!canEdit)return;
    e.preventDefault();
    setContextMenu({x:e.clientX,y:e.clientY,entry});
  }

  const loadAll=useCallback(async()=>{
    try {
      setLoading(true);
      const [staffData,jobsData,subData,entriesData]=await Promise.all([
        db("GET","staff","","?order=sort_order"),
        db("GET","jobs","","?order=created_at"),
        db("GET","sub_items","","?order=created_at"),
        db("GET","entries","","?order=created_at"),
      ]);
      const staffSorted=staffData.map(s=>({id:s.id,name:s.name,productiveHours:Number(s.productive_hours)||8,sortOrder:s.sort_order}));
      setStaff(staffSorted);
      if(staffSorted.some(s=>s.sortOrder==null)){
        // First load after the sort_order migration - assign stable positions
        // now so the order sticks permanently from here on, without requiring
        // the user to manually reorder first.
        staffSorted.forEach((s,i)=>db("PATCH","staff",{sort_order:i},`?id=eq.${s.id}`).catch(()=>{}));
        setStaffOrder(staffSorted.map(s=>s.id));
      }
      setJobs(jobsData.map(j=>({id:j.id,jobNo:j.job_no,name:j.name,bgColor:j.bg_color,borderColor:j.border_color,textColor:j.text_color,completed:!!j.completed})));
      setSubItems(subData.map(s=>({id:s.id,jobId:s.job_id,name:s.name,totalHours:Number(s.total_hours)||0})));
      setEntries(entriesData.map(e=>({id:e.id,staffId:e.staff_id,jobId:e.job_id,subItemId:e.sub_item_id,dateStr:e.date_str,slot:e.slot,hours:Number(e.hours),miscNote:e.misc_note||null,createdAt:e.created_at,hoursLocked:!!e.hours_locked})));
    } catch(e){setError("Could not connect to database.");}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{loadAll();},[loadAll]);

  const threshold=oneMonthAgo();
  // A job someone has manually marked complete never lands in either bucket
  // here - it's a closed job, not just a quiet/stale one. That single filter
  // is what pulls it out of Job Summary, the quick-edit pill row above the
  // calendar, and the "new entry" job picker all at once, since each of
  // those already draws from activeJobs/archivedJobs rather than the raw
  // jobs list. It never touches entries or the grid itself.
  const {activeJobs,archivedJobs,completedJobs}=useMemo(()=>{
    const active=[],archived=[],completed=[];
    for (const job of jobs){
      if(job.completed){completed.push(job);continue;}
      const je=entries.filter(e=>e.jobId===job.id);
      if(!je.length){active.push(job);continue;}
      const maxDate=je.map(e=>e.dateStr).sort().reverse()[0];
      if(maxDate<threshold)archived.push(job);else active.push(job);
    }
    return {activeJobs:active,archivedJobs:archived,completedJobs:completed};
  },[jobs,entries,threshold]);

  const visibleDays=useMemo(()=>{
    const days=[];const weeks=viewMode==="month"?4:viewWeeks;
    for(let w=0;w<weeks;w++)for(let d=0;d<6;d++)days.push(addDays(anchorDate,w*7+d)); // Mon-Sat
    return days;
  },[anchorDate,viewWeeks,viewMode]);

  const totalWeeks=viewMode==="month"?4:viewWeeks;
  const weekStarts=Array.from({length:totalWeeks},(_,i)=>addDays(anchorDate,i*7));

  const {entryMap,conflictKeys,entriesByKey}=useMemo(()=>{
    const map={},counts={},byKey={};
    for(const e of entries){const k=`${e.staffId}|${e.dateStr}|${e.slot}`;counts[k]=(counts[k]||0)+1;map[k]=e;(byKey[k]=byKey[k]||[]).push(e);}
    return {entryMap:map,conflictKeys:new Set(Object.keys(counts).filter(k=>counts[k]>1)),entriesByKey:byKey};
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
        const all=extraEntries&&extraEntries.length>0?extraEntries:[{dateStr:data.dateStr,hours:data.hours,staffId:data.staffId}];
        const valid=all.filter(p=>!isPast(p.dateStr));
        const conflicts=valid.filter(p=>!!entryMap[`${p.staffId||data.staffId}|${p.dateStr}|${data.slot}`]);
        // Auto-fill spreads a total across days/staff algorithmically - that
        // stays open to the background hours correction as budgets and
        // conflicts shift. A manually-typed single entry (auto-fill off) is
        // a deliberate number the person chose, so it's locked: the
        // correction pass leaves it alone instead of re-deriving it.
        const buildRows=(items)=>items.map(({dateStr,hours,staffId})=>({
          staff_id:staffId||data.staffId,
          job_id:data.entryType==="misc"?null:data.jobId,
          sub_item_id:data.entryType==="misc"?null:data.subItemId||null,
          date_str:dateStr,slot:data.slot,hours,
          misc_note:data.entryType==="misc"?data.miscNote:null,
          hours_locked:data.entryType!=="misc"&&!data.autoFill
        }));
        if(conflicts.length>0){
          setSaving(false);
          setConflictAlert({
            message:`⚠ ${conflicts.length} date${conflicts.length>1?"s":""} already have an entry in that slot. They will be shown in red.`,
            onConfirm:async()=>{
              setSaving(true);
              const inserted=await db("POST","entries",buildRows(valid));
              setEntries(prev=>[...prev,...inserted.map(e=>({id:e.id,staffId:e.staff_id,jobId:e.job_id,subItemId:e.sub_item_id,dateStr:e.date_str,slot:e.slot,hours:Number(e.hours),miscNote:e.misc_note||null,createdAt:e.created_at,hoursLocked:!!e.hours_locked}))]);
              setConflictAlert(null);setEntryModal(null);setTab("schedule");setSaving(false);
            },
            onCancel:()=>setConflictAlert(null),
          });
          return;
        }
        const inserted=await db("POST","entries",buildRows(valid));
        const newMapped=inserted.map(e=>({id:e.id,staffId:e.staff_id,jobId:e.job_id,subItemId:e.sub_item_id,dateStr:e.date_str,slot:e.slot,hours:Number(e.hours),miscNote:e.misc_note||null,createdAt:e.created_at,hoursLocked:!!e.hours_locked}));
        pushUndo("addEntries",{ids:newMapped.map(e=>e.id)});
        setEntries(prev=>[...prev,...newMapped]);
      } else {
        const prevEntry=entries.find(e=>e.id===data.id);
        // Moving an entry to a new day/slot makes it the newest arrival there
        // for capacity-conflict purposes - otherwise an old entry dragged into
        // a fresh conflict would still "win" on its original creation date,
        // even though it's the one that just showed up.
        const relocated=prevEntry&&(prevEntry.dateStr!==data.dateStr||prevEntry.slot!==data.slot);
        const newCreatedAt=relocated?new Date().toISOString():undefined;
        // Saving an edit through this modal is always a deliberate choice of
        // hours, so it locks the entry - the background correction pass will
        // leave it as the person set it instead of re-deriving it from the
        // item's remaining budget on the very next pass.
        const hoursLocked=data.entryType!=="misc";
        await db("PATCH","entries",{
          staff_id:data.staffId,
          job_id:data.entryType==="misc"?null:data.jobId,
          sub_item_id:data.entryType==="misc"?null:data.subItemId||null,
          date_str:data.dateStr,slot:data.slot,hours:data.hours,
          misc_note:data.entryType==="misc"?data.miscNote:null,
          hours_locked:hoursLocked,
          ...(newCreatedAt?{created_at:newCreatedAt}:{})
        },`?id=eq.${data.id}`);
        if(prevEntry) pushUndo("editEntry",{prev:prevEntry});
        setEntries(prev=>prev.map(e=>e.id===data.id?{...e,staffId:data.staffId,jobId:data.entryType==="misc"?null:data.jobId,subItemId:data.entryType==="misc"?null:data.subItemId||null,dateStr:data.dateStr,slot:data.slot,hours:data.hours,miscNote:data.entryType==="misc"?data.miscNote:null,hoursLocked,...(newCreatedAt?{createdAt:newCreatedAt}:{})}:e));
      }
      setEntryModal(null);setTab("schedule");
    }catch(e){setError("Failed to save entry.");}
    setSaving(false);
  }

  async function removeEntry(id){
    const entry=entries.find(e=>e.id===id);
    if(!entry)return;
    // Disappear immediately - don't make the user wait on the delete to
    // round-trip before the modal closes and the entry is gone.
    pushUndo("deleteEntry",{entry});
    setEntries(prev=>prev.filter(e=>e.id!==id));
    setEntryModal(null);
    try{
      await db("DELETE","entries",null,`?id=eq.${id}`);
    }catch(e){
      setError("Failed to remove entry - restored.");
      setEntries(prev=>[...prev,entry]);
      setUndoStack(s=>s.slice(0,-1));
    }
  }

  async function saveJob(data){
    setSaving(true);
    try{
      if(data.isNew){
        const [newJob]=await db("POST","jobs",[{job_no:data.jobNo,name:data.name,bg_color:data.bgColor,border_color:data.borderColor,text_color:data.textColor}]);
        setJobs(prev=>[...prev,{id:newJob.id,jobNo:newJob.job_no,name:newJob.name,bgColor:newJob.bg_color,borderColor:newJob.border_color,textColor:newJob.text_color,completed:!!newJob.completed}]);
        const validSubs=data.subItems.filter(s=>s.name.trim());
        if(validSubs.length>0){const inserted=await db("POST","sub_items",validSubs.map(s=>({job_id:newJob.id,name:s.name,total_hours:s.totalHours||0})));setSubItems(prev=>[...prev,...inserted.map(s=>({id:s.id,jobId:s.job_id,name:s.name,totalHours:Number(s.total_hours)||0}))]);}
      }else{
        await db("PATCH","jobs",{job_no:data.jobNo,name:data.name,bg_color:data.bgColor,border_color:data.borderColor,text_color:data.textColor},`?id=eq.${data.id}`);
        setJobs(prev=>prev.map(j=>j.id===data.id?{...j,jobNo:data.jobNo,name:data.name,bgColor:data.bgColor,borderColor:data.borderColor,textColor:data.textColor}:j));
        const existing=subItems.filter(s=>s.jobId===data.id);
        const toDelete=existing.filter(s=>!data.subItems.find(ds=>ds.id===s.id));
        // Safety check: never silently delete a joinery item that still has entries
        // scheduled against it - block and tell the user to unschedule it first.
        const blocked=toDelete.filter(s=>entries.some(e=>e.subItemId===s.id));
        if(blocked.length>0){
          setSaving(false);
          setError(`Can't remove "${blocked.map(s=>s.name).join(", ")}" - it still has scheduled entries. Unschedule it from Job Summary first.`);
          return;
        }
        for(const s of toDelete)await db("DELETE","sub_items",null,`?id=eq.${s.id}`);
        setSubItems(prev=>prev.filter(s=>!toDelete.find(d=>d.id===s.id)));
        const toAdd=data.subItems.filter(s=>s.isNew&&s.name.trim());
        if(toAdd.length>0){const inserted=await db("POST","sub_items",toAdd.map(s=>({job_id:data.id,name:s.name,total_hours:s.totalHours||0})));setSubItems(prev=>[...prev,...inserted.map(s=>({id:s.id,jobId:s.job_id,name:s.name,totalHours:Number(s.total_hours)||0}))]);}
        const toUpdate=data.subItems.filter(s=>!s.isNew&&s.name.trim());
        for(const s of toUpdate){await db("PATCH","sub_items",{name:s.name,total_hours:s.totalHours||0},`?id=eq.${s.id}`);setSubItems(prev=>prev.map(si=>si.id===s.id?{...si,name:s.name,totalHours:s.totalHours||0}:si));}
      }
      setJobModal(null);
    }catch(e){setError("Failed to save job.");}
    setSaving(false);
  }

  function deleteJob(id){
    const job=jobs.find(j=>j.id===id);
    const entryCount=entries.filter(e=>e.jobId===id).length;
    const msg=entryCount>0
      ?`Delete "${job?.jobNo} ${job?.name}"? This will permanently delete it and all ${entryCount} scheduled entries against it. This cannot be undone.`
      :`Delete "${job?.jobNo} ${job?.name}"? This cannot be undone.`;
    setConfirmDialog({message:msg,danger:true,confirmLabel:"Delete",onConfirm:async()=>{
      setConfirmDialog(null);
      setSaving(true);
      try{
        const jobEntryIds=entries.filter(e=>e.jobId===id).map(e=>e.id);
        const jobSubIds=subItems.filter(s=>s.jobId===id).map(s=>s.id);
        // Delete children explicitly first - don't rely on the DB having
        // ON DELETE CASCADE set up, since deleting the job row while entries/
        // sub_items still reference it would otherwise fail with a foreign
        // key violation and silently do nothing.
        if(jobEntryIds.length>0)await db("DELETE","entries",null,`?id=in.(${jobEntryIds.join(",")})`);
        if(jobSubIds.length>0)await db("DELETE","sub_items",null,`?id=in.(${jobSubIds.join(",")})`);
        await db("DELETE","jobs",null,`?id=eq.${id}`);
        setJobs(prev=>prev.filter(j=>j.id!==id));
        setSubItems(prev=>prev.filter(s=>s.jobId!==id));
        setEntries(prev=>prev.filter(e=>e.jobId!==id));
        setJobModal(null);
      }
      catch(e){setError("Failed to delete job.");}
      setSaving(false);
    }});
  }

  // Marking a job complete only pulls it out of the Job Summary tab (and, as
  // a side effect, the quick-edit pill row and the "new entry" job picker,
  // since those already draw from the same active-jobs bucket) - it never
  // touches any entry, so the Schedule tab keeps showing its history exactly
  // as before. Reopening just flips the same flag back.
  async function toggleJobCompleted(id,completed){
    setSaving(true);
    try{
      await db("PATCH","jobs",{completed},`?id=eq.${id}`);
      setJobs(prev=>prev.map(j=>j.id===id?{...j,completed}:j));
      setJobModal(null);
    }catch(e){setError("Failed to update job.");}
    setSaving(false);
  }

  async function saveStaff(data){
    setSaving(true);
    try{
      if(data.isNew){
        const [ns]=await db("POST","staff",[{name:data.name,productive_hours:data.productiveHours||8}]);
        setStaff(prev=>[...prev,{id:ns.id,name:ns.name,productiveHours:Number(ns.productive_hours)||8}]);
      }else{
        await db("PATCH","staff",{name:data.name,productive_hours:data.productiveHours||8},`?id=eq.${data.id}`);
        setStaff(prev=>prev.map(s=>s.id===data.id?{...s,name:data.name,productiveHours:data.productiveHours||8}:s));
      }
      setStaffModal(null);
    }catch(e){setError("Failed to save staff.");}
    setSaving(false);
  }

  function removeStaff(id){
    const s=staff.find(x=>x.id===id);
    const entryCount=entries.filter(e=>e.staffId===id).length;
    const msg=entryCount>0
      ?`Remove ${s?.name}? This will permanently delete them and all ${entryCount} of their scheduled entries. This cannot be undone.`
      :`Remove ${s?.name}? This cannot be undone.`;
    setConfirmDialog({message:msg,danger:true,confirmLabel:"Remove",onConfirm:async()=>{
      setConfirmDialog(null);
      setSaving(true);
      try{
        const staffEntryIds=entries.filter(e=>e.staffId===id).map(e=>e.id);
        if(staffEntryIds.length>0)await db("DELETE","entries",null,`?id=in.(${staffEntryIds.join(",")})`);
        await db("DELETE","staff",null,`?id=eq.${id}`);
        setStaff(prev=>prev.filter(s=>s.id!==id));
        setEntries(prev=>prev.filter(e=>e.staffId!==id));
        setStaffModal(null);
      }
      catch(e){setError("Failed to remove staff.");}
      setSaving(false);
    }});
  }

  async function performGroupMove(anchorEntry,toStaffId,toDateStr,toSlot){
    if(!canEdit)return;
    if(isPast(toDateStr))return;
    const idsToMove=[...selectedEntries];
    try{
      // Sort all selected entries by date
      const sortedSelected=[...idsToMove].sort((a,b)=>{
        const ea=entries.find(x=>x.id===a);
        const eb=entries.find(x=>x.id===b);
        return ea.dateStr.localeCompare(eb.dateStr);
      });

      // Build list of working days relative to drop target, based on UNIQUE dates
      // (multiple entries can share a date, e.g. Slot 1 + Slot 2 on the same day -
      // indexing by raw entry position would spread those across extra days)
      function getWorkingDay(baseDate, offset){
        return isoDate(addWorkingDays(baseDate, offset));
      }

      const uniqueDates=[...new Set(sortedSelected.map(id=>entries.find(x=>x.id===id).dateStr))].sort();
      const draggedDateIdx=uniqueDates.indexOf(anchorEntry.dateStr);
      const tgtDate=parseISO(toDateStr);
      const dateOffsetByDate=Object.fromEntries(uniqueDates.map((ds,i)=>[ds,i-draggedDateIdx]));
      const idToDate=Object.fromEntries(sortedSelected.map(id=>{
        const en=entries.find(x=>x.id===id);
        return[id,getWorkingDay(tgtDate,dateOffsetByDate[en.dateStr])];
      }));

      // Preserve each entry's slot relative to the anchor entry's slot, so a
      // Slot1+Slot2 pair stays a Slot1+Slot2 pair instead of collapsing onto one slot
      const slotOffset=toSlot-anchorEntry.slot;
      const idToSlot=Object.fromEntries(idsToMove.map(id=>{
        const en=entries.find(x=>x.id===id);
        return[id,Math.min(1,Math.max(0,en.slot+slotOffset))];
      }));

      // Preserve each entry's staff row relative to the anchor entry's staff row,
      // so dropping copies the exact layout across staff instead of collapsing onto one person
      const staffOrderIds=orderedStaff.map(s=>s.id);
      const origStaffIdx=staffOrderIds.indexOf(anchorEntry.staffId);
      const targetStaffIdx=staffOrderIds.indexOf(toStaffId);
      const rowOffset=targetStaffIdx-origStaffIdx;
      const idToStaff=Object.fromEntries(idsToMove.map(id=>{
        const en=entries.find(x=>x.id===id);
        const idx=staffOrderIds.indexOf(en.staffId);
        const newIdx=Math.min(staffOrderIds.length-1,Math.max(0,idx+rowOffset));
        return[id,staffOrderIds[newIdx]];
      }));

      const prevStates=idsToMove.map(id=>{
        const en=entries.find(x=>x.id===id);
        return{id,prevStaffId:en.staffId,prevDateStr:en.dateStr,prevSlot:en.slot,prevCreatedAt:en.createdAt,prevHours:en.hours};
      });
      pushUndo("moveMultiple",{prevStates});
      // Moving these entries makes them the newest arrivals wherever they
      // land, for capacity-conflict purposes - an old entry dragged into a
      // fresh conflict shouldn't still "win" on its original creation date.
      const movedAt=new Date().toISOString();
      // Same restoration as a single-entry drag (see handleDrop): if the one
      // entry being moved was capped by a same-day sibling at its old spot,
      // or was simply using its old staff member's whole day outright (no
      // sibling involved), and its new spot has no sibling, give it the new
      // staff member's whole day back instead of carrying over the old
      // number. Only applied for a single selected entry - a genuine
      // multi-entry group move can shift several mutually-dependent entries
      // together, where "was it capped" gets a lot less clear-cut, so those
      // keep their hours as-is like before.
      let newHoursById={};
      if(idsToMove.length===1){
        const id=idsToMove[0];
        const en=entries.find(x=>x.id===id);
        const newStaffId=idToStaff[id],newDate=idToDate[id],newSlot=idToSlot[id];
        const oldSibling=entries.find(o=>o.id!==id&&o.staffId===en.staffId&&o.dateStr===en.dateStr&&o.slot!==en.slot);
        const wasCappedByOldSibling=oldSibling&&wasScheduledFirst(oldSibling,en);
        const oldStaffCap=Number(staff.find(s=>s.id===en.staffId)?.productiveHours)||8;
        const wasOldStaffFullDay=Math.abs(Number(en.hours)-oldStaffCap)<0.05;
        const newSibling=entries.find(o=>o.id!==id&&o.staffId===newStaffId&&o.dateStr===newDate&&o.slot!==newSlot);
        // Same guard as handleDrop: don't force a full personal day onto an
        // entry landing back on a day another staff member is also working
        // the same joinery item - that's a shared/split budget day, and the
        // background correction pass is what should work out the real split.
        const sharedItemAtDest=en.subItemId&&entries.some(o=>o.id!==id&&o.subItemId===en.subItemId&&o.dateStr===newDate&&o.staffId!==newStaffId);
        if((wasCappedByOldSibling||wasOldStaffFullDay)&&!newSibling&&!sharedItemAtDest){
          newHoursById[id]=Number(staff.find(s=>s.id===newStaffId)?.productiveHours)||8;
        }
      }
      const updates=idsToMove.map(id=>({id,newDate:idToDate[id],newStaffId:idToStaff[id],newSlot:idToSlot[id],newHours:newHoursById[id]}));
      // Land the whole group immediately - don't make the user wait for every
      // PATCH to round-trip before the drop appears to take effect.
      setEntries(prev=>prev.map(x=>{
        const u=updates.find(u=>u.id===x.id);
        return u?{...x,staffId:u.newStaffId,dateStr:u.newDate,slot:u.newSlot,createdAt:movedAt,...(u.newHours!==undefined?{hours:u.newHours}:{})}:x;
      }));
      setSelectedEntries(new Set());
      setSelectionMode(false);
      setMoveMode(false);
      try{
        await Promise.all(updates.map(({id,newDate,newStaffId,newSlot,newHours})=>
          db("PATCH","entries",{staff_id:newStaffId,date_str:newDate,slot:newSlot,created_at:movedAt,...(newHours!==undefined?{hours:newHours}:{})},`?id=eq.${id}`)
        ));
      }catch(err){
        setError("Failed to move entries - reverted.");
        setEntries(prev=>prev.map(x=>{
          const ps=prevStates.find(p=>p.id===x.id);
          return ps?{...x,staffId:ps.prevStaffId,dateStr:ps.prevDateStr,slot:ps.prevSlot,createdAt:ps.prevCreatedAt,hours:ps.prevHours}:x;
        }));
        setUndoStack(s=>s.slice(0,-1));
      }
    }catch(err){setError("Failed to move entries.");}
  }
  async function performGroupCopy(anchorEntry,toStaffId,toDateStr,toSlot){
    if(!canEdit)return;
    if(isPast(toDateStr))return;
    const idsToCopy=[...selectedEntries];
    try{
      const sortedSelected=[...idsToCopy].sort((a,b)=>{
        const ea=entries.find(x=>x.id===a);
        const eb=entries.find(x=>x.id===b);
        return ea.dateStr.localeCompare(eb.dateStr);
      });

      // Same offset math as performGroupMove: unique-date based (so same-day
      // Slot1+Slot2 pairs copy together), slot relative to anchor, staff row
      // relative to anchor - reproducing the exact selected layout at the target.
      function getWorkingDay(baseDate, offset){
        return isoDate(addWorkingDays(baseDate, offset));
      }
      const uniqueDates=[...new Set(sortedSelected.map(id=>entries.find(x=>x.id===id).dateStr))].sort();
      const anchorDateIdx=uniqueDates.indexOf(anchorEntry.dateStr);
      const tgtDate=parseISO(toDateStr);
      const dateOffsetByDate=Object.fromEntries(uniqueDates.map((ds,i)=>[ds,i-anchorDateIdx]));
      const slotOffset=toSlot-anchorEntry.slot;
      const staffOrderIds=orderedStaff.map(s=>s.id);
      const origStaffIdx=staffOrderIds.indexOf(anchorEntry.staffId);
      const targetStaffIdx=staffOrderIds.indexOf(toStaffId);
      const rowOffset=targetStaffIdx-origStaffIdx;

      const planned=idsToCopy.map(id=>{
        const en=entries.find(x=>x.id===id);
        const newDate=getWorkingDay(tgtDate,dateOffsetByDate[en.dateStr]);
        const newSlot=Math.min(1,Math.max(0,en.slot+slotOffset));
        const idx=staffOrderIds.indexOf(en.staffId);
        const newStaffIdx=Math.min(staffOrderIds.length-1,Math.max(0,idx+rowOffset));
        const newStaffId=staffOrderIds[newStaffIdx];
        return{en,newDate,newSlot,newStaffId};
      });

      // Don't silently overwrite an existing entry - skip any target that's
      // already occupied and tell the user how many were skipped.
      const skipped=planned.filter(p=>!!entryMap[`${p.newStaffId}|${p.newDate}|${p.newSlot}`]);
      const toInsert=planned.filter(p=>!entryMap[`${p.newStaffId}|${p.newDate}|${p.newSlot}`]);
      if(toInsert.length===0){
        setError("Couldn't paste - every target slot is already occupied.");
        return;
      }

      const rows=toInsert.map(({en,newDate,newSlot,newStaffId})=>({
        staff_id:newStaffId,job_id:en.jobId||null,sub_item_id:en.subItemId||null,
        date_str:newDate,slot:newSlot,hours:en.hours,misc_note:en.miscNote||null,
        hours_locked:!!en.hoursLocked
      }));
      // Show the pasted copies immediately with temporary ids, swapped for the
      // real ones once the server confirms - removed again if the save fails.
      const tempEntries=toInsert.map(({en,newDate,newSlot,newStaffId},i)=>({
        id:`temp_copy_${Date.now()}_${i}`,staffId:newStaffId,jobId:en.jobId||null,subItemId:en.subItemId||null,
        dateStr:newDate,slot:newSlot,hours:en.hours,miscNote:en.miscNote||null,createdAt:new Date(Date.now()+i).toISOString(),
        hoursLocked:!!en.hoursLocked
      }));
      setEntries(prev=>[...prev,...tempEntries]);
      if(skipped.length>0) setError(`Pasted ${toInsert.length} - skipped ${skipped.length} (slot already occupied).`);
      // A single destination click lands the paste and exits Copy mode, the
      // same as Move - it shouldn't take an extra Enter/click to settle.
      setSelectedEntries(new Set());
      setSelectionMode(false);
      setCopyMode(false);
      const tempIds=tempEntries.map(t=>t.id);
      try{
        const inserted=await db("POST","entries",rows);
        const newEntries=inserted.map(i=>({id:i.id,staffId:i.staff_id,jobId:i.job_id,subItemId:i.sub_item_id,dateStr:i.date_str,slot:i.slot,hours:Number(i.hours),miscNote:i.misc_note||null,createdAt:i.created_at,hoursLocked:!!i.hours_locked}));
        setEntries(prev=>[...prev.filter(e=>!tempIds.includes(e.id)),...newEntries]);
        pushUndo("addEntries",{ids:newEntries.map(e=>e.id)});
      }catch(err){
        setError("Failed to copy entries.");
        setEntries(prev=>prev.filter(e=>!tempIds.includes(e.id)));
      }
    }catch(err){setError("Failed to copy entries.");}
  }
  function handleDragStart(e,entry){dragEntry.current=entry;e.dataTransfer.effectAllowed="move";}
  function handleDragOver(e,staffId,dateStr,slot){if(!canEdit||isPast(dateStr))return;e.preventDefault();e.dataTransfer.dropEffect=(e.ctrlKey||e.altKey||e.metaKey)?"copy":"move";setDropTarget({staffId,dateStr,slot});}
  function handleDragLeave(){setDropTarget(null);}
  async function handleDrop(e,toStaffId,toDateStr,toSlot){
    e.preventDefault();setDropTarget(null);
    const entry=dragEntry.current;if(!entry||!canEdit)return;
    if(isPast(toDateStr))return;
    // Holding Ctrl/Option while dropping copies instead of moves - the
    // standard desktop drag convention, and a one-step alternative to the
    // Select > Copy > tap-destination flow for a single entry.
    const isCopyDrag=e.ctrlKey||e.altKey||e.metaKey;
    // Multi-select: shift all entries by same date offset, preserve relative staff rows
    if(selectionMode&&selectedEntries.size>0&&selectedEntries.has(entry.id)){
      if(isCopyDrag) await performGroupCopy(entry,toStaffId,toDateStr,toSlot);
      else await performGroupMove(entry,toStaffId,toDateStr,toSlot);
      dragEntry.current=null;
      return;
    }
    // Single entry drag
    if(entry.staffId===toStaffId&&entry.dateStr===toDateStr&&entry.slot===toSlot){dragEntry.current=null;return;}
    if(isCopyDrag){
      if(entryMap[`${toStaffId}|${toDateStr}|${toSlot}`]){
        setError("Couldn't copy - that slot is already occupied.");
        dragEntry.current=null;
        return;
      }
      const tempId=`temp_copy_${Date.now()}`;
      const tempEntry={id:tempId,staffId:toStaffId,jobId:entry.jobId||null,subItemId:entry.subItemId||null,dateStr:toDateStr,slot:toSlot,hours:entry.hours,miscNote:entry.miscNote||null,createdAt:new Date().toISOString(),hoursLocked:!!entry.hoursLocked};
      setEntries(prev=>[...prev,tempEntry]);
      dragEntry.current=null;
      try{
        const inserted=await db("POST","entries",[{staff_id:toStaffId,job_id:entry.jobId||null,sub_item_id:entry.subItemId||null,date_str:toDateStr,slot:toSlot,hours:entry.hours,misc_note:entry.miscNote||null,hours_locked:!!entry.hoursLocked}]);
        const i=inserted[0];
        const newEntry={id:i.id,staffId:i.staff_id,jobId:i.job_id,subItemId:i.sub_item_id,dateStr:i.date_str,slot:i.slot,hours:Number(i.hours),miscNote:i.misc_note||null,createdAt:i.created_at,hoursLocked:!!i.hours_locked};
        setEntries(prev=>[...prev.filter(en=>en.id!==tempId),newEntry]);
        pushUndo("addEntries",{ids:[newEntry.id]});
      }catch(err){
        setError("Failed to copy entry.");
        setEntries(prev=>prev.filter(en=>en.id!==tempId));
      }
      return;
    }
    const prevState={staffId:entry.staffId,dateStr:entry.dateStr,slot:entry.slot,createdAt:entry.createdAt,hours:entry.hours};
    // If this entry's hours were being capped by a same-day sibling at its
    // OLD spot, and the new spot has no sibling to share the day with, its
    // stored hours should go back to using the whole day - otherwise a
    // reduction caused by that old conflict survives long after the
    // conflict itself is gone (e.g. dragged away to an empty day).
    const oldSibling=entries.find(o=>o.id!==entry.id&&o.staffId===entry.staffId&&o.dateStr===entry.dateStr&&o.slot!==entry.slot);
    const wasCappedByOldSibling=oldSibling&&wasScheduledFirst(oldSibling,entry);
    // Same idea for the other way an entry ends up short of a full day: it
    // was already using its PREVIOUS staff member's entire day (no sibling
    // involved at all), and moving it to someone with a higher cap should
    // give it their whole day too - not just carry over the old person's
    // number. Only when the stored hours exactly match the old staff's own
    // cap, so a genuinely partial entry (e.g. one person's share of a job
    // split across several staff) is never touched.
    const oldStaffCap=Number(staff.find(s=>s.id===entry.staffId)?.productiveHours)||8;
    const wasOldStaffFullDay=Math.abs(Number(entry.hours)-oldStaffCap)<0.05;
    const newSibling=entries.find(o=>o.id!==entry.id&&o.staffId===toStaffId&&o.dateStr===toDateStr&&o.slot!==toSlot);
    // Neither restoration should hand this entry a full personal day when
    // it's landing back on a day another staff member is ALSO working the
    // same joinery item - that's a shared/split budget day, not a solo one,
    // and forcing it to this person's whole cap would ignore the split.
    // Leave it as-is and let the background correction pass work out the
    // real split from the budget, the same way it does for any other
    // multi-staff item.
    const sharedItemAtDest=entry.subItemId&&entries.some(o=>o.id!==entry.id&&o.subItemId===entry.subItemId&&o.dateStr===toDateStr&&o.staffId!==toStaffId);
    const newHours=((wasCappedByOldSibling||wasOldStaffFullDay)&&!newSibling&&!sharedItemAtDest)
      ?(Number(staff.find(s=>s.id===toStaffId)?.productiveHours)||8)
      :entry.hours;
    pushUndo("moveEntry",{id:entry.id,prevStaffId:prevState.staffId,prevDateStr:prevState.dateStr,prevSlot:prevState.slot,prevCreatedAt:prevState.createdAt,prevHours:prevState.hours});
    // Dropping it here makes it the newest arrival at this day/slot for
    // capacity-conflict purposes - an old entry dragged into a fresh
    // conflict shouldn't still "win" on its original creation date.
    const movedAt=new Date().toISOString();
    // Move it on screen immediately - don't wait for the server round-trip to
    // show the drop landing. Roll back if the save actually fails.
    setEntries(prev=>prev.map(en=>en.id===entry.id?{...en,staffId:toStaffId,dateStr:toDateStr,slot:toSlot,createdAt:movedAt,hours:newHours}:en));
    dragEntry.current=null;
    try{
      await db("PATCH","entries",{staff_id:toStaffId,date_str:toDateStr,slot:toSlot,created_at:movedAt,hours:newHours},`?id=eq.${entry.id}`);
    }catch(err){
      setError("Failed to move entry - change reverted.");
      setEntries(prev=>prev.map(en=>en.id===entry.id?{...en,...prevState}:en));
      setUndoStack(s=>s.slice(0,-1));
    }
  }
  function handleDragEnd(){setDropTarget(null);dragEntry.current=null;}

  // One-time cleanup for entries whose stored Hours predate the daily-cap
  // fix - back when Auto-fill could write a raw value (like "8" for someone
  // capped at 6.5) bigger than the person could actually work that day. New
  // entries can no longer be saved that way, but this corrects what's
  // already sitting in the database so every entry's stored hours matches
  // what it should have been all along, instead of only being caught by the
  // background calculation at display time.
  //
  // Two different corrections apply, matching exactly what the grid itself
  // calculates and displays:
  // - A normal entry's stored hours should never exceed what that person
  //   could actually work that slot that day (the daily-cap rule).
  // - The entry that finishes a joinery item's budget should have its hours
  //   set to exactly what was left to finish it, not a full/capped day - the
  //   same number the grid shows for it. If even a full day there wouldn't
  //   be enough to finish it, it's treated as a normal (capacity-capped) day
  //   instead, since it isn't really "the last entry" in that case.
  // One full pass over a snapshot: work out every item's finishing entry and
  // what its hours should be, then cap every other entry at what the person
  // actually had left that day, checked against those finishing entries' NEW
  // hours (not their old, possibly-inflated ones).
  function oneCorrectionPass(working){
    const bySubItem={};
    working.forEach(e=>{
      if(e.miscNote||!e.subItemId)return;
      (bySubItem[e.subItemId]=bySubItem[e.subItemId]||[]).push(e);
    });
    const specialHours={}; // entryId -> newHours
    Object.values(bySubItem).forEach(siEntries=>{
      const si=subItems.find(s=>s.id===siEntries[0].subItemId);
      if(!si)return;
      const sorted=[...siEntries].sort((a,b)=>a.dateStr.localeCompare(b.dateStr));
      let completeIdx=-1,cumulative=0;
      const befores=[];
      sorted.forEach((e,i)=>{
        befores.push(cumulative);
        cumulative+=effectiveEntryHours(e,working,staff);
        if(completeIdx===-1&&cumulative>=si.totalHours-0.05)completeIdx=i;
      });
      const rawSpecialIdx=completeIdx!==-1?completeIdx:sorted.length-1;
      // A locked entry's hours are a deliberate, manually-set number, not
      // something this pass derives from what's left of the budget - so it
      // never plays the "special" (completing/under-cap) role. If that's
      // where the role would otherwise land, there's simply nothing left
      // for this pass to derive for the item right now.
      if(sorted[rawSpecialIdx].hoursLocked)return;
      const specialIdx=rawSpecialIdx;
      const special=sorted[specialIdx];
      const remainingBefore=si.totalHours-befores[specialIdx];
      const maxPossible=completeIdx===-1?maxPossibleHours(special,working,staff):Infinity;
      specialHours[special.id]=(completeIdx===-1&&remainingBefore>maxPossible+0.05)
        ?Math.round(maxPossible*2)/2
        :Math.max(0,Math.round(remainingBefore*2)/2);
    });
    const afterSpecial=working.map(e=>specialHours[e.id]!==undefined?{...e,hours:specialHours[e.id]}:e);
    return afterSpecial.map(e=>specialHours[e.id]!==undefined?e:{...e,hours:Math.round(effectiveEntryHours(e,afterSpecial,staff)*2)/2});
  }
  // Correcting one item's finishing entry can change how much capacity a
  // DIFFERENT item's entry has left that same day (when two items share a
  // staff member's day), which can in turn change what that other item's own
  // finishing entry should be. Repeat the pass until nothing moves anymore,
  // rather than requiring the same button to be clicked several times to
  // fully settle.
  function computeHoursCorrections(){
    let working=entries.map(e=>({...e,hours:Number(e.hours)}));
    for(let i=0;i<8;i++){
      const next=oneCorrectionPass(working);
      const changed=next.some((e,idx)=>Math.abs(e.hours-working[idx].hours)>0.05);
      working=next;
      if(!changed)break;
    }
    const corrections=[];
    entries.forEach((orig,idx)=>{
      const fixed=working[idx];
      if(Math.abs(Number(orig.hours)-fixed.hours)>0.05)corrections.push({id:orig.id,oldHours:Number(orig.hours),newHours:fixed.hours});
    });
    return corrections;
  }
  // Stored hours must stay correct on their own, not just at the moment
  // someone happens to run a cleanup - a drag, move, copy, delete or new
  // entry can change what a DIFFERENT entry's correct hours should be (a
  // capacity conflict appearing or disappearing, a joinery item's finishing
  // entry shifting to a different day), and that entry's own stored value
  // needs to follow automatically. This runs after every schedule change and
  // silently applies whatever corrections are needed, the same way the grid
  // display itself is always recalculated from current data - the stored
  // Hours field is just another thing that has to stay in sync, not a
  // one-off cleanup a person has to remember to trigger.
  const correctingRef=useRef(false);
  useEffect(()=>{
    if(!canEdit||correctingRef.current)return;
    const corrections=computeHoursCorrections();
    if(corrections.length===0)return;
    correctingRef.current=true;
    (async()=>{
      try{
        await Promise.all(corrections.map(c=>db("PATCH","entries",{hours:c.newHours},`?id=eq.${c.id}`)));
        setEntries(prev=>prev.map(e=>{
          const c=corrections.find(x=>x.id===e.id);
          return c?{...e,hours:c.newHours}:e;
        }));
      }catch(err){
        // Silent - the grid's own display still recalculates correctly from
        // whatever's stored, so a failed background correction here isn't
        // shown as a user-facing error. It'll be retried on the next change.
      }
      correctingRef.current=false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[entries,staff,subItems,canEdit]);

  function toggleSelectEntry(id){
    setSelectedEntries(prev=>{
      const next=new Set(prev);
      if(next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function deleteEntriesByIds(ids){
    if(ids.length===0)return;
    const deletedEntries=ids.map(id=>entries.find(e=>e.id===id)).filter(Boolean);
    // Clear them immediately - don't make the user wait on the delete to
    // round-trip before the selection disappears.
    pushUndo("deleteMultiple",{deletedEntries});
    const idSet=new Set(ids);
    setEntries(prev=>prev.filter(e=>!idSet.has(e.id)));
    setSelectedEntries(new Set());
    setSelectionMode(false);
    setMoveMode(false);
    setCopyMode(false);
    try{
      await db("DELETE","entries",null,`?id=in.(${ids.join(",")})`);
    }catch(e){
      setError("Failed to delete entries - restored.");
      setEntries(prev=>[...prev,...deletedEntries]);
      setUndoStack(s=>s.slice(0,-1));
    }
  }
  function deleteSelectedEntries(){
    return deleteEntriesByIds([...selectedEntries]);
  }

  function nextPreset(){return JOB_COLOUR_PRESETS[jobs.length%JOB_COLOUR_PRESETS.length];}

  const moveAnchor=useMemo(()=>{
    if(selectedEntries.size===0)return null;
    const objs=[...selectedEntries].map(id=>entries.find(e=>e.id===id)).filter(Boolean);
    if(objs.length===0)return null;
    return [...objs].sort((a,b)=>a.dateStr.localeCompare(b.dateStr))[0];
  },[selectedEntries,entries]);
  const roleColors={admin:"#FEF3C7",manager:"#DBEAFE",staff:"#F0FDF4"};
  const roleTextColors={admin:"#92400E",manager:"#1D4ED8",staff:"#15803D"};

  if(isLandscapePhone) return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#0F172A",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16,padding:24,textAlign:"center"}}>
      <div style={{fontSize:40,transform:"rotate(90deg)"}}>📱</div>
      <div style={{color:"#fff",fontSize:16,fontWeight:600}}>Please rotate your device</div>
      <div style={{color:"#94A3B8",fontSize:13,maxWidth:280}}>This app is designed for portrait mode on a phone. Turn your phone upright to keep using it.</div>
    </div>
  );

  if(loading) return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#F8FAFC",minHeight:"100vh"}}>
      <div style={{background:BRAND_HEADER_BG,padding:"14px 24px",display:"flex",alignItems:"center",gap:14}}>
        <img src={logoSrc} alt="Logo" style={{height:44,maxWidth:120,objectFit:"contain"}}/>
        <div><div style={{fontSize:20,fontWeight:700,color:"#E8A030"}}>{companyName}</div><div style={{fontSize:11,color:BRAND_GOLD,letterSpacing:"2px",textTransform:"uppercase"}}>{companyTagline}</div></div>
      </div>
      <Spinner text="Loading schedule..."/>
    </div>
  );

  return (
    <div style={{fontFamily:"'Segoe UI',system-ui,sans-serif",background:"#F8FAFC",minHeight:"100vh",...(isMobile?{height:viewportHeight||"100%",overflow:"hidden"}:{})}}>

      {/* Header */}
      <div ref={headerRef} style={{background:theme.header,padding:isMobile?"env(safe-area-inset-top, 0px) 24px 0":"0 24px",position:isMobile?"relative":"sticky",top:isMobile?undefined:0,zIndex:100,boxShadow:"0 2px 8px rgba(0,0,0,0.15)",flexShrink:0}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",paddingTop:10,paddingBottom:10,flexWrap:"wrap",rowGap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:isMobile?8:14}}>
            <img src={logoSrc} alt="Logo" style={{height:isMobile?36:48,maxWidth:isMobile?90:130,objectFit:"contain"}}/>
            <div>
              <div style={{fontSize:isMobile?15:20,fontWeight:700,color:theme.heading,lineHeight:1.2}}>{companyName}</div>
              {isMobile
                ?<div style={{fontSize:10,color:theme.sub,opacity:0.7,marginTop:2}}>Production Schedule</div>
                :<div style={{fontSize:11,color:theme.heading,letterSpacing:"2px",textTransform:"uppercase",marginTop:2}}>{companyTagline}</div>}
            </div>
            {!isMobile&&<>
              <div style={{width:1,height:36,background:theme.heading,opacity:0.35,margin:"0 8px"}}/>
              <div style={{fontSize:14,color:theme.sub,opacity:0.7}}>Production Schedule</div>
            </>}
            {saving&&!isMobile&&<div style={{fontSize:12,color:theme.heading,marginLeft:8}}>Saving...</div>}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",rowGap:8}}>
            {isManager&&!isMobile&&(
              <button onClick={()=>setJobModal({isNew:true,jobNo:"",name:"",...nextPreset(),subItems:[]})}
                style={{padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",border:`1.5px solid ${theme.heading}`,background:theme.heading,color:theme.header}}
                onMouseEnter={e=>{e.currentTarget.style.opacity=0.85;}}
                onMouseLeave={e=>{e.currentTarget.style.opacity=1;}}>
                + Add Job
              </button>
            )}
            {!isMobile&&(
              <button onClick={()=>setWorkHoursOpen(true)}
                    style={{padding:"7px 12px",borderRadius:8,fontSize:12,cursor:"pointer",border:`1.5px solid ${hexToRgba(theme.heading,0.5)}`,background:hexToRgba(theme.heading,0.1),color:theme.heading,fontWeight:500}}>
                    🕐 {workStart}–{workEnd}
                  </button>
            )}
            {isAdmin&&!isMobile&&(
              <button onClick={()=>setUserMgmtOpen(true)}
                style={{padding:"7px 12px",borderRadius:8,fontSize:12,fontWeight:600,cursor:"pointer",border:`1.5px solid ${hexToRgba(theme.heading,0.4)}`,background:"transparent",color:theme.heading}}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=theme.heading;}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=hexToRgba(theme.heading,0.4);}}>
                👥 Users
              </button>
            )}
            {isManager&&!isMobile&&(
              <button onClick={()=>setStaffModal({isNew:true,name:"",productiveHours:8})}
                style={{padding:"7px 14px",borderRadius:8,fontSize:13,fontWeight:600,cursor:"pointer",border:`1.5px solid ${theme.heading}`,background:"transparent",color:theme.heading}}
                onMouseEnter={e=>{e.currentTarget.style.background=theme.heading;e.currentTarget.style.color=theme.header;}}
                onMouseLeave={e=>{e.currentTarget.style.background="transparent";e.currentTarget.style.color=theme.heading;}}>
                + Add Staff
              </button>
            )}
            {!isMobile&&(
              <div style={{display:"flex",flexDirection:"column",alignItems:"stretch",gap:2}}>
                <div style={{display:"flex",alignItems:"center",gap:6,background:"rgba(255,255,255,0.08)",borderRadius:7,padding:"3px 10px"}}>
                  <div style={{width:22,height:22,borderRadius:"50%",background:theme.heading,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:theme.header,flexShrink:0}}>
                    {currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div style={{fontSize:12,color:theme.sub,fontWeight:500,lineHeight:1.2}}>{currentUser.name}</div>
                    <div style={{fontSize:9,background:roleColors[currentUser.role],color:roleTextColors[currentUser.role],borderRadius:4,padding:"0 4px",fontWeight:600,textTransform:"uppercase",display:"inline-block"}}>{currentUser.role}</div>
                  </div>
                </div>
                <button onClick={onLogout} style={{padding:"3px 10px",borderRadius:7,fontSize:11,cursor:"pointer",border:"1px solid rgba(255,255,255,0.15)",background:"transparent",color:hexToRgba(theme.sub,0.6)}}>Sign Out</button>
              </div>
            )}
            {isMobile&&(
              <button onClick={onLogout} style={{padding:"7px 10px",borderRadius:8,fontSize:12,cursor:"pointer",border:"1px solid rgba(255,255,255,0.15)",background:"transparent",color:hexToRgba(theme.sub,0.6)}}>Sign Out</button>
            )}
          </div>
        </div>
        {!isMobile&&(
          <div style={{display:"flex"}}>
            {[["schedule","📅 Schedule"],["summary","📋 Job Summary"]].map(([key,label])=>(
              <button key={key} onClick={()=>setTab(key)} style={{padding:"9px 22px",fontSize:14,fontWeight:500,cursor:"pointer",background:"none",border:"none",borderBottom:tab===key?`2.5px solid ${theme.heading}`:"2.5px solid transparent",color:tab===key?theme.heading:hexToRgba(theme.sub,0.55),transition:"all 0.15s"}}>{label}</button>
            ))}
          </div>
        )}
      </div>

      {error&&(
        <div style={{background:"#FEF2F2",border:"1px solid #FECACA",padding:"10px 20px",display:"flex",justifyContent:"space-between",alignItems:"center",flexShrink:0}}>
          <span style={{color:"#DC2626",fontSize:14}}>⚠ {error}</span>
          <button onClick={()=>setError(null)} style={{background:"none",border:"none",color:"#DC2626",cursor:"pointer",fontSize:16}}>×</button>
        </div>
      )}

      {/* Schedule Tab */}
      {tab==="schedule"&&(
        <div style={{padding:"0 16px 16px",position:"relative",zIndex:1}}>
          <div ref={toolbarBlockRef}>
          <div style={{position:isMobile?"relative":"sticky",top:isMobile?undefined:headerHeight,zIndex:50,background:"#F8FAFC",paddingTop:isMobile?6:12,paddingBottom:isMobile?4:8,marginBottom:4,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:isMobile?6:12,marginBottom:isMobile?4:8,flexWrap:"wrap"}}>
            <div style={{display:"flex",background:"#E2E8F0",borderRadius:8,padding:3,gap:2}}>
              {[[1,"1 Week"],[2,"2 Weeks"],[3,"3 Weeks"],[4,"4 Weeks"],["month","Month"]].map(([v,label])=>(
                <button key={v} onClick={()=>{if(v==="month"){setViewMode("month");}else{setViewMode("weeks");setViewWeeks(v);}}}
                  style={{padding:isMobile?"3px 8px":"5px 12px",borderRadius:6,border:"none",fontSize:isMobile?11:13,fontWeight:500,cursor:"pointer",background:(v==="month"&&viewMode==="month")||(v===viewWeeks&&viewMode!=="month")?"#fff":"transparent",color:(v==="month"&&viewMode==="month")||(v===viewWeeks&&viewMode!=="month")?"#1E293B":"#64748B"}}>
                  {isMobile?(v==="month"?"Mo":`${v}w`):label}
                </button>
              ))}
            </div>
            <div style={{display:"flex",alignItems:"center",gap:isMobile?4:6}}>
              <button onClick={()=>navigate(-1)} style={{padding:isMobile?"3px 8px":"5px 11px",border:"1px solid #CBD5E1",borderRadius:7,background:"#fff",cursor:"pointer",fontSize:isMobile?13:16,color:"#475569"}}>‹</button>
              <button onClick={goToday} style={{padding:isMobile?"3px 10px":"5px 14px",border:"1px solid #CBD5E1",borderRadius:7,background:"#fff",cursor:"pointer",fontSize:isMobile?11:13,color:"#475569"}}>Today</button>
              <button onClick={()=>navigate(1)} style={{padding:isMobile?"3px 8px":"5px 11px",border:"1px solid #CBD5E1",borderRadius:7,background:"#fff",cursor:"pointer",fontSize:isMobile?13:16,color:"#475569"}}>›</button>
            </div>
            <span style={{fontSize:isMobile?11:13,color:"#64748B"}}>{formatDateRangeCompact(anchorDate,addDays(anchorDate,totalWeeks*7-2))}</span>
            <div style={{marginLeft:"auto",display:"flex",gap:6,alignItems:"center"}}>
              {canEdit&&!isMobile&&(
                <>
                  <button onClick={()=>{setSelectionMode(s=>!s);setSelectedEntries(new Set());setMoveMode(false);setCopyMode(false);}}
                    style={{padding:"5px 12px",border:"1px solid #CBD5E1",borderRadius:7,background:selectionMode?"#3B82F6":"#fff",cursor:"pointer",fontSize:12,color:selectionMode?"#fff":"#64748B"}}>
                    {selectionMode?"✓ Selecting":"Select"}
                  </button>
                  {selectionMode&&selectedEntries.size>0&&(
                    <>
                      <button onClick={deleteSelectedEntries}
                        style={{padding:"5px 12px",border:"1px solid #FECACA",borderRadius:7,background:"#FEF2F2",cursor:"pointer",fontSize:12,color:"#EF4444",fontWeight:600}}>
                        Delete {selectedEntries.size}
                      </button>
                      <button onClick={()=>{setMoveMode(m=>!m);setCopyMode(false);}}
                        style={{padding:"5px 12px",border:"1px solid #BBF7D0",borderRadius:7,background:moveMode?"#15803D":"#F0FDF4",cursor:"pointer",fontSize:12,color:moveMode?"#fff":"#15803D",fontWeight:600}}>
                        {moveMode?"Tap destination…":`Move ${selectedEntries.size}`}
                      </button>
                      <button onClick={()=>{setCopyMode(c=>!c);setMoveMode(false);}}
                        style={{padding:"5px 12px",border:"1px solid #93C5FD",borderRadius:7,background:copyMode?"#3B82F6":"#EFF6FF",cursor:"pointer",fontSize:12,color:copyMode?"#fff":"#1D4ED8",fontWeight:600}}>
                        {copyMode?"Tap destination…":`Copy ${selectedEntries.size}`}
                      </button>
                    </>
                  )}
                </>
              )}
              {!isMobile&&(
                <>
                  <button onClick={handleUndo} disabled={undoStack.length===0}
                    style={{padding:"5px 12px",border:"1px solid #CBD5E1",borderRadius:7,background:undoStack.length>0?"#fff":"#F8FAFC",cursor:undoStack.length>0?"pointer":"not-allowed",fontSize:12,color:undoStack.length>0?"#475569":"#CBD5E1"}}>
                    ↩ Undo
                  </button>
                  <button onClick={handleRedo} disabled={redoStack.length===0}
                    style={{padding:"5px 12px",border:"1px solid #CBD5E1",borderRadius:7,background:redoStack.length>0?"#fff":"#F8FAFC",cursor:redoStack.length>0?"pointer":"not-allowed",fontSize:12,color:redoStack.length>0?"#475569":"#CBD5E1"}}>
                    ↪ Redo
                  </button>
                </>
              )}
              <button onClick={loadAll} style={{padding:isMobile?"3px 8px":"5px 12px",border:"1px solid #CBD5E1",borderRadius:7,background:"#fff",cursor:"pointer",fontSize:isMobile?11:12,color:"#64748B"}}>↻ Refresh</button>
            </div>
          </div>

          {activeJobs.length>0&&!isMobile&&(
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10,position:"relative",zIndex:0}}>
              {activeJobs.map(j=>(
                <div key={j.id} onClick={canEdit?()=>setJobModal({isNew:false,...j,subItems:subItems.filter(s=>s.jobId===j.id)}):undefined}
                  style={{background:j.bgColor,border:`1.5px solid ${j.borderColor}`,color:j.textColor,borderRadius:6,padding:"3px 10px",fontSize:12,fontWeight:600,cursor:canEdit?"pointer":"default"}}>
                  {j.jobNo} {j.name}
                </div>
              ))}
            </div>
          )}

          </div>{/* end sticky controls */}
          {!canEdit&&<div style={{fontSize:11,color:"#94A3B8",marginBottom:8,background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:6,padding:"5px 10px",display:"inline-block",flexShrink:0}}>👁 View only — contact a manager to make changes</div>}
          </div>{/* end toolbarBlockRef */}

          <div style={{overflowX:"auto",overflowY:"auto",borderRadius:12,border:"1px solid #E2E8F0",background:"#fff",WebkitOverflowScrolling:"touch",...(isMobile?{maxHeight:mobileTableMaxHeight,paddingBottom:"env(safe-area-inset-bottom, 0px)"}:{maxHeight:"calc(100vh - 280px)"})}}>
            <table style={{borderCollapse:"separate",borderSpacing:0,minWidth:"100%",tableLayout:"auto"}}>
              <colgroup>
                <col style={{width:staffColWidth}}/>
                {visibleDays.map((_,i)=><col key={i} style={{width:118}}/>)}
              </colgroup>
              <thead>
                <tr>
                  <th style={{border:"1px solid #E2E8F0",background:"#F8FAFC",padding:"4px 8px",fontSize:12,color:"#64748B",textAlign:"left",fontWeight:600,position:"sticky",top:0,left:0,zIndex:20,verticalAlign:"bottom",width:staffColWidth,minWidth:staffColWidth}}></th>
                  {visibleDays.map((d,i)=>{
                    const ds=isoDate(d);const isToday=ds===todayStr;
                    const weekIdx=Math.floor(i/6);const isWeekBound=d.getDay()===1&&weekIdx>0;
                    const isSat=d.getDay()===6;
                    const isFirstDayOfWeek=i%6===0;
                    return(
                      <th key={i} style={{border:"1px solid #E2E8F0",borderLeft:isWeekBound?"2px solid #94A3B8":"1px solid #E2E8F0",background:isToday?"#DBEAFE":isSat?"#F1F5F9":"#F8FAFC",padding:"3px 3px",fontSize:11,color:isToday?"#1D4ED8":isSat?"#94A3B8":isPast(ds)?"#CBD5E1":"#64748B",textAlign:"center",fontWeight:isToday?700:500,position:"sticky",top:0,zIndex:9,minWidth:isMobile?100:undefined}}>
                        {totalWeeks>1&&isFirstDayOfWeek&&(
                          <div style={{fontSize:10,fontWeight:600,color:"#475569",background:"#F1F5F9",margin:"-3px -3px 2px -3px",padding:"2px 4px",borderBottom:"1px solid #E2E8F0"}}>
                            Week of {formatDate(addDays(anchorDate,weekIdx*7))}
                          </div>
                        )}
                        {totalWeeks>1&&!isFirstDayOfWeek&&(
                          <div style={{height:22,margin:"-3px -3px 2px -3px",borderBottom:"1px solid #E2E8F0",background:"#F1F5F9"}}/>
                        )}
                        <div style={{fontSize:11,fontWeight:600}}>{d.toLocaleDateString("en-AU",{weekday:"short"})} {d.getDate()}</div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {staff.length===0?(
                  <tr><td colSpan={visibleDays.length+2} style={{padding:40,textAlign:"center",color:"#94A3B8",fontSize:14}}>No staff yet{canEdit?" — click \"+ Add Staff\" to get started":""}</td></tr>
                ):orderedStaff.map((st,si)=>(
                  [0,1].map(slot=>(
                    <tr key={`${st.id}-${slot}`} style={{borderBottom:slot===1?'3px solid #94A3B8':'none',boxShadow:slot===1?'0 2px 0 0 #94A3B8':undefined}}>
                      {slot===0&&(
                        <td rowSpan={2}
                          draggable={!isMobile&&canEdit}
                          onDragStart={e=>handleStaffDragStart(e,st.id)}
                          onDragOver={e=>{e.preventDefault();}}
                          onDrop={e=>handleStaffDrop(e,st.id)}
                          style={{border:"1px solid #E2E8F0",borderBottom:"3px solid #94A3B8",padding:isMobile?"4px 4px":"4px 8px",verticalAlign:"middle",background:si%2===0?"#fff":"#F8FAFC",position:"sticky",left:0,zIndex:5,boxShadow:"2px 0 3px rgba(0,0,0,0.06)",width:staffColWidth,minWidth:staffColWidth,cursor:canEdit?"grab":"default"}}>
                          {canEdit&&!isMobile&&<div style={{fontSize:9,color:"#CBD5E1",marginBottom:1}}>⠿</div>}
                          <div style={{fontWeight:600,fontSize:isMobile?11:12,color:"#1E293B",marginBottom:1,overflowWrap:"break-word"}}>{st.name}</div>
                          {canEdit&&!isMobile&&<button onClick={()=>setStaffModal({isNew:false,...st})} style={{fontSize:11,color:"#94A3B8",background:"none",border:"1px solid #E2E8F0",borderRadius:4,padding:"1px 6px",cursor:"pointer"}}>Edit</button>}
                        </td>
                      )}
                      {visibleDays.map((d,di)=>{
                        const ds=isoDate(d);const isToday=ds===todayStr;
                        const weekIdx=Math.floor(di/5);const isWeekBound=d.getDay()===1&&weekIdx>0;
                        const isSat=d.getDay()===6;
                        const k=`${st.id}|${ds}|${slot}`;
                        const entry=entryMap[k];
                        const isDrop=dropTarget&&dropTarget.staffId===st.id&&dropTarget.dateStr===ds&&dropTarget.slot===slot&&!entry;
                        const isConflict=conflictKeys.has(k);
                        const otherSlotEntry=entryMap[`${st.id}|${ds}|${slot===0?1:0}`];
                        // Whichever entry was scheduled SECOND that day is only "Overcommitted"
                        // when the one scheduled FIRST already used up the person's entire daily
                        // cap, leaving nothing to draw on. If the first one has any capacity left
                        // over, the second entry silently absorbs it (via effectiveEntryHours
                        // below) instead of showing a warning. This isn't tied to slot number -
                        // whichever slot was actually filled in later is the one that can be
                        // "Overcommitted".
                        function computeIsOvercommitted(e){
                          return !!e&&!!otherSlotEntry&&!wasScheduledFirst(e,otherSlotEntry)&&(Number(otherSlotEntry.hours)||0)>=(Number(st.productiveHours)||8)-0.05;
                        }
                        // Works out a job entry's place in its sub-item's budget - factored out
                        // so both the entry's own block AND a companion empty slot (to flag
                        // leftover capacity once a job wraps up early) can use it.
                        function computeJobEntryMeta(e){
                          if(!e||e.miscNote||!e.subItemId)return null;
                          const si=subItems.find(s=>s.id===e.subItemId);
                          if(!si)return null;
                          const siEntries=entries.filter(x=>x.subItemId===si.id).sort((a,b)=>a.dateStr.localeCompare(b.dateStr));
                          const myIndex=siEntries.findIndex(x=>x.id===e.id);
                          // Walk the sub-item's entries in date order and find the one that first
                          // reaches (or passes) the total budget - that's the "completing" entry.
                          // If nothing ever reaches it, the true last entry stands in for that role
                          // instead - same formula, same display, just using whatever's left as of
                          // walking into it rather than an amount that happens to close the budget.
                          // Either way it's totalHours minus everything scheduled BEFORE it; this
                          // entry's own hours never enter into what's displayed. Anything scheduled
                          // after the completing entry is pure surplus ("over-run"). But if what's
                          // left before the final entry is more than a single day could ever cover
                          // (its own hours can never make up the gap), showing that full remaining
                          // figure would be a physically impossible claim - so that case shows the
                          // real shortfall instead: how much would still be left over even after a
                          // full day here.
                          let completeIdx=-1,cumulative=0;
                          const befores=[];
                          for(let i=0;i<siEntries.length;i++){
                            befores.push(cumulative);
                            const en=siEntries[i];
                            const effHours=effectiveEntryHours(en,entries,staff);
                            cumulative+=effHours;
                            if(completeIdx===-1&&cumulative>=si.totalHours-0.05)completeIdx=i;
                          }
                          const totalBudget=si.totalHours||null;
                          const rawSpecialIdx=completeIdx!==-1?completeIdx:siEntries.length-1;
                          // Mirrors oneCorrectionPass: a locked entry's hours are a
                          // deliberate manual number, never something derived from the
                          // remaining budget, so it's never shown as the special
                          // completing/under-cap entry either.
                          const specialIdx=siEntries[rawSpecialIdx]?.hoursLocked?-1:rawSpecialIdx;
                          const isSpecialEntry=specialIdx!==-1&&myIndex===specialIdx;
                          const isOverRun=completeIdx!==-1&&myIndex>completeIdx;
                          let isCompletingEntry=false,budgetRemaining=null,isUnderCap=false,underAmount=null;
                          if(isSpecialEntry){
                            const remainingBefore=si.totalHours-befores[myIndex];
                            const maxPossible=completeIdx===-1?maxPossibleHours(siEntries[myIndex],entries,staff):Infinity;
                            if(completeIdx===-1&&remainingBefore>maxPossible+0.05){
                              isUnderCap=true;
                              underAmount=Math.round((remainingBefore-maxPossible)*2)/2;
                            }else{
                              isCompletingEntry=true;
                              budgetRemaining=Math.max(0,Math.round(remainingBefore*2)/2);
                            }
                          }
                          // When more than one person is scheduled against the same item, each of
                          // them has their OWN last entry for it - not just whichever one entry the
                          // walk above picks as the single item-wide completing/under one. Every
                          // other staff member's own final entry should show their real, actual
                          // stored hours instead of the flat total-budget placeholder, the same way
                          // the one "special" entry does.
                          const myStaffEntries=siEntries.filter(x=>x.staffId===e.staffId);
                          const myLastEntry=myStaffEntries[myStaffEntries.length-1];
                          const isPersonalLastEntry=!isSpecialEntry&&!isOverRun&&myLastEntry?.id===e.id;
                          return {totalBudget,isSpecialEntry,isOverRun,isCompletingEntry,budgetRemaining,isUnderCap,underAmount,isPersonalLastEntry};
                        }
                        // Whenever this staff member doesn't have every hour of their day
                        // used/allocated - whatever sits in the other slot, job or misc, for
                        // whichever staff member it is - the empty slot flags that leftover
                        // capacity instead of showing a plain "+".
                        const showAvailableHours=!entry&&!!otherSlotEntry&&(Number(otherSlotEntry.hours)||0)<(Number(st.productiveHours)||8)-0.05;
                        // Renders whichever entry sits in this staff/day/slot - factored out so a
                        // conflict (two entries mapped to the same slot) can render BOTH of them
                        // side by side at half width instead of only ever showing one.
                        function renderEntryBlock(e,forceConflict){
                          const eJob=e&&!e.miscNote?jobs.find(j=>j.id===e.jobId):null;
                          const eSubItem=e&&e.subItemId?subItems.find(s=>s.id===e.subItemId):null;
                          const eIsOvercommitted=computeIsOvercommitted(e);
                          const blockOnClick=copyMode&&moveAnchor?()=>performGroupCopy(moveAnchor,st.id,ds,slot):moveMode&&moveAnchor?()=>performGroupMove(moveAnchor,st.id,ds,slot):selectionMode?()=>toggleSelectEntry(e.id):()=>openEditEntry(e);
                          const blockOnContextMenu=canEdit?ev=>openContextMenu(ev,e):undefined;
                          if(e.miscNote){
                            return <MiscBlock note={e.miscNote} hours={e.hours} entry={e} conflict={forceConflict} onClick={blockOnClick} onContextMenu={blockOnContextMenu} onDragStart={handleDragStart} onDragEnd={handleDragEnd} canEdit={canEdit} copyMode={copyMode} moveMode={moveMode} selected={selectedEntries.has(e.id)} selectionMode={selectionMode} isMobile={isMobile} isPastDate={isPast(ds)} isOvercommitted={eIsOvercommitted}/>;
                          }
                          if(!eJob){
                            return <EmptySlot onClick={copyMode&&moveAnchor?()=>performGroupCopy(moveAnchor,st.id,ds,slot):moveMode&&moveAnchor?()=>performGroupMove(moveAnchor,st.id,ds,slot):()=>openNewEntry(st.id,ds,slot)} isPastDate={isPast(ds)} canEdit={canEdit}/>;
                          }
                          const meta=computeJobEntryMeta(e)||{};
                          return <JobBlock job={eJob} subItem={eSubItem} hours={e.hours} productiveHours={st.productiveHours} entry={e} conflict={forceConflict} onClick={blockOnClick} onContextMenu={blockOnContextMenu} onDragStart={handleDragStart} onDragEnd={handleDragEnd} canEdit={canEdit} copyMode={copyMode} moveMode={moveMode} isCompletingEntry={meta.isCompletingEntry} budgetRemaining={meta.budgetRemaining} totalBudget={meta.totalBudget} selected={selectedEntries.has(e.id)} selectionMode={selectionMode} isOverRun={meta.isOverRun} isUnderCap={meta.isUnderCap} underAmount={meta.underAmount} isPersonalLastEntry={meta.isPersonalLastEntry} isMobile={isMobile} isPastDate={isPast(ds)} isOvercommitted={eIsOvercommitted}/>;
                        }
                        return(
                          <td key={di}
                            style={{border:"1px solid #E2E8F0",borderLeft:isWeekBound?"2px solid #94A3B8":"1px solid #E2E8F0",borderBottom:slot===1?"3px solid #94A3B8":"1px solid #E2E8F0",padding:2,verticalAlign:"top",background:isToday?"rgba(219,234,254,0.18)":isSat?"#F1F5F9":si%2===0?"#fff":"#FAFAFA",minWidth:isMobile?100:undefined}}
                            onDragOver={e=>handleDragOver(e,st.id,ds,slot)}
                            onDragLeave={handleDragLeave}
                            onDrop={e=>handleDrop(e,st.id,ds,slot)}>
                            {entry
                              ? isConflict
                                ? <div style={{display:"flex",gap:2}}>
                                    {(entriesByKey[k]||[entry]).slice(0,2).map(ce=>(
                                      <div key={ce.id} style={{flex:1,minWidth:0}}>{renderEntryBlock(ce,true)}</div>
                                    ))}
                                  </div>
                                : renderEntryBlock(entry,false)
                              : <EmptySlot onClick={copyMode&&moveAnchor?()=>performGroupCopy(moveAnchor,st.id,ds,slot):moveMode&&moveAnchor?()=>performGroupMove(moveAnchor,st.id,ds,slot):isSat?undefined:()=>openNewEntry(st.id,ds,slot)} isDropTarget={isDrop} isPastDate={isPast(ds)} canEdit={canEdit} available={showAvailableHours}/>
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
          <SummarySection jobs={activeJobs} entries={entries} subItems={subItems} staff={staff} setJobModal={canEdit?setJobModal:null} setEntryModal={canEdit?setEntryModal:null} setTab={setTab} archived={false} canEdit={canEdit} onUnschedule={async(ids)=>{setSaving(true);try{const deletedEntries=ids.map(id=>entries.find(e=>e.id===id)).filter(Boolean);await db("DELETE","entries",null,`?id=in.(${ids.join(",")})`);pushUndo("unscheduleItem",{deletedEntries});setEntries(prev=>prev.filter(e=>!ids.includes(e.id)));}catch(e){setError("Failed to unschedule.");}setSaving(false);}}/>
          {archivedJobs.length>0&&(
            <>
              <div style={{display:"flex",alignItems:"center",gap:12,marginTop:8}}>
                <div style={{flex:1,height:1,background:"#E2E8F0"}}/>
                <span style={{fontSize:12,color:"#94A3B8",fontWeight:500,whiteSpace:"nowrap"}}>Archived Jobs (all entries &gt; 1 month ago)</span>
                <div style={{flex:1,height:1,background:"#E2E8F0"}}/>
              </div>
              <SummarySection jobs={archivedJobs} entries={entries} subItems={subItems} staff={staff} setJobModal={canEdit?setJobModal:null} setEntryModal={canEdit?setEntryModal:null} setTab={setTab} archived={true} canEdit={canEdit} onUnschedule={null}/>
            </>
          )}
          {/* Completed jobs are deliberately left out of the sections above -
              this is just a way back to one if it was closed by mistake, not
              a third section to browse day-to-day. */}
          {canEdit&&completedJobs.length>0&&(
            <details style={{marginTop:8}}>
              <summary style={{cursor:"pointer",fontSize:12,color:"#94A3B8",fontWeight:500}}>Completed jobs ({completedJobs.length})</summary>
              <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10}}>
                {completedJobs.map(job=>(
                  <div key={job.id} onClick={()=>setJobModal({isNew:false,...job,subItems:subItems.filter(s=>s.jobId===job.id)})}
                    style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",border:`1.5px solid ${job.borderColor}`,borderRadius:8,background:job.bgColor,cursor:"pointer"}}>
                    <span style={{fontSize:13,fontWeight:600,color:job.textColor}}>{job.jobNo} — {job.name}</span>
                    <span style={{fontSize:11,color:job.textColor,opacity:0.75}}>completed · tap to reopen</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      {entryModal&&<EntryModal data={entryModal} staff={staff} jobs={jobs} subItems={subItems} entries={entries} onSave={saveEntry} onRemove={removeEntry} onClose={()=>setEntryModal(null)} saving={saving}/>}
      {jobModal&&<JobModal data={jobModal} onSave={saveJob} onDelete={deleteJob} onToggleComplete={toggleJobCompleted} onClose={()=>setJobModal(null)} saving={saving}/>}
      {staffModal&&<StaffModal data={staffModal} onSave={saveStaff} onRemove={removeStaff} onClose={()=>setStaffModal(null)} onMove={moveStaffOrder} isFirst={orderedStaff[0]?.id===staffModal.id} isLast={orderedStaff[orderedStaff.length-1]?.id===staffModal.id} saving={saving}/>}
      {userMgmtOpen&&<UserManagementModal onClose={()=>setUserMgmtOpen(false)} themeKey={themeKey} onChangeTheme={changeTheme} logoSrc={logoSrc} onChangeLogo={changeLogo} onResetLogo={resetLogo} companyName={companyName} onChangeCompanyName={changeCompanyName} companyTagline={companyTagline} onChangeCompanyTagline={changeCompanyTagline}/>}
      {workHoursOpen&&(
        <Modal title="🕐 Work Hours" onClose={()=>setWorkHoursOpen(false)} small>
          <div style={{marginBottom:12}}>
            <div style={{fontSize:12,color:"#64748B",marginBottom:4,fontWeight:500}}>Work Day Start</div>
            <input type="time" value={workStart} onChange={e=>setWorkStart(e.target.value)} style={{width:"100%",padding:"7px 10px",border:"1px solid #CBD5E1",borderRadius:8,fontSize:16,boxSizing:"border-box"}}/>
          </div>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:12,color:"#64748B",marginBottom:4,fontWeight:500}}>Work Day End</div>
            <input type="time" value={workEnd} onChange={e=>setWorkEnd(e.target.value)} style={{width:"100%",padding:"7px 10px",border:"1px solid #CBD5E1",borderRadius:8,fontSize:16,boxSizing:"border-box"}}/>
          </div>
          <div style={{padding:"10px 14px",background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,fontSize:13,color:"#15803D",fontWeight:500,marginBottom:12}}>
            Work day: {workStart} – {workEnd} = {workHoursPerDay}h/day
          </div>
          <div style={{display:"flex",justifyContent:"flex-end"}}>
            <Btn variant="primary" onClick={()=>setWorkHoursOpen(false)}>Save</Btn>
          </div>
        </Modal>
      )}
      {conflictAlert&&<ConfirmModal title="⚠ Scheduling Conflict" message={conflictAlert.message} cancelLabel="Go Back" confirmLabel="Schedule Anyway" danger onConfirm={conflictAlert.onConfirm} onCancel={conflictAlert.onCancel}/>}
      {confirmDialog&&<ConfirmModal {...confirmDialog} onCancel={()=>setConfirmDialog(null)}/>}
      {contextMenu&&(
        <div onClick={e=>e.stopPropagation()}
          style={{position:"fixed",left:Math.min(contextMenu.x,window.innerWidth-160),top:Math.min(contextMenu.y,window.innerHeight-180),zIndex:1200,background:"#fff",borderRadius:8,border:"1px solid #E2E8F0",boxShadow:"0 8px 24px rgba(0,0,0,0.18)",padding:4,minWidth:140}}>
          <button onClick={()=>{openEditEntry(contextMenu.entry);setContextMenu(null);}} style={contextMenuItemStyle}>✎ Edit</button>
          <button onClick={()=>{const id=contextMenu.entry.id;setSelectedEntries(new Set([id]));setSelectionMode(true);setCopyMode(true);setMoveMode(false);setContextMenu(null);}} style={contextMenuItemStyle}>⧉ Copy</button>
          <button onClick={()=>{const id=contextMenu.entry.id;setSelectedEntries(new Set([id]));setSelectionMode(true);setMoveMode(true);setCopyMode(false);setContextMenu(null);}} style={contextMenuItemStyle}>↕ Move</button>
          <div style={{height:1,background:"#F1F5F9",margin:"3px 0"}}/>
          <button onClick={()=>{deleteEntriesByIds([contextMenu.entry.id]);setContextMenu(null);}} style={{...contextMenuItemStyle,color:"#EF4444"}}>🗑 Delete</button>
        </div>
      )}
    </div>
  );
}

// ── Summary Section ───────────────────────────────────────────

function SummarySection({jobs,entries,subItems,staff,setJobModal,setEntryModal,setTab,archived,canEdit,onUnschedule}) {
  const [confirmDialog,setConfirmDialog]=useState(null);
  return (
    <>
      {jobs.map(job=>{
        const jobEntries=entries.filter(e=>e.jobId===job.id&&!e.miscNote);
        const jobSubs=subItems.filter(s=>s.jobId===job.id).sort((a,b)=>{
          const aS=a.name.trim().endsWith(" S")?0:a.name.trim().endsWith(" W")?1:2;
          const bS=b.name.trim().endsWith(" S")?0:b.name.trim().endsWith(" W")?1:2;
          if(aS!==bS)return aS-bS;
          return a.name.localeCompare(b.name);
        });
        const dates=jobEntries.map(e=>e.dateStr).sort();
        const totalDeducted=jobEntries.reduce((a,e)=>a+effectiveEntryHours(e,entries,staff),0);
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
                  <strong>{Math.round(totalDeducted*2)/2}h</strong> deducted {archived&&<em>(archived)</em>}
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
                  const deductedHours=siEntries.reduce((a,e)=>a+effectiveEntryHours(e,entries,staff),0);
                  const remaining=Math.round(((si.totalHours||0)-deductedHours)*2)/2;
                  const assignedStaff=[...new Set(siEntries.map(e=>e.staffId))].map(id=>staff.find(s=>s.id===id)?.name).filter(Boolean).join(", ");
                  let dateDisplay;
                  if(!siDates.length)dateDisplay=<em style={{color:"#94A3B8"}}>Not yet scheduled</em>;
                  else if(siDates.length===1)dateDisplay=formatDate(parseISO(siDates[0]));
                  else{const d1=parseISO(siDates[0]),d2=parseISO(siDates[siDates.length-1]);dateDisplay=`${formatDate(d1)} → ${formatDate(d2)} (${Math.round((d2-d1)/86400000)}d)`;}
                  return(
                    <tr key={si.id} style={{background:rowi%2===0?"#fff":"#FAFAFA",borderBottom:"1px solid #F1F5F9"}}>
                      <td style={{padding:"7px 12px",fontWeight:500,color:"#1E293B"}}>{si.name}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{si.totalHours?`${si.totalHours}h`:<em style={{color:"#94A3B8"}}>—</em>}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{deductedHours>0?`${Math.round(deductedHours*2)/2}h`:"—"}</td>
                      <td style={{padding:"7px 12px"}}>{si.totalHours>0?<span style={{color:remaining<0?"#EF4444":remaining===0?"#22C55E":"#F59E0B",fontWeight:600}}>{remaining>0?`${remaining}h left`:remaining===0?"✓ Done":`${Math.abs(remaining)}h over`}</span>:"—"}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{dateDisplay}</td>
                      <td style={{padding:"7px 12px",color:"#475569"}}>{assignedStaff||<em style={{color:"#94A3B8"}}>—</em>}</td>
                      <td style={{padding:"7px 12px",display:"flex",gap:4}}>
                        {canEdit&&!archived&&setEntryModal&&<button style={{fontSize:11,color:"#3B82F6",background:"none",border:"1px solid #BFDBFE",borderRadius:6,padding:"3px 10px",cursor:"pointer"}} onClick={()=>{setEntryModal({mode:"new",staffId:"",dateStr:todayStr,slot:0,jobId:job.id,subItemId:si.id,hours:8,autoFill:remaining>0,totalHours:remaining>0?remaining:8,entryType:"job",miscNote:""});setTab("schedule");}}>+ Schedule</button>}
                        {canEdit&&!archived&&siEntries.length>0&&onUnschedule&&<button style={{fontSize:11,color:"#EF4444",background:"none",border:"1px solid #FECACA",borderRadius:6,padding:"3px 10px",cursor:"pointer"}} onClick={()=>setConfirmDialog({message:`Remove all ${siEntries.length} scheduled entries for "${si.name}"?`,danger:true,confirmLabel:"Remove",onConfirm:()=>{setConfirmDialog(null);onUnschedule(siEntries.map(e=>e.id));}})}>Unschedule</button>}
                      </td>
                    </tr>
                  );
                })}
                {generalEntries.length>0&&(
                  <tr style={{background:"#FFF7ED",borderTop:"1px solid #FED7AA"}}>
                    <td style={{padding:"7px 12px",fontWeight:500,color:"#92400E"}}>General (no item)</td>
                    <td style={{padding:"7px 12px"}}>—</td>
                    <td style={{padding:"7px 12px",color:"#92400E"}}>{Math.round(generalEntries.reduce((a,e)=>a+effectiveEntryHours(e,entries,staff),0)*2)/2}h</td>
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
      {confirmDialog&&<ConfirmModal {...confirmDialog} onCancel={()=>setConfirmDialog(null)}/>}
    </>
  );
}

// ── Entry Modal ───────────────────────────────────────────────

function EntryModal({data,staff,jobs,subItems,entries,onSave,onRemove,onClose,saving}) {
  const [form,setForm]=useState(()=>{
    const jobSubs=subItems.filter(s=>s.jobId===data.jobId);
    const defaultSub=data.subItemId||(jobSubs[0]?.id||"");
    return{...data,subItemId:defaultSub,totalHours:data.totalHours||jobSubs[0]?.totalHours||0,entryType:data.entryType||"job",miscNote:data.miscNote||"",staffIds:data.staffId?[data.staffId]:[]};
  });
  const [autoFill,setAutoFill]=useState(data.autoFill!==false);

  function set(k,v){setForm(f=>({...f,[k]:v}));}
  const jobSubs=subItems.filter(s=>s.jobId===form.jobId);
  const selectedStaff=staff.find(s=>s.id===(form.staffIds[0]||form.staffId));
  const productiveHours=selectedStaff?.productiveHours||8;
  const selectedSub=jobSubs.find(s=>s.id===form.subItemId);
  const totalHours=form.totalHours||selectedSub?.totalHours||0;

  function handleJobChange(jobId){const subs=subItems.filter(s=>s.jobId===jobId);const first=subs[0];setForm(f=>({...f,jobId,subItemId:first?.id||"",totalHours:first?.totalHours||0}));}
  function handleSubChange(subItemId){const sub=jobSubs.find(s=>s.id===subItemId);setForm(f=>({...f,subItemId,totalHours:sub?.totalHours||f.totalHours}));}

  // An entry can never actually use more of a day than the staff member has
  // left - so the Hours field itself must be capped at that, not just the
  // background calculation. If there's already an entry in the other slot
  // that day, whichever of the two was scheduled first gets the full cap;
  // a brand-new entry (this one) is always the one scheduled second against
  // whatever's already there.
  const sameDayStaffId=form.staffIds[0]||form.staffId;
  const otherSlotEntry=entries.find(e=>e.staffId===sameDayStaffId&&e.dateStr===form.dateStr&&e.slot===(form.slot===0?1:0)&&e.id!==form.id);
  const maxHours=(()=>{
    if(!otherSlotEntry)return productiveHours;
    if(form.mode==="edit"){
      const mine=entries.find(e=>e.id===form.id);
      if(mine&&wasScheduledFirst(mine,otherSlotEntry))return productiveHours;
    }
    const otherEff=Math.min(Number(otherSlotEntry.hours)||0,productiveHours);
    return Math.max(0,Math.round((productiveHours-otherEff)*2)/2);
  })();
  // Keep the field itself honest if the cap changes underneath it (staff,
  // date or slot picked after Hours was already typed in) rather than
  // silently letting a now-too-high value sit there unnoticed.
  useEffect(()=>{
    if(form.entryType!=="misc"&&autoFill)return;
    if(form.hours>maxHours)set("hours",maxHours);
  },[maxHours]);

  const preview=useMemo(()=>{
    if(!autoFill||!form.dateStr||!totalHours||form.entryType==="misc")return[];
    return buildAutoFill(form.dateStr,totalHours,productiveHours);
  },[autoFill,form.dateStr,totalHours,productiveHours,form.entryType]);

  function handleSave(){
    const staffToSchedule=form.staffIds.length>0?form.staffIds:[form.staffId].filter(Boolean);
    if(staffToSchedule.length===0)return;
    if(form.entryType==="misc"){if(!form.miscNote.trim())return;}
    else if(!form.jobId)return;

    if(autoFill&&form.entryType!=="misc"&&form.totalHours>0&&staffToSchedule.length>1){
      // Split the budget hours directly, proportional to each person's productive rate.
      // (Splitting by whole days first and multiplying by rate can overshoot the budget
      // when the job's last day is partial - hours must be split, not days.)
      const staffWithPh=staffToSchedule.map(sid=>{
        const sf=staff.find(s=>s.id===sid);
        return{sid,ph:Number(sf?.productiveHours)||8};
      });
      const shares=splitHoursByStaff(staffWithPh,form.totalHours);

      // Build one combined batch across ALL staff and save it in a single call,
      // so a conflict on one person can't clobber another person's confirmation/save
      const combined=[];
      shares.forEach(({sid,ph,hours})=>{
        const fills=buildAutoFill(form.dateStr,Math.max(0,hours),ph);
        fills.forEach(p=>combined.push({dateStr:p.dateStr,hours:p.hours,staffId:sid}));
      });
      onSave({...form,staffId:staffToSchedule[0],autoFill},combined);
    } else {
      // Single staff, misc, or manual multi-staff (no autofill) - still one batch, one call
      const combined=[];
      staffToSchedule.forEach(sid=>{
        const sf=staff.find(s=>s.id===sid);
        const ph=Number(sf?.productiveHours)||8;
        if(autoFill&&form.entryType!=="misc"&&form.totalHours>0){
          const fills=buildAutoFill(form.dateStr,form.totalHours,ph);
          fills.forEach(p=>combined.push({dateStr:p.dateStr,hours:p.hours,staffId:sid}));
        } else {
          combined.push({dateStr:form.dateStr,hours:form.hours,staffId:sid});
        }
      });
      onSave({...form,staffId:staffToSchedule[0],autoFill},combined);
    }
  }

  useEffect(()=>{
    function onKey(e){if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSave();}}
    window.addEventListener("keydown",onKey);
    return()=>window.removeEventListener("keydown",onKey);
  },[form,autoFill,preview]);

  return(
    <Modal title={form.mode==="new"?"New Schedule Entry":"Edit Schedule Entry"} onClose={onClose} wide>
      {/* Entry type switcher */}
      <div style={{display:"flex",gap:6,marginBottom:14,background:"#F1F5F9",borderRadius:8,padding:3}}>
        {[["job","📋 Job Entry"],["misc","Misc Entry"]].map(([type,label])=>(
          <button key={type} onClick={()=>set("entryType",type)}
            style={{flex:1,padding:"6px",borderRadius:6,border:"none",fontSize:12,fontWeight:500,cursor:"pointer",background:form.entryType===type?"#fff":"transparent",color:form.entryType===type?"#1E293B":"#64748B",boxShadow:form.entryType===type?"0 1px 3px rgba(0,0,0,0.1)":"none"}}>
            {label}
          </button>
        ))}
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:24}}>
        {/* Left column: who, and what */}
        <div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:12,color:"#64748B",marginBottom:4,fontWeight:500}}>Staff Member(s)</div>
            <div style={{display:"flex",flexDirection:"column",gap:4,maxHeight:160,overflowY:"auto",border:"1px solid #CBD5E1",borderRadius:8,padding:"6px 10px"}}>
              {staff.map(s=>(
                <label key={s.id} style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#334155"}}>
                  <input type="checkbox" checked={form.staffIds.includes(s.id)}
                    onChange={e=>{
                      const newStaffIds=e.target.checked?[...form.staffIds,s.id]:form.staffIds.filter(id=>id!==s.id);
                      const newStaffId=e.target.checked?s.id:(form.staffIds.find(id=>id!==s.id)||"");
                      setForm(f=>{
                        const nextDate=data.mode==="new"&&newStaffIds.length>0&&entries
                          ?nextAvailableDate(newStaffIds,f.slot,entries,f.dateStr)
                          :f.dateStr;
                        return{...f,staffIds:newStaffIds,staffId:newStaffId,dateStr:nextDate};
                      });
                    }}
                    style={{width:14,height:14}}/>
                  {s.name} <span style={{fontSize:11,color:"#94A3B8"}}>({s.productiveHours}h/day)</span>
                </label>
              ))}
            </div>
          </div>

          {form.entryType==="misc"?(
            <Inp label="Description (e.g. Wash Cars, Study Leave)" value={form.miscNote} onChange={e=>set("miscNote",e.target.value)} placeholder="Enter description..."/>
          ):(
            <>
              <Sel label="Job" value={form.jobId} onChange={e=>handleJobChange(e.target.value)}>
                <option value="">— Select job —</option>
                {/* A completed job is hidden from new entries - but if this
                    entry already points at one (marked complete after the
                    fact), keep it in the list so the dropdown still shows
                    the entry's real job instead of going blank. */}
                {jobs.filter(j=>!j.completed||j.id===form.jobId).map(j=><option key={j.id} value={j.id}>{j.jobNo} – {j.name}{j.completed?" (completed)":""}</option>)}
              </Sel>
              {form.jobId&&(
                <Sel label="Joinery Item" value={form.subItemId||""} onChange={e=>handleSubChange(e.target.value)}>
                  {jobSubs.map(s=><option key={s.id} value={s.id}>{s.name}{s.totalHours?` (${s.totalHours}h budget)`:""}</option>)}
                  <option value="">General / no item</option>
                </Sel>
              )}
              {form.mode==="new"&&(
                <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#334155",marginTop:8}}>
                  <input type="checkbox" checked={autoFill} onChange={e=>setAutoFill(e.target.checked)} style={{width:15,height:15}}/>
                  Auto-fill consecutive days at each person's daily cap
                </label>
              )}
            </>
          )}
        </div>

        {/* Right column: when, and how many hours */}
        <div>
          <div style={{display:"flex",gap:8,marginBottom:8}}>
            {[[0,"Slot 1"],[1,"Slot 2"]].map(([val,label])=>(
              <button key={val} type="button" onClick={()=>set("slot",val)}
                style={{flex:1,padding:"8px",borderRadius:8,border:`1.5px solid ${form.slot===val?"#1D4ED8":"#93C5FD"}`,background:form.slot===val?"#3B82F6":"#EFF6FF",color:form.slot===val?"#fff":"#1D4ED8",fontSize:13,fontWeight:600,cursor:"pointer"}}>
                {label}
              </button>
            ))}
          </div>
          <div style={{marginBottom:8}}>
            <Inp label="Start Date" type="date" value={form.dateStr} min={todayStr} onChange={e=>set("dateStr",e.target.value)}/>
          </div>
          {form.mode==="new"&&(
            <button type="button" onClick={()=>{
                const ids=form.staffIds.length>0?form.staffIds:[form.staffId].filter(Boolean);
                if(ids.length===0)return;
                if(autoFill&&form.entryType!=="misc"&&form.totalHours>0){
                  // A day only counts as "available" if every day the auto-fill
                  // would actually use is free - not just the start day.
                  const staffWithPh=ids.map(sid=>{const sf=staff.find(s=>s.id===sid);return{sid,ph:Number(sf?.productiveHours)||8};});
                  const shares=ids.length>1?splitHoursByStaff(staffWithPh,form.totalHours):staffWithPh.map(s=>({...s,hours:form.totalHours}));
                  set("dateStr",nextAvailableBlockDate(shares,form.slot,entries,todayStr));
                } else {
                  set("dateStr",nextAvailableDate(ids,form.slot,entries,todayStr));
                }
              }} style={{width:"100%",padding:"7px 10px",border:"1px solid #93C5FD",background:"#EFF6FF",color:"#1D4ED8",borderRadius:8,fontSize:12,cursor:"pointer",marginBottom:14}}>
              First Available
            </button>
          )}

          {form.entryType==="misc"?(
            <div style={{width:130}}>
              <Inp label="Hours" type="number" min={0.5} max={maxHours} step={0.5} value={form.hours} onChange={e=>set("hours",Math.min(Number(e.target.value),maxHours))}/>
              {otherSlotEntry&&maxHours<productiveHours&&<div style={{fontSize:11,color:"#F59E0B",marginTop:6}}>⚡ Max {maxHours}h left of {selectedStaff?.name}'s {productiveHours}h/day cap</div>}
            </div>
          ):autoFill&&form.mode==="new"?(
            <div>
              <div style={{fontSize:12,color:"#64748B",marginBottom:3,fontWeight:500}}>Total Hours to Deduct from Budget</div>
              <div style={{width:130}}>
                <input type="number" min={0.5} max={999} step={0.5} value={form.totalHours||""} onChange={e=>set("totalHours",Number(e.target.value))} placeholder={totalHours?`${totalHours}`:"Hours"} style={{width:"100%",padding:"7px 10px",border:"1px solid #CBD5E1",borderRadius:8,fontSize:16,boxSizing:"border-box",outline:"none"}}/>
              </div>
              {form.staffIds.length>1&&(()=>{
                const staffWithPh=form.staffIds.map(sid=>{const sf=staff.find(s=>s.id===sid);return{sid,name:sf?.name,ph:Number(sf?.productiveHours)||8};});
                const shares=splitHoursByStaff(staffWithPh,form.totalHours||0);
                return <div style={{fontSize:11,color:"#3B82F6",marginTop:6,lineHeight:1.5}}>
                  📋 {form.totalHours}h split evenly by rate:<br/>
                  {shares.map(({sid,name,ph,hours})=>(
                    <span key={sid} style={{display:"block",paddingLeft:8}}>• {name}: {hours}h ({ph}h/day = ~{ph>0?Math.ceil(hours/ph):0} days)</span>
                  ))}
                </div>;
              })()}
              {form.staffIds.length<=1&&productiveHours<8&&<div style={{fontSize:11,color:"#F59E0B",marginTop:6}}>⚡ {selectedStaff?.name}'s daily cap is {productiveHours}h</div>}
              {form.staffIds.length<=1&&preview.length>0&&(
                <div style={{marginTop:8,background:"#F0FDF4",border:"1px solid #BBF7D0",borderRadius:8,padding:"8px 10px"}}>
                  <div style={{fontSize:12,fontWeight:600,color:"#15803D",marginBottom:5}}>📅 {preview.length} day{preview.length>1?"s":""} · {preview.reduce((a,p)=>a+(p.deducted||p.hours),0)}h deducted · {productiveHours}h/day cap</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:3}}>
                    {preview.map((p,i)=><span key={i} style={{fontSize:11,background:"#DCFCE7",color:"#166534",borderRadius:4,padding:"2px 6px"}}>{formatDate(parseISO(p.dateStr))} · {p.hours}h</span>)}
                  </div>
                </div>
              )}
            </div>
          ):(
            <div style={{width:130}}>
              <Inp label="Hours" type="number" min={0.5} max={maxHours} step={0.5} value={form.hours} onChange={e=>set("hours",Math.min(Number(e.target.value),maxHours))}/>
              {otherSlotEntry&&maxHours<productiveHours&&<div style={{fontSize:11,color:"#F59E0B",marginTop:6}}>⚡ Max {maxHours}h left of {selectedStaff?.name}'s {productiveHours}h/day cap</div>}
            </div>
          )}
        </div>
      </div>

      <div style={{display:"flex",gap:8,justifyContent:"space-between",marginTop:16}}>
        <div>{form.mode==="edit"&&<Btn variant="danger" onClick={()=>onRemove(form.id)} disabled={saving}>Remove</Btn>}</div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="ghost" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" onClick={handleSave} loading={saving}>
            {saving?"Scheduling...":(autoFill&&form.entryType!=="misc"&&form.staffIds.length>1?`Schedule ${form.staffIds.length} staff`:autoFill&&preview.length>0&&form.entryType!=="misc"?`Schedule ${preview.length} days`:"Save")}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Job Modal ─────────────────────────────────────────────────

function JobModal({data,onSave,onDelete,onToggleComplete,onClose,saving}) {
  const [form,setForm]=useState({...data,subItems:data.subItems.map(s=>({...s}))});
  const [importMsg,setImportMsg]=useState(null);
  const fileInputRef=useRef(null);
  function set(k,v){setForm(f=>({...f,[k]:v}));}
  function addSubItem(){setForm(f=>({...f,subItems:[...f.subItems,{id:`new_${Date.now()}`,isNew:true,name:"",totalHours:0}]}));}
  function addSubItemWithName(name){
    const newId=`new_${Date.now()}`;
    setForm(f=>({...f,subItems:[...f.subItems,{id:newId,isNew:true,name:name==="__custom__"?"":name,totalHours:0,autoFocus:name==="__custom__"}]}));
  }
  function setSubItem(idx,field,value){setForm(f=>{const s=[...f.subItems];s[idx]={...s[idx],[field]:value};return{...f,subItems:s};});}
  function removeSubItem(idx){setForm(f=>{const s=[...f.subItems];s.splice(idx,1);return{...f,subItems:s};});}

  // Reads a Brennan-style "Quote Sheet" Excel workbook's "Summary" tab and adds
  // one Joinery Item per Workshop/Site hour figure found, for every row marked
  // Y/Yes in the "Proceeding?" column. Column layout (fixed, per template):
  //   A = item name, E = Proceeding? (Y/N), G = Workshop Hours, H = Site Hours
  // Row 8 onward is data (rows 1-7 are title/header rows). Stops at the first
  // fully blank row (the sheet's totals/footer row).
  async function handleExcelImport(e){
    const file=e.target.files[0];
    if(!file)return;
    setImportMsg(null);
    try{
      const buf=await file.arrayBuffer();
      const wb=XLSX.read(buf,{type:"array"});
      const sheet=wb.Sheets["Summary"];
      if(!sheet){
        setImportMsg({type:"error",text:'Could not find a sheet named "Summary" in that file.'});
        e.target.value="";
        return;
      }
      const rows=XLSX.utils.sheet_to_json(sheet,{header:1,defval:""});
      const newItems=[];
      let skippedNoHours=0;
      for(let i=7;i<rows.length;i++){
        const row=rows[i];
        const name=(row[0]||"").toString().split(",")[0].trim();
        const proceeding=(row[4]||"").toString().trim().toLowerCase();
        if(!name&&!proceeding)break; // blank row = end of data (totals/footer row)
        if(proceeding!=="y"&&proceeding!=="yes")continue;
        // Round to the nearest whole hour (.5 rounds up, .49 and below rounds down)
        const workshopHours=Math.round(Number(row[6])||0);
        const siteHours=Math.round(Number(row[7])||0);
        if(workshopHours<=0&&siteHours<=0){skippedNoHours++;continue;}
        if(workshopHours>0)newItems.push({id:`new_${Date.now()}_${i}w`,isNew:true,name:`${name} W`,totalHours:workshopHours});
        if(siteHours>0)newItems.push({id:`new_${Date.now()}_${i}s`,isNew:true,name:`${name} S`,totalHours:siteHours});
      }
      if(newItems.length===0){
        setImportMsg({type:"error",text:"No items imported. Check column E has Y/Yes and columns G/H have hours."});
        e.target.value="";
        return;
      }
      setForm(f=>({...f,subItems:[...f.subItems,...newItems]}));
      setImportMsg({type:"success",text:`Imported ${newItems.length} item${newItems.length>1?"s":""}${skippedNoHours>0?` — skipped ${skippedNoHours} row${skippedNoHours>1?"s":""} with no hours`:""}.`});
    }catch(err){
      setImportMsg({type:"error",text:"Could not read that file. Make sure it's a valid Excel (.xlsx) workbook with a 'Summary' sheet."});
    }
    e.target.value="";
  }

  return(
    <Modal title={form.isNew?"New Job":"Edit Job"} wide onClose={onClose}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <div>
          <Inp label="Job Number" value={form.jobNo} onChange={e=>set("jobNo",e.target.value)} autoFocus/>
          <Inp label="Job Name" value={form.name} onChange={e=>set("name",e.target.value)}/>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:12,color:"#64748B",marginBottom:6,fontWeight:500}}>Colour</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {JOB_COLOUR_PRESETS.map((p,i)=>{
                const selected=form.bgColor===p.bgColor&&form.borderColor===p.borderColor&&form.textColor===p.textColor;
                return (
                  <button key={i} type="button" onClick={()=>setForm(f=>({...f,bgColor:p.bgColor,borderColor:p.borderColor,textColor:p.textColor}))}
                    title={`Colour ${i+1}`}
                    style={{width:28,height:28,borderRadius:"50%",background:p.bgColor,border:selected?`2.5px solid ${p.borderColor}`:`1.5px solid ${p.borderColor}`,boxShadow:selected?`0 0 0 2px #fff, 0 0 0 3.5px ${p.borderColor}`:"none",cursor:"pointer",padding:0}}/>
                );
              })}
            </div>
          </div>
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
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
            <div style={{fontSize:12,color:"#64748B",fontWeight:500}}>Joinery Items <span style={{fontWeight:400,color:"#94A3B8"}}>(name + hour budget)</span></div>
            <button type="button" onClick={()=>fileInputRef.current?.click()}
              style={{fontSize:11,color:"#3B82F6",background:"#EFF6FF",border:"1px solid #BFDBFE",borderRadius:6,padding:"4px 9px",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>
              📥 Import from Excel
            </button>
            <input type="file" accept=".xlsx" ref={fileInputRef} style={{display:"none"}} onChange={handleExcelImport}/>
          </div>
          {importMsg&&(
            <div style={{fontSize:11,padding:"6px 9px",borderRadius:6,marginBottom:8,background:importMsg.type==="error"?"#FEF2F2":"#F0FDF4",border:`1px solid ${importMsg.type==="error"?"#FECACA":"#BBF7D0"}`,color:importMsg.type==="error"?"#DC2626":"#15803D"}}>
              {importMsg.text}
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:7}}>
            {form.subItems.map((si,i)=>(
              <div key={si.id} style={{display:"flex",gap:6,alignItems:"center"}}>
                <input value={si.name} onChange={e=>setSubItem(i,"name",e.target.value)} placeholder="Item name" autoFocus={!!si.autoFocus} style={{flex:2,padding:"6px 8px",border:"1px solid #CBD5E1",borderRadius:7,fontSize:16,outline:"none"}}/>
                <input type="number" value={si.totalHours||""} onChange={e=>setSubItem(i,"totalHours",Number(e.target.value))} placeholder="Hrs" min={0} step={0.5} style={{width:60,padding:"6px 8px",border:"1px solid #CBD5E1",borderRadius:7,fontSize:16,outline:"none"}}/>
                <button onClick={()=>removeSubItem(i)} style={{background:"none",border:"1px solid #FCA5A5",color:"#EF4444",borderRadius:6,padding:"4px 8px",cursor:"pointer",fontSize:13}}>×</button>
              </div>
            ))}
            {/* Preset dropdown + Add Item */}
            <div style={{display:"flex",gap:6,alignItems:"center",marginTop:2}}>
              <select
                value=""
                onChange={e=>{
                  if(e.target.value) addSubItemWithName(e.target.value);
                  e.target.value="";
                }}
                style={{flex:2,padding:"6px 8px",border:"1px solid #CBD5E1",borderRadius:7,fontSize:16,background:"#fff",color:"#475569",outline:"none"}}>
                <option value="">+ Add new item...</option>
                {JOINERY_ITEM_PRESETS.map(p=><option key={p} value={p}>{p}</option>)}
                <option value="__custom__">Custom (type below)</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:20,borderTop:"1px solid #F1F5F9",paddingTop:16}}>
        <div style={{display:"flex",gap:8}}>
          {!form.isNew&&<Btn variant="danger" disabled={saving} onClick={()=>onDelete(form.id)}>Delete Job</Btn>}
          {!form.isNew&&onToggleComplete&&(
            <Btn variant="ghost" disabled={saving} onClick={()=>onToggleComplete(form.id,!form.completed)}>
              {form.completed?"↺ Reopen Job":"✓ Mark Complete"}
            </Btn>
          )}
        </div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="ghost" disabled={saving} onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={saving} onClick={()=>{if(!form.jobNo||!form.name)return;onSave(form);}}>{saving?"Saving...":"Save Job"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ── Staff Modal ───────────────────────────────────────────────

function StaffModal({data,onSave,onRemove,onClose,onMove,isFirst,isLast,saving}) {
  const [form,setForm]=useState({...data,productiveHours:data.productiveHours||8});
  return(
    <Modal title={form.isNew?"New Staff Member":"Edit Staff Member"} onClose={onClose} small>
      <Inp label="Name" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
      {!form.isNew&&onMove&&(
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,color:"#64748B",marginBottom:4,fontWeight:500}}>Position in schedule</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>onMove(form.id,"up")} disabled={isFirst}
              style={{flex:1,padding:"7px 0",border:"1px solid #CBD5E1",borderRadius:8,background:isFirst?"#F8FAFC":"#fff",color:isFirst?"#CBD5E1":"#334155",cursor:isFirst?"not-allowed":"pointer",fontSize:13,fontWeight:600}}>
              ↑ Move Up
            </button>
            <button onClick={()=>onMove(form.id,"down")} disabled={isLast}
              style={{flex:1,padding:"7px 0",border:"1px solid #CBD5E1",borderRadius:8,background:isLast?"#F8FAFC":"#fff",color:isLast?"#CBD5E1":"#334155",cursor:isLast?"not-allowed":"pointer",fontSize:13,fontWeight:600}}>
              ↓ Move Down
            </button>
          </div>
        </div>
      )}
      <div style={{marginBottom:12}}>
        <div style={{fontSize:12,color:"#64748B",marginBottom:4,fontWeight:500}}>Daily hour cap</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <input type="range" min={1} max={8} step={0.5} value={form.productiveHours}
            onChange={e=>setForm(f=>({...f,productiveHours:Number(e.target.value)}))}
            style={{flex:1,accentColor:"#3B82F6"}}/>
          <div style={{minWidth:44,textAlign:"center",fontWeight:700,fontSize:16,color:"#1E293B"}}>{form.productiveHours}h</div>
        </div>
        <div style={{fontSize:11,color:"#94A3B8",marginTop:4}}>Maximum hours this person can be allocated per day, across both slots</div>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:10}}>
        <div>{!form.isNew&&<Btn variant="danger" disabled={saving} onClick={()=>onRemove(form.id)}>Remove Staff</Btn>}</div>
        <div style={{display:"flex",gap:8}}>
          <Btn variant="ghost" disabled={saving} onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={saving} onClick={()=>{if(form.name.trim())onSave(form);}}>{saving?"Saving...":"Save"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
