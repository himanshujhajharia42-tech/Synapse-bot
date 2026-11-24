require("dotenv").config();
const express=require("express");
const session=require("express-session");
const helmet=require("helmet");
const crypto=require("crypto");
const app=express();
app.set("trust proxy",1);
const settings=new Map();
const analytics=new Map();
const internalKey=process.env.HANU_INTERNAL_API_KEY;
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"32kb"}));
app.use(session({
 secret:process.env.SESSION_SECRET||"temporary-hanu-session-secret-change-this",
 resave:false,saveUninitialized:false,
 cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*24*60*60*1000}
}));
const configured=()=>Boolean(process.env.DISCORD_CLIENT_ID&&process.env.DISCORD_CLIENT_SECRET&&process.env.DISCORD_REDIRECT_URI&&process.env.SESSION_SECRET);
const allowed=req=>(req.session.guilds||[]).some(g=>g.id===req.params.id);
const internal=req=>Boolean(internalKey&&req.get("x-hanu-key")===internalKey);
app.get("/health",(_req,res)=>res.json({ok:true,app:"HANU",storage:"temporary-memory",oauthConfigured:configured()}));
app.get("/auth/discord",(req,res)=>{
 if(!configured())return res.status(503).send("Discord login is not fully configured. In Render, set DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI and SESSION_SECRET. The redirect URI must exactly match the Discord Developer Portal.");
 const state=crypto.randomBytes(24).toString("hex");req.session.oauthState=state;
 const params=new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,redirect_uri:process.env.DISCORD_REDIRECT_URI,response_type:"code",scope:"identify guilds",state});
 res.redirect("https://discord.com/oauth2/authorize?"+params.toString());
});
app.get("/auth/discord/callback",async(req,res)=>{
 try{
  if(!configured())return res.status(503).send("Discord OAuth is not configured.");
  if(!req.query.code||!req.query.state||req.query.state!==req.session.oauthState)return res.status(400).send("Login session expired or invalid. Return to HANU and try again.");
  delete req.session.oauthState;
  const tokenRes=await fetch("https://discord.com/api/oauth2/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:process.env.DISCORD_CLIENT_ID,client_secret:process.env.DISCORD_CLIENT_SECRET,grant_type:"authorization_code",code:req.query.code,redirect_uri:process.env.DISCORD_REDIRECT_URI})});
  const token=await tokenRes.json();if(!tokenRes.ok){console.error("OAuth token exchange rejected:",token.error);return res.status(400).send("Discord rejected the OAuth exchange. Check the client ID, secret and exact redirect URI in Render and Discord Developer Portal.");}
  const headers={Authorization:"Bearer "+token.access_token};
  const [ur,gr]=await Promise.all([fetch("https://discord.com/api/users/@me",{headers}),fetch("https://discord.com/api/users/@me/guilds",{headers})]);
  if(!ur.ok||!gr.ok)return res.status(400).send("Discord could not return your profile or server list. Please try again.");
  req.session.user=await ur.json();
  req.session.guilds=(await gr.json()).filter(g=>{const p=BigInt(g.permissions);return (p&0x20n)===0x20n||(p&0x8n)===0x8n;});
  req.session.save(err=>{if(err){console.error("Session save:",err);return res.status(500).send("Could not save your login session. Please retry.");}res.redirect("/#dashboard");});
 }catch(e){console.error("OAuth callback:",e);res.status(500).send("Login failed. Check Render logs and OAuth configuration.");}
});
app.get("/api/me",(req,res)=>res.json({user:req.session.user||null,guilds:req.session.guilds||[]}));
app.get("/api/guild/:id/settings",(req,res)=>{if(!allowed(req))return res.sendStatus(403);res.json(settings.get(req.params.id)||{panelTitle:"Support tickets",panelDescription:"Need help? Press below to open a private ticket.",buttonLabel:"Create ticket",color:"8278ff",staffRoleId:""});});
app.put("/api/guild/:id/settings",(req,res)=>{
 if(!allowed(req))return res.sendStatus(403);
 const b=req.body||{};
 const clean={
  panelTitle:String(b.panelTitle||"Support tickets").slice(0,200),
  panelDescription:String(b.panelDescription||"Need help? Press below to open a private ticket.").slice(0,1000),
  buttonLabel:String(b.buttonLabel||"Create ticket").slice(0,80),
  color:/^[0-9a-fA-F]{6}$/.test(String(b.color||""))?String(b.color):"8278ff",
  staffRoleId:/^\\d{0,22}$/.test(String(b.staffRoleId||""))?String(b.staffRoleId):""
 };
 settings.set(req.params.id,clean);res.json({ok:true,storage:"temporary-memory",settings:clean});
});
app.get("/api/guild/:id/analytics",(req,res)=>{
 if(!allowed(req))return res.sendStatus(403);
 const a=analytics.get(req.params.id)||{created:0,claimed:0,closed:0,events:[]};
 res.json({created:a.created,claimed:a.claimed,closed:a.closed,events:a.events.slice(-25).reverse(),storage:"temporary-memory"});
});
app.get("/internal/guild/:id/settings",(req,res)=>{if(!internal(req))return res.sendStatus(401);res.json(settings.get(req.params.id)||{});});
app.post("/internal/events",(req,res)=>{
 if(!internal(req))return res.sendStatus(401);
 const {type,guildId,channelId,ownerId,claimedBy,closedBy}=req.body||{};
 if(!guildId||!["ticket_created","ticket_claimed","ticket_closed"].includes(type))return res.status(400).json({error:"invalid event"});
 const a=analytics.get(guildId)||{created:0,claimed:0,closed:0,events:[]};
 if(type==="ticket_created")a.created++;if(type==="ticket_claimed")a.claimed++;if(type==="ticket_closed")a.closed++;
 a.events.push({type,channelId,ownerId,claimedBy,closedBy,at:new Date().toISOString()});if(a.events.length>100)a.events.shift();analytics.set(guildId,a);
 res.json({ok:true});
});
app.post("/auth/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.use(express.static("public"));
const port=process.env.PORT||3000;app.listen(port,()=>console.log("HANU web listening on",port));
