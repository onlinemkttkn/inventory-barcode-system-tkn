const el={loginCard:document.getElementById("loginCard"),appArea:document.getElementById("appArea"),loginForm:document.getElementById("loginForm"),email:document.getElementById("email"),password:document.getElementById("password"),loginMessage:document.getElementById("loginMessage"),logoutBtn:document.getElementById("logoutBtn"),configWarning:document.getElementById("configWarning"),welcomeText:document.getElementById("welcomeText"),totalProducts:document.getElementById("totalProducts"),lowStock:document.getElementById("lowStock"),outStock:document.getElementById("outStock"),totalCategories:document.getElementById("totalCategories"),recentProducts:document.getElementById("recentProducts"),dashboardMessage:document.getElementById("dashboardMessage"),refreshBtn:document.getElementById("refreshBtn")};

function msg(node,text,type=""){node.textContent=text;node.className=`message ${type}`.trim()}
function configReady(){return !SUPABASE_URL.includes("ใส่_")&&!SUPABASE_PUBLISHABLE_KEY.includes("ใส่_")}

async function init(){
  if(!configReady()){
    el.configWarning.textContent="กรุณาตั้งค่า Supabase ใน js/supabase-config.js";
    el.configWarning.classList.remove("hidden");
    return;
  }
  const {data:{session}}=await supabaseClient.auth.getSession();
  await renderSession(session);
  supabaseClient.auth.onAuthStateChange(async(_event,nextSession)=>await renderSession(nextSession));
}

async function renderSession(session){
  const loggedIn=Boolean(session);
  el.loginCard.classList.toggle("hidden",loggedIn);
  el.appArea.classList.toggle("hidden",!loggedIn);
  el.logoutBtn.classList.toggle("hidden",!loggedIn);

  if(!loggedIn){
    el.welcomeText.textContent="กรุณาเข้าสู่ระบบภายในองค์กร";
    return;
  }

  const {data:profile,error}=await supabaseClient
    .from("profiles")
    .select("full_name,email,role,is_active")
    .eq("id",session.user.id)
    .maybeSingle();

  if(error||!profile||profile.is_active!==true){
    await supabaseClient.auth.signOut();
    msg(el.loginMessage,"บัญชีนี้ไม่มีสิทธิ์หรือถูกปิดใช้งาน","error");
    return;
  }

  el.welcomeText.textContent=`${profile.full_name||profile.email} • ${profile.role==="admin"?"ผู้ดูแลระบบ":"พนักงาน"}`;
  await loadDashboard();
}

el.loginForm.addEventListener("submit",async(event)=>{
  event.preventDefault();
  msg(el.loginMessage,"กำลังเข้าสู่ระบบ...");
  const {error}=await supabaseClient.auth.signInWithPassword({
    email:el.email.value.trim(),
    password:el.password.value
  });
  if(error){msg(el.loginMessage,error.message,"error");return}
  el.password.value="";
  msg(el.loginMessage,"");
});

el.logoutBtn.addEventListener("click",()=>supabaseClient.auth.signOut());
el.refreshBtn.addEventListener("click",loadDashboard);

async function loadDashboard(){
  msg(el.dashboardMessage,"กำลังโหลดข้อมูล...");
  const [products,categories,low,out,recent]=await Promise.all([
    supabaseClient.from("products").select("*",{count:"exact",head:true}),
    supabaseClient.from("categories").select("*",{count:"exact",head:true}),
    supabaseClient.from("products").select("*",{count:"exact",head:true}).gt("quantity",0).lte("quantity",5),
    supabaseClient.from("products").select("*",{count:"exact",head:true}).lte("quantity",0),
    supabaseClient.from("product_list")
      .select("product_code,barcode,name,quantity,stock_status,created_at")
      .order("created_at",{ascending:false}).limit(10)
  ]);

  const error=[products,categories,low,out,recent].map(x=>x.error).find(Boolean);
  if(error){console.error(error);msg(el.dashboardMessage,error.message,"error");return}

  el.totalProducts.textContent=(products.count||0).toLocaleString("th-TH");
  el.totalCategories.textContent=(categories.count||0).toLocaleString("th-TH");
  el.lowStock.textContent=(low.count||0).toLocaleString("th-TH");
  el.outStock.textContent=(out.count||0).toLocaleString("th-TH");

  el.recentProducts.innerHTML="";
  (recent.data||[]).forEach(p=>{
    const status={IN_STOCK:["มีสินค้า","ok"],LOW_STOCK:["ใกล้หมด","low"],OUT_OF_STOCK:["หมด","out"]}[p.stock_status]||["-",""];
    const tr=document.createElement("tr");
    tr.innerHTML=`<td>${escapeHtml(p.product_code||"-")}</td><td>${escapeHtml(p.name||"-")}</td><td>${escapeHtml(p.barcode||"-")}</td><td>${Number(p.quantity||0).toLocaleString("th-TH")}</td><td><span class="badge ${status[1]}">${status[0]}</span></td>`;
    el.recentProducts.appendChild(tr);
  });
  msg(el.dashboardMessage,"อัปเดตข้อมูลแล้ว");
}

function escapeHtml(value){
  return String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}
init();
