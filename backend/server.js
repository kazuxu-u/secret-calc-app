const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// --- 設定 ---
// Supabaseの設定（あとで環境変数とかで設定してね！✨）
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'your-service-role-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let config = { storagePath: path.join(__dirname, 'storage'), port: 3001 };
const configPath = path.join(__dirname, 'config.json');
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// フォルダ作成
if (!fs.existsSync(config.storagePath)) fs.mkdirSync(config.storagePath, { recursive: true });
const uploadDir = path.join(config.storagePath, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadDir));

// ★フロントエンドのビルド済みファイルを配布する設定
const frontendDistPath = path.join(__dirname, '../frontend/dist');
if (fs.existsSync(frontendDistPath)) {
  app.use(express.static(frontendDistPath));
  app.get(/^(?!\/api\/).+/, (req, res) => res.sendFile(path.join(frontendDistPath, 'index.html')));
}

// ファイルアップロード
const upload = multer({ storage: multer.diskStorage({
  destination: (req, file, cb) => { cb(null, uploadDir); },
  filename: (req, file, cb) => { cb(null, Date.now() + '-' + file.originalname); }
}) });

app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  res.json({ filename: req.file.filename, originalName: req.file.originalname });
});

app.post('/signup', async (req, res) => {
  const { username, password, display_name, id_name } = req.body;
  const { data, error } = await supabase
    .from('users')
    .insert([{ 
      username, 
      password, 
      display_name: display_name || username, 
      id_name: id_name || username,
      level: 1,
      is_suspended: false
    }]);
  
  if (error) return res.status(400).json({ success: false, error: 'その名前かIDはもう使われてるよ！😭' });
  res.json({ success: true });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .eq('password', password)
    .single();

  if (error || !data) return res.status(401).json({ success: false, error: '名前かパスワードが違くない？🤨' });
  if (data.is_suspended) return res.status(403).json({ success: false, error: 'このアカウントは停止されてるよ...🥺' });

  res.json({ success: true, username: data.username, level: data.level, displayName: data.display_name });
});

app.get('/search_user', async (req, res) => {
  const { id_name } = req.query;
  const { data, error } = await supabase
    .from('users')
    .select('username, display_name, id_name')
    .eq('id_name', id_name)
    .single();
  
  if (error || !data) return res.json({ success: false });
  res.json({ success: true, user: data });
});

app.get('/all_users', async (req, res) => {
  const { data, error } = await supabase
    .from('users')
    .select('username, display_name, id_name, level, is_suspended');
  
  if (error) return res.status(500).json({ success: false });
  res.json({ success: true, users: data });
});

app.post('/suspend_user', async (req, res) => {
  const { target_username, status } = req.body;
  const { error } = await supabase
    .from('users')
    .update({ is_suspended: status })
    .eq('username', target_username);
  
  if (error) return res.status(500).json({ success: false });
  res.json({ success: true });
});

// 管理者シード（起動時に1回チェック）
const seedAdmin = async () => {
  const { data } = await supabase.from('users').select('*').eq('username', '管理者').single();
  if (!data) {
    await supabase.from('users').insert([{
      username: '管理者',
      password: '0325umebosi',
      display_name: '管理者',
      id_name: 'kanrisya',
      level: 5,
      is_suspended: false
    }]);
    console.log('👑 管理者アカウントを作成したよ！');
  }
};
seedAdmin();

// 通信ロジック
let onlineUsers = {}; 
io.on('connection', (socket) => {
  socket.on('register_user', ({ user, peerId, level }) => {
    onlineUsers[socket.id] = { user, peerId, level };
    io.emit('update_user_list', Object.values(onlineUsers));
  });

  socket.on('friend_request', async ({ sender, recipient }) => {
    // 申請をSupabaseに保存（とりあえず簡易的に通知のみ）
    const targetSocket = Object.keys(onlineUsers).find(id => onlineUsers[id].user === recipient);
    if (targetSocket) {
      io.to(targetSocket).emit('receive_friend_request', { sender });
    }
  });

  socket.on('get_private_messages', async ({ sender, recipient }) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender.eq.${sender},recipient.eq.${recipient}),and(sender.eq.${recipient},recipient.eq.${sender})`)
      .order('timestamp', { ascending: true });
    
    if (!error) socket.emit('private_messages_history', data);
  });

  socket.on('send_private_message', async (data) => {
    const { sender, recipient, content, type, filename } = data;
    const { error } = await supabase
      .from('messages')
      .insert([{ sender, recipient, content, type, filename }]);
    
    io.emit('receive_private_message', data);
  });

  socket.on('disconnect', () => {
    delete onlineUsers[socket.id];
    io.emit('update_user_list', Object.values(onlineUsers));
  });
});

const PORT = config.port || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`-----------------------------------------`);
  console.log(`🚀 Gal LINE サーバー起動（Supabase連携版！）`);
  console.log(`📂 保存先: ${config.storagePath}`);
  console.log(`🔗 同じWi-FiのスマホからこのIPでアクセスしてね！`);
  console.log(`-----------------------------------------`);
});
