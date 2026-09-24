const express=require('express');
const path=require('path');
const fs=require('fs');
const bcrypt=require('bcryptjs');
const jwt=require('jsonwebtoken');
const multer=require('multer');
const {DatabaseSync}=require('node:sqlite');

const app=express();
const PORT=Number(process.env.PORT||3000);
const SECRET=process.env.JWT_SECRET||'MEDIA-RWANDA-change-this-secret-in-production';
const ROOT=__dirname;
const UP=path.join(ROOT,'uploads');
fs.mkdirSync(UP,{recursive:true});

const db=new DatabaseSync(path.join(ROOT,'media-rwanda.db'));
db.exec(`
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,email TEXT UNIQUE NOT NULL,password TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'user',avatar TEXT DEFAULT '',bio TEXT DEFAULT '',created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS media(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT DEFAULT '',type TEXT NOT NULL CHECK(type IN ('film','video','photo','music')),genre TEXT DEFAULT '',year INTEGER,filename TEXT NOT NULL,poster TEXT DEFAULT '',user_id INTEGER,views INTEGER DEFAULT 0,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS comments(id INTEGER PRIMARY KEY AUTOINCREMENT,media_id INTEGER NOT NULL,user_id INTEGER NOT NULL,text TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS likes(id INTEGER PRIMARY KEY AUTOINCREMENT,media_id INTEGER NOT NULL,user_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(media_id,user_id));
CREATE TABLE IF NOT EXISTS follows(id INTEGER PRIMARY KEY AUTOINCREMENT,follower_id INTEGER NOT NULL,following_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(follower_id,following_id));
CREATE TABLE IF NOT EXISTS posts(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER NOT NULL,text TEXT DEFAULT '',media_id INTEGER,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS post_likes(id INTEGER PRIMARY KEY AUTOINCREMENT,post_id INTEGER NOT NULL,user_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,UNIQUE(post_id,user_id));
CREATE TABLE IF NOT EXISTS post_comments(id INTEGER PRIMARY KEY AUTOINCREMENT,post_id INTEGER NOT NULL,user_id INTEGER NOT NULL,text TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS live_rooms(id INTEGER PRIMARY KEY AUTOINCREMENT,title TEXT NOT NULL,description TEXT DEFAULT '',stream_url TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'scheduled',host_id INTEGER NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY AUTOINCREMENT,media_id INTEGER,post_id INTEGER,user_id INTEGER NOT NULL,reason TEXT NOT NULL,created_at TEXT DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(media_id) REFERENCES media(id),FOREIGN KEY(post_id) REFERENCES posts(id),FOREIGN KEY(user_id) REFERENCES users(id));
CREATE TABLE IF NOT EXISTS chats(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user1_id INTEGER NOT NULL,
  user2_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  last_message_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user1_id,user2_id)
);
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  read_at TEXT,
  FOREIGN KEY(chat_id) REFERENCES chats(id),
  FOREIGN KEY(sender_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id,created_at);
CREATE INDEX IF NOT EXISTS idx_messages_receiver_read ON messages(chat_id,sender_id,read_at);

`);
for (const sql of [
  "ALTER TABLE media ADD COLUMN updated_at TEXT",
  "ALTER TABLE media ADD COLUMN status TEXT NOT NULL DEFAULT 'published'"
]) { try { db.exec(sql); } catch {} }
db.exec("UPDATE media SET updated_at=COALESCE(updated_at,created_at) WHERE updated_at IS NULL");

if(!db.prepare('SELECT id FROM users WHERE email=?').get('admin@mediarwanda.com')){
  db.prepare('INSERT INTO users(name,email,password,role,bio) VALUES(?,?,?,?,?)').run('MEDIA RWANDA Admin','admin@mediarwanda.com',bcrypt.hashSync('Admin123!',10),'admin','Official administrator');
}

app.use(express.json({limit:'3mb'}));
app.use(express.urlencoded({extended:true}));
app.use(express.static(ROOT));
app.use('/uploads',express.static(UP,{maxAge:'1d'}));

const storage=multer.diskStorage({destination:(_,__,cb)=>cb(null,UP),filename:(_,file,cb)=>{
  const ext=path.extname(file.originalname).toLowerCase();
  const base=path.basename(file.originalname,ext).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,70)||'media';
  cb(null,`${Date.now()}-${Math.random().toString(36).slice(2,8)}-${base}${ext}`);
}});
const upload=multer({storage,limits:{fileSize:1024*1024*1024}});

function auth(req,res,next){try{const h=req.headers.authorization||'';if(!h.startsWith('Bearer '))throw 0;req.user=jwt.verify(h.slice(7),SECRET);next()}catch{res.status(401).json({error:'Login required'})}}
function admin(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'Admin only'});next()}
function safeUser(id){return db.prepare('SELECT id,name,email,role,avatar,bio,created_at FROM users WHERE id=?').get(id)}
function mediaList(type){return db.prepare(`SELECT m.*,u.name author,u.avatar author_avatar,
 (SELECT COUNT(*) FROM likes l WHERE l.media_id=m.id) likes,
 (SELECT COUNT(*) FROM comments c WHERE c.media_id=m.id) comments
 FROM media m LEFT JOIN users u ON u.id=m.user_id ${type?'WHERE m.type=? AND m.status=\'published\'':'WHERE m.status=\'published\''} ORDER BY datetime(m.created_at) DESC`).all(...(type?[type]:[]))}
function postList(){return db.prepare(`SELECT p.*,u.name author,u.avatar author_avatar,m.title media_title,m.type media_type,m.filename media_filename,m.poster media_poster,
 (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id=p.id) likes,
 (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id=p.id) comments
 FROM posts p JOIN users u ON u.id=p.user_id LEFT JOIN media m ON m.id=p.media_id ORDER BY p.created_at DESC LIMIT 100`).all()}
function removeFile(name){if(name)try{fs.unlinkSync(path.join(UP,name))}catch{}}

app.get('/api/health',(_,res)=>res.json({
  ok:true,
  app:'MEDIA RWANDA',
  version:'3.2.2',
  database:'SQLite'
}));
app.post('/api/register',(req,res)=>{const name=String(req.body.name||'').trim();const email=String(req.body.email||'').trim().toLowerCase();const password=String(req.body.password||'');if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||password.length<6)return res.status(400).json({error:'Amazina, email nyayo na password yibura inyuguti 6 birakenewe'});try{const r=db.prepare('INSERT INTO users(name,email,password) VALUES(?,?,?)').run(name,email,bcrypt.hashSync(password,10));const u=safeUser(r.lastInsertRowid);res.json({token:jwt.sign({id:u.id,name:u.name,email:u.email,role:u.role},SECRET,{expiresIn:'30d'}),user:u})}catch{res.status(409).json({error:'Iyo email isanzwe ikoreshwa'})}});
app.post('/api/login',(req,res)=>{const email=String(req.body.email||'').trim().toLowerCase();const password=String(req.body.password||'');const u=db.prepare('SELECT * FROM users WHERE email=?').get(email);if(!u||!bcrypt.compareSync(password,u.password))return res.status(401).json({error:'Email cyangwa password si byo'});res.json({token:jwt.sign({id:u.id,name:u.name,email:u.email,role:u.role},SECRET,{expiresIn:'30d'}),user:safeUser(u.id)})});
app.get('/api/me',auth,(req,res)=>res.json(safeUser(req.user.id)));
app.get('/api/users/:id',(req,res)=>{const u=safeUser(req.params.id);if(!u)return res.status(404).json({error:'User not found'});res.json(u)});
app.post('/api/users/:id/follow',auth,(req,res)=>{const id=Number(req.params.id);if(id===req.user.id)return res.status(400).json({error:'Ntushobora kwifollowinga'});const x=db.prepare('SELECT id FROM follows WHERE follower_id=? AND following_id=?').get(req.user.id,id);if(x)db.prepare('DELETE FROM follows WHERE id=?').run(x.id);else db.prepare('INSERT OR IGNORE INTO follows(follower_id,following_id) VALUES(?,?)').run(req.user.id,id);res.json({following:!x})});

app.get('/api/site/stats',(req,res)=>res.json({updated:new Date().toISOString(),published:db.prepare("SELECT COUNT(*) c FROM media WHERE status='published'").get().c}));
app.get('/api/media/latest',(req,res)=>{const days=Math.max(1,Math.min(30,Number(req.query.days)||7));res.json(db.prepare("SELECT m.*,u.name author,u.avatar author_avatar,(SELECT COUNT(*) FROM likes WHERE media_id=m.id) likes,(SELECT COUNT(*) FROM comments WHERE media_id=m.id) comments FROM media m LEFT JOIN users u ON u.id=m.user_id WHERE m.status='published' AND datetime(m.created_at)>=datetime('now',?) ORDER BY datetime(m.created_at) DESC LIMIT 100").all(`-${days} days`));});
app.get('/api/media/section/:section',(req,res)=>{const section=String(req.params.section);const order=section==='popular'?'(m.views + (SELECT COUNT(*) FROM likes l WHERE l.media_id=m.id)*5) DESC, datetime(m.created_at) DESC':section==='trending'?'(m.views*2 + (SELECT COUNT(*) FROM likes l WHERE l.media_id=m.id)*5 + (SELECT COUNT(*) FROM comments c WHERE c.media_id=m.id)*3) DESC, datetime(m.created_at) DESC':'datetime(m.created_at) DESC';const where=section==='latest'?"m.status='published'":section==='old'?"m.status='published' AND datetime(m.created_at)<datetime('now','-30 days')":"m.status='published'";res.json(db.prepare(`SELECT m.*,u.name author,u.avatar author_avatar,(SELECT COUNT(*) FROM likes WHERE media_id=m.id) likes,(SELECT COUNT(*) FROM comments WHERE media_id=m.id) comments FROM media m LEFT JOIN users u ON u.id=m.user_id WHERE ${where} ORDER BY ${order} LIMIT 100`).all());});
app.get('/api/media/category/:category',(req,res)=>{const c=String(req.params.category);const allowed=['gospel-video','gospel-audio','comedy'];if(!allowed.includes(c))return res.status(400).json({error:'Category itemewe'});const rows=db.prepare(`SELECT m.*,u.name author,u.avatar author_avatar,(SELECT COUNT(*) FROM likes WHERE media_id=m.id) likes,(SELECT COUNT(*) FROM comments WHERE media_id=m.id) comments FROM media m LEFT JOIN users u ON u.id=m.user_id WHERE m.status='published' AND m.genre=? ORDER BY datetime(m.created_at) DESC`).all(c);res.json(rows);});
app.get('/api/media',(req,res)=>res.json(mediaList(['film','video','photo','music'].includes(req.query.type)?req.query.type:null)));
app.get('/api/media/:id',(req,res)=>{const m=db.prepare(`SELECT m.*,u.name author,u.avatar author_avatar,(SELECT COUNT(*) FROM likes WHERE media_id=m.id) likes,(SELECT COUNT(*) FROM comments WHERE media_id=m.id) comments FROM media m LEFT JOIN users u ON u.id=m.user_id WHERE m.id=? AND m.status='published'`).get(req.params.id);if(!m)return res.status(404).json({error:'Content ntibonetse'});db.prepare('UPDATE media SET views=views+1 WHERE id=?').run(req.params.id);res.json({...m,views:m.views+1})});
app.get('/api/media/:id/comments',(req,res)=>res.json(db.prepare('SELECT c.*,u.name FROM comments c JOIN users u ON u.id=c.user_id WHERE c.media_id=? ORDER BY c.created_at DESC').all(req.params.id)));
app.post('/api/media/:id/comments',auth,(req,res)=>{const text=String(req.body.text||'').trim();if(!text)return res.status(400).json({error:'Comment ntishobora kuba ubusa'});db.prepare('INSERT INTO comments(media_id,user_id,text) VALUES(?,?,?)').run(req.params.id,req.user.id,text.slice(0,1000));res.json({ok:true})});
app.post('/api/media/:id/like',auth,(req,res)=>{const x=db.prepare('SELECT id FROM likes WHERE media_id=? AND user_id=?').get(req.params.id,req.user.id);if(x)db.prepare('DELETE FROM likes WHERE id=?').run(x.id);else db.prepare('INSERT OR IGNORE INTO likes(media_id,user_id) VALUES(?,?)').run(req.params.id,req.user.id);res.json({liked:!x})});
app.post('/api/media',auth,upload.fields([{name:'file',maxCount:1},{name:'poster',maxCount:1}]),(req,res)=>{const f=req.files?.file?.[0],p=req.files?.poster?.[0],b=req.body||{};const type=String(b.type||'');const category=String(b.category||'normal');if(category==='gospel-video'&&type!=='video')return res.status(400).json({error:'Gospel Video igomba kuba Video'});if(category==='gospel-audio'&&type!=='music')return res.status(400).json({error:'Gospel Audio igomba kuba Music'});if(category==='comedy'&&type!=='video')return res.status(400).json({error:'Comedy igomba kuba Video'});if(!f||!b.title||!['film','video','photo','music'].includes(type)){if(f)removeFile(f.filename);return res.status(400).json({error:'Title, type na file birakenewe'})}db.prepare("INSERT INTO media(title,description,type,genre,year,filename,poster,user_id,status,updated_at) VALUES(?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)").run(String(b.title).trim().slice(0,200),String(b.description||'').slice(0,3000),type,String(category!=='normal'?category:(b.genre||'')).slice(0,100),b.year?Number(b.year):null,f.filename,p?.filename||'',req.user.id,'pending');const r=db.prepare('SELECT last_insert_rowid() id').get();res.json({ok:true,id:r.id})});
app.put('/api/media/:id',auth,admin,upload.fields([{name:'file',maxCount:1},{name:'poster',maxCount:1}]),(req,res)=>{const m=db.prepare('SELECT * FROM media WHERE id=?').get(req.params.id);if(!m)return res.status(404).json({error:'Content ntibonetse'});const b=req.body||{},f=req.files?.file?.[0],p=req.files?.poster?.[0];const filename=f?.filename||m.filename,poster=p?.filename||m.poster;db.prepare('UPDATE media SET title=?,description=?,type=?,genre=?,year=?,filename=?,poster=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(String(b.title||m.title).slice(0,200),String(b.description??m.description).slice(0,3000),['film','video','photo','music'].includes(b.type)?b.type:m.type,String(b.genre??m.genre).slice(0,100),b.year?Number(b.year):m.year,filename,poster,m.id);if(f)removeFile(m.filename);if(p)removeFile(m.poster);res.json({ok:true})});
app.delete('/api/media/:id',auth,admin,(req,res)=>{const m=db.prepare('SELECT filename,poster FROM media WHERE id=?').get(req.params.id);if(!m)return res.status(404).json({error:'Content ntibonetse'});db.prepare('DELETE FROM comments WHERE media_id=?').run(req.params.id);db.prepare('DELETE FROM likes WHERE media_id=?').run(req.params.id);db.prepare('DELETE FROM posts WHERE media_id=?').run(req.params.id);db.prepare('DELETE FROM media WHERE id=?').run(req.params.id);removeFile(m.filename);removeFile(m.poster);res.json({ok:true})});


// Private one-to-one chat: WhatsApp-style conversations backed by SQLite.
// This uses short polling so it works on a normal Render Web Service without WebSockets.
function getChatForUsers(a,b){
  const u1=Math.min(Number(a),Number(b)), u2=Math.max(Number(a),Number(b));
  return db.prepare('SELECT * FROM chats WHERE user1_id=? AND user2_id=?').get(u1,u2);
}
function ensureChat(a,b){
  const u1=Math.min(Number(a),Number(b)), u2=Math.max(Number(a),Number(b));
  let c=db.prepare('SELECT * FROM chats WHERE user1_id=? AND user2_id=?').get(u1,u2);
  if(!c){
    const r=db.prepare('INSERT INTO chats(user1_id,user2_id) VALUES(?,?)').run(u1,u2);
    c=db.prepare('SELECT * FROM chats WHERE id=?').get(r.lastInsertRowid);
  }
  return c;
}
function chatMember(chat,userId){
  return chat && (Number(chat.user1_id)===Number(userId)||Number(chat.user2_id)===Number(userId));
}

app.get('/api/chat/users',auth,(req,res)=>{
  const q=String(req.query.q||'').trim();
  const like=`%${q}%`;
  const rows=q
    ? db.prepare("SELECT id,name,email,avatar,bio FROM users WHERE id<>? AND (name LIKE ? OR email LIKE ?) ORDER BY name LIMIT 50").all(req.user.id,like,like)
    : db.prepare("SELECT id,name,email,avatar,bio FROM users WHERE id<>? ORDER BY name LIMIT 50").all(req.user.id);
  res.json(rows);
});
app.get('/api/chats',auth,(req,res)=>{
  const rows=db.prepare(`
    SELECT c.id,c.user1_id,c.user2_id,c.last_message_at,
      CASE WHEN c.user1_id=? THEN u2.id ELSE u1.id END other_id,
      CASE WHEN c.user1_id=? THEN u2.name ELSE u1.name END other_name,
      CASE WHEN c.user1_id=? THEN u2.avatar ELSE u1.avatar END other_avatar,
      (SELECT text FROM messages m WHERE m.chat_id=c.id ORDER BY m.id DESC LIMIT 1) last_text,
      (SELECT created_at FROM messages m WHERE m.chat_id=c.id ORDER BY m.id DESC LIMIT 1) last_message_created_at,
      (SELECT COUNT(*) FROM messages m WHERE m.chat_id=c.id AND m.sender_id<>? AND m.read_at IS NULL) unread
    FROM chats c
    JOIN users u1 ON u1.id=c.user1_id
    JOIN users u2 ON u2.id=c.user2_id
    WHERE c.user1_id=? OR c.user2_id=?
    ORDER BY datetime(COALESCE(last_message_created_at,c.last_message_at)) DESC
  `).all(req.user.id,req.user.id,req.user.id,req.user.id,req.user.id,req.user.id);
  res.json(rows);
});
app.get('/api/chats/:id/messages',auth,(req,res)=>{
  const chat=db.prepare('SELECT * FROM chats WHERE id=?').get(req.params.id);
  if(!chat||!chatMember(chat,req.user.id))return res.status(403).json({error:'Chat itemewe'});
  db.prepare('UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE chat_id=? AND sender_id<>? AND read_at IS NULL').run(chat.id,req.user.id);
  const rows=db.prepare(`
    SELECT m.id,m.chat_id,m.sender_id,m.text,m.created_at,m.read_at,u.name sender_name,u.avatar sender_avatar
    FROM messages m JOIN users u ON u.id=m.sender_id
    WHERE m.chat_id=? ORDER BY m.id ASC LIMIT 500
  `).all(chat.id);
  res.json(rows);
});
app.post('/api/chats/:userId/send',auth,(req,res)=>{
  const other=Number(req.params.userId), text=String(req.body?.text||'').trim();
  if(!Number.isInteger(other)||other===req.user.id)return res.status(400).json({error:'Umuntu wandikirwa si we'});
  if(!db.prepare('SELECT id FROM users WHERE id=?').get(other))return res.status(404).json({error:'Umukoresha ntabonetse'});
  if(!text)return res.status(400).json({error:'Ubutumwa ntibushobora kuba ubusa'});
  if(text.length>5000)return res.status(400).json({error:'Ubutumwa burarenze inyuguti 5000'});
  const chat=ensureChat(req.user.id,other);
  const r=db.prepare('INSERT INTO messages(chat_id,sender_id,text) VALUES(?,?,?)').run(chat.id,req.user.id,text);
  db.prepare('UPDATE chats SET last_message_at=CURRENT_TIMESTAMP WHERE id=?').run(chat.id);
  const msg=db.prepare(`SELECT m.id,m.chat_id,m.sender_id,m.text,m.created_at,m.read_at,u.name sender_name,u.avatar sender_avatar
    FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.id=?`).get(r.lastInsertRowid);
  res.json(msg);
});
app.post('/api/chats/:id/read',auth,(req,res)=>{
  const chat=db.prepare('SELECT * FROM chats WHERE id=?').get(req.params.id);
  if(!chat||!chatMember(chat,req.user.id))return res.status(403).json({error:'Chat itemewe'});
  db.prepare('UPDATE messages SET read_at=CURRENT_TIMESTAMP WHERE chat_id=? AND sender_id<>? AND read_at IS NULL').run(chat.id,req.user.id);
  res.json({ok:true});
});

app.get('/api/feed',(req,res)=>res.json(postList()));
app.post('/api/feed',auth,upload.single('file'),(req,res)=>{const text=String(req.body?.text||'').trim();let mediaId=null;if(req.file){const type=req.file.mimetype.startsWith('image/')?'photo':req.file.mimetype.startsWith('video/')?'video':null;if(!type){removeFile(req.file.filename);return res.status(400).json({error:'Post yemera Photo cyangwa Video'})}const r=db.prepare('INSERT INTO media(title,description,type,filename,user_id) VALUES(?,?,?,?,?)').run('Social Post',text.slice(0,500),type,req.file.filename,req.user.id);mediaId=r.lastInsertRowid}if(!text&&!mediaId)return res.status(400).json({error:'Andika post cyangwa shyiramo Photo/Video'});const p=db.prepare('INSERT INTO posts(user_id,text,media_id) VALUES(?,?,?)').run(req.user.id,text.slice(0,3000),mediaId);res.json({ok:true,id:p.lastInsertRowid})});
app.post('/api/feed/:id/like',auth,(req,res)=>{const x=db.prepare('SELECT id FROM post_likes WHERE post_id=? AND user_id=?').get(req.params.id,req.user.id);if(x)db.prepare('DELETE FROM post_likes WHERE id=?').run(x.id);else db.prepare('INSERT OR IGNORE INTO post_likes(post_id,user_id) VALUES(?,?)').run(req.params.id,req.user.id);res.json({liked:!x})});
app.get('/api/feed/:id/comments',(req,res)=>res.json(db.prepare('SELECT c.*,u.name FROM post_comments c JOIN users u ON u.id=c.user_id WHERE post_id=? ORDER BY c.created_at DESC').all(req.params.id)));
app.post('/api/feed/:id/comments',auth,(req,res)=>{const text=String(req.body?.text||'').trim();if(!text)return res.status(400).json({error:'Comment ntishobora kuba ubusa'});db.prepare('INSERT INTO post_comments(post_id,user_id,text) VALUES(?,?,?)').run(req.params.id,req.user.id,text.slice(0,1000));res.json({ok:true})});

app.get('/api/live',(req,res)=>res.json(db.prepare('SELECT l.*,u.name host FROM live_rooms l JOIN users u ON u.id=l.host_id ORDER BY CASE l.status WHEN \'live\' THEN 0 WHEN \'scheduled\' THEN 1 ELSE 2 END,l.created_at DESC').all()));
app.post('/api/live',auth,(req,res)=>{const title=String(req.body?.title||'').trim();if(!title)return res.status(400).json({error:'Live title irakenewe'});const status=['live','scheduled','ended'].includes(req.body?.status)?req.body.status:'scheduled';const r=db.prepare('INSERT INTO live_rooms(title,description,stream_url,status,host_id) VALUES(?,?,?,?,?)').run(title,String(req.body?.description||'').slice(0,2000),String(req.body?.stream_url||'').slice(0,500),status,req.user.id);res.json({ok:true,id:r.lastInsertRowid})});
app.delete('/api/live/:id',auth,(req,res)=>{const l=db.prepare('SELECT * FROM live_rooms WHERE id=?').get(req.params.id);if(!l)return res.status(404).json({error:'Live ntibonetse'});if(l.host_id!==req.user.id&&req.user.role!=='admin')return res.status(403).json({error:'Not allowed'});db.prepare('DELETE FROM live_rooms WHERE id=?').run(req.params.id);res.json({ok:true})});

app.get('/api/search',(req,res)=>{const q=String(req.query.q||'').trim();if(!q)return res.json([]);const like=`%${q}%`;res.json(db.prepare(`SELECT m.*,u.name author,(SELECT COUNT(*) FROM likes WHERE media_id=m.id) likes,(SELECT COUNT(*) FROM comments WHERE media_id=m.id) comments FROM media m LEFT JOIN users u ON u.id=m.user_id WHERE m.status='published' AND (m.title LIKE ? OR m.description LIKE ? OR m.genre LIKE ? OR u.name LIKE ?) ORDER BY m.created_at DESC LIMIT 100`).all(like,like,like,like))});
app.post('/api/media/:id/report',auth,(req,res)=>{const reason=String(req.body?.reason||'').trim();if(!reason)return res.status(400).json({error:'Impamvu irakenewe'});db.prepare('INSERT INTO reports(media_id,user_id,reason) VALUES(?,?,?)').run(req.params.id,req.user.id,reason.slice(0,500));res.json({ok:true});});
app.get('/api/admin/reports',auth,admin,(req,res)=>res.json(db.prepare("SELECT r.*,m.title media_title,u.name reporter FROM reports r LEFT JOIN media m ON m.id=r.media_id JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC").all()));
app.patch('/api/admin/media/:id/status',auth,admin,(req,res)=>{const status=['published','pending','rejected'].includes(req.body?.status)?req.body.status:null;if(!status)return res.status(400).json({error:'Status itemewe'});db.prepare('UPDATE media SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status,req.params.id);res.json({ok:true,status})});
app.get('/api/admin/stats',auth,admin,(req,res)=>res.json({users:db.prepare('SELECT COUNT(*) c FROM users').get().c,media:db.prepare('SELECT COUNT(*) c FROM media').get().c,posts:db.prepare('SELECT COUNT(*) c FROM posts').get().c,comments:db.prepare('SELECT (SELECT COUNT(*) FROM comments)+(SELECT COUNT(*) FROM post_comments) c').get().c,views:db.prepare('SELECT COALESCE(SUM(views),0) c FROM media').get().c,live:db.prepare('SELECT COUNT(*) c FROM live_rooms').get().c}));
app.get('/api/admin/users',auth,admin,(req,res)=>res.json(db.prepare('SELECT id,name,email,role,created_at FROM users ORDER BY created_at DESC').all()));


// Admin controls: full user/content management and admin password change
app.get('/api/admin/media',auth,admin,(req,res)=>{
  res.json(db.prepare(`SELECT m.*,u.name author,u.email author_email,
    (SELECT COUNT(*) FROM likes l WHERE l.media_id=m.id) likes,
    (SELECT COUNT(*) FROM comments c WHERE c.media_id=m.id) comments
    FROM media m LEFT JOIN users u ON u.id=m.user_id ORDER BY datetime(m.created_at) DESC`).all());
});
app.patch('/api/admin/users/:id/role',auth,admin,(req,res)=>{
  const id=Number(req.params.id), role=req.body?.role;
  if(!['user','admin'].includes(role)) return res.status(400).json({error:'Role itemewe'});
  if(id===req.user.id && role!=='admin') return res.status(400).json({error:'Ntushobora kwiyambura admin uri gukoresha konti'});
  db.prepare('UPDATE users SET role=? WHERE id=?').run(role,id);
  res.json({ok:true});
});
app.delete('/api/admin/users/:id',auth,admin,(req,res)=>{
  const id=Number(req.params.id);
  if(id===req.user.id) return res.status(400).json({error:'Ntushobora gusiba konti yawe uri gukoresha admin'});
  const u=db.prepare('SELECT id FROM users WHERE id=?').get(id);
  if(!u) return res.status(404).json({error:'User ntabonetse'});
  db.prepare('DELETE FROM comments WHERE user_id=?').run(id);
  db.prepare('DELETE FROM likes WHERE user_id=?').run(id);
  db.prepare('DELETE FROM follows WHERE follower_id=? OR following_id=?').run(id,id);
  db.prepare('DELETE FROM post_comments WHERE user_id=?').run(id);
  db.prepare('DELETE FROM post_likes WHERE user_id=?').run(id);
  db.prepare('DELETE FROM reports WHERE user_id=?').run(id);
  db.prepare('DELETE FROM posts WHERE user_id=?').run(id);
  db.prepare('DELETE FROM live_rooms WHERE host_id=?').run(id);
  const files=db.prepare('SELECT filename,poster FROM media WHERE user_id=?').all(id);
  for(const f of files){removeFile(f.filename);removeFile(f.poster)}
  db.prepare('DELETE FROM media WHERE user_id=?').run(id);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  res.json({ok:true});
});
app.patch('/api/admin/password',auth,admin,(req,res)=>{
  const current=String(req.body?.current||''), next=String(req.body?.next||'');
  const u=db.prepare('SELECT password FROM users WHERE id=?').get(req.user.id);
  if(!u || !bcrypt.compareSync(current,u.password)) return res.status(400).json({error:'Password ya none si yo'});
  if(next.length<8) return res.status(400).json({error:'Password nshya igomba kuba nibura inyuguti 8'});
  db.prepare('UPDATE users SET password=? WHERE id=?').run(bcrypt.hashSync(next,10),req.user.id);
  res.json({ok:true});
});

app.get('/robots.txt',(req,res)=>{res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /uploads/\nSitemap: /sitemap.xml\n`)});
app.get('/sitemap.xml',(req,res)=>{const base=(process.env.SITE_URL||(`${req.protocol}://${req.get('host')}`)).replace(/\/$/,'');const rows=['/','/films','/videos','/music','/photos','/sports','/latest','/trending','/popular','/about','/contact','/privacy','/terms','/copyright','/content-policy'];const media=db.prepare("SELECT id,updated_at,created_at FROM media WHERE status='published' ORDER BY datetime(updated_at) DESC LIMIT 5000").all();const urls=rows.map(x=>`<url><loc>${base}${x}</loc></url>`).concat(media.map(x=>`<url><loc>${base}/media/${x.id}</loc><lastmod>${new Date(x.updated_at||x.created_at).toISOString()}</lastmod></url>`));res.type('application/xml').send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join('')}</urlset>`)});
app.get('/ads.txt',(req,res)=>res.type('text/plain').send('# MEDIA RWANDA - replace this comment with your real Google AdSense seller line after approval. Do not invent a publisher ID.\n'));
app.use((req,res)=>{
  if(req.path.startsWith('/api/')){
    return res.status(404).json({error:'API route not found'});
  }

  const indexFile = path.join(ROOT,'index.html');

  if(!fs.existsSync(indexFile)){
    return res.status(500).send('Rwanda Vibe Media: index.html ntibonetse.');
  }

  res.sendFile(indexFile);
});

app.listen(PORT,()=>{
  console.log(`MEDIA RWANDA running at http://localhost:${PORT}`);
});
