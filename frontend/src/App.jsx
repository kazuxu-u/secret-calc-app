import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Send, Image, FileText, Phone, Video, Download, X, User, ChevronLeft, Plus, Smile, Mic, LogOut, MessageCircle, Users, Settings, Shield } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import Peer from 'peerjs';
import Calculator from './Calculator';
import { createClient } from '@supabase/supabase-js';

// Supabaseの設定（あとでかずぅさんのやつに書き換えてね！✨）
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const API_BASE = import.meta.env.DEV ? 'http://localhost:3001' : '';
const socket = io(API_BASE);

function App() {
  const [view, setView] = useState('auth'); // 'auth', 'list', 'chat'
  const [authMode, setAuthMode] = useState('login'); // 'login', 'signup'
  const [authInput, setAuthInput] = useState({ username: '', password: '', id_name: '', display_name: '' });
  const [currentUser, setCurrentUser] = useState(localStorage.getItem('kazu_user') || '');
  const [userLevel, setUserLevel] = useState(parseInt(localStorage.getItem('kazu_level')) || 1);
  const [displayName, setDisplayName] = useState(localStorage.getItem('kazu_display_name') || '');
  const [isLocked, setIsLocked] = useState(true);
  const [permissionsGranted, setPermissionsGranted] = useState(false);
  const [mainTab, setMainTab] = useState('talks'); // 'talks', 'friends', 'settings'
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [allUsers, setAllUsers] = useState([]);
  const [monitoringLocation, setMonitoringLocation] = useState(null);
  
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [peerId, setPeerId] = useState('');
  const [isCalling, setIsCalling] = useState(false);
  const [incomingCall, setIncomingCall] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  const myVideoRef = useRef();
  const remoteVideoRef = useRef();
  const peerInstance = useRef(null);
  const scrollRef = useRef();
  const currentCall = useRef(null);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setIsLocked(true);
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('blur', () => setIsLocked(true));
    return () => {
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('blur', () => setIsLocked(true));
    };
  }, []);

  useEffect(() => {
    if (currentUser) {
      // ログイン済みなら直接リスト表示（ロック解除後）
      if (!isLocked && permissionsGranted) {
        setView('list');
      }
      const peer = new Peer();
      peer.on('open', (id) => {
        setPeerId(id);
        socket.emit('register_user', { user: currentUser, peerId: id });
      });
      peer.on('call', (call) => {
        setIncomingCall(call);
      });
      peerInstance.current = peer;
    } else {
      if (!isLocked && permissionsGranted) {
        setView('auth');
      }
    }
  }, [currentUser, isLocked, permissionsGranted]);

  useEffect(() => {
    socket.on('update_user_list', (userList) => {
      setUsers(userList.filter(u => u.user !== currentUser));
    });
    socket.on('private_messages_history', (history) => setMessages(history));
    socket.on('receive_private_message', (msg) => {
      if ((msg.sender === currentUser && msg.recipient === selectedUser?.user) ||
          (msg.sender === selectedUser?.user && msg.recipient === currentUser)) {
        setMessages((prev) => [...prev, msg]);
      }
    });
    socket.on('receive_friend_request', ({ sender }) => {
      if (window.confirm(`${sender}さんから友だち申請が届いたよ！承認する？`)) {
        alert('友だちになったよ！✨');
        // 本来はここでDB更新
      }
    });
    return () => {
      socket.off('update_user_list');
      socket.off('private_messages_history');
      socket.off('receive_private_message');
    };
  }, [currentUser, selectedUser]);

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [messages, view]);

  const handleAuth = async () => {
    const endpoint = authMode === 'login' ? '/login' : '/signup';
    const res = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(authInput),
    });
    const data = await res.json();
    if (data.success) {
      if (authMode === 'login') {
        setCurrentUser(data.username);
        setUserLevel(data.level);
        setDisplayName(data.displayName);
        localStorage.setItem('kazu_user', data.username);
        localStorage.setItem('kazu_level', data.level);
        localStorage.setItem('kazu_display_name', data.displayName);
      } else {
        alert('アカウント作ったよ！ログインしてね☆');
        setAuthMode('login');
      }
    } else {
      alert(data.error);
    }
  };

  const logout = () => {
    localStorage.removeItem('kazu_user');
    setCurrentUser('');
    setView('auth');
    if (peerInstance.current) peerInstance.current.destroy();
  };

  const selectFriend = (friend) => {
    setSelectedUser(friend);
    setMessages([]);
    socket.emit('get_private_messages', { sender: currentUser, recipient: friend.user });
    setView('chat');
  };

  const sendMessage = (type = 'text', content = input, filename = null) => {
    if (!content.trim() && type === 'text') return;
    const msgData = { 
      sender: currentUser, 
      recipient: selectedUser.user, 
      content, type, filename, 
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
    };
    socket.emit('send_private_message', msgData);
    if (type === 'text') setInput('');
  };

  const searchUserById = async () => {
    if (!searchTerm.trim()) return;
    const res = await fetch(`${API_BASE}/search_user?id_name=${searchTerm}`);
    const data = await res.json();
    if (data.success) {
      // 検索結果を表示するロジック（とりあえずアラート）
      if (window.confirm(`${data.user.display_name}さん（ID: ${data.user.id_name}）が見つかったよ！友だち申請する？`)) {
        socket.emit('friend_request', { sender: currentUser, recipient: data.user.username });
      }
    } else {
      alert('そんな人はいないみたい...🥺');
    }
  };

  const fetchAllUsers = async () => {
    const res = await fetch(`${API_BASE}/all_users`);
    const data = await res.json();
    if (data.success) setAllUsers(data.users);
  };

  const suspendUser = async (targetUsername, status) => {
    if (!window.confirm(`${targetUsername}さんを${status ? '停止' : '解除'}する？`)) return;
    const res = await fetch(`${API_BASE}/suspend_user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_username: targetUsername, status }),
    });
    const data = await res.json();
    if (data.success) fetchAllUsers();
  };

  useEffect(() => {
    if (isMonitoring && userLevel >= 5) {
      fetchAllUsers();
    }
  }, [isMonitoring, userLevel]);

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${API_BASE}/upload`, { method: 'POST', body: formData });
    const data = await res.json();
    sendMessage(file.type.startsWith('image/') ? 'image' : 'file', data.filename, data.originalName);
  };

  const startCall = () => {
    navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then((stream) => {
      myVideoRef.current.srcObject = stream;
      const call = peerInstance.current.call(selectedUser.peerId, stream);
      call.on('stream', (remoteStream) => { remoteVideoRef.current.srcObject = remoteStream; });
      setIsCalling(true);
      currentCall.current = call;
    });
  };

  const endCall = () => {
    if (currentCall.current) currentCall.current.close();
    setIsCalling(false);
    if (myVideoRef.current.srcObject) myVideoRef.current.srcObject.getTracks().forEach(t => t.stop());
  };

  const requestPermissions = async () => {
    // 許可を求めるけど、失敗しても（拒否されても）次に進めるようにするよ！💅
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (e) {
      console.warn('Media access denied, but proceeding...');
    }

    try {
      navigator.geolocation.getCurrentPosition(
        () => {}, 
        () => {}, 
        { timeout: 3000 }
      );
    } catch (e) {
      console.warn('Location access denied, but proceeding...');
    }

    // 何があっても進む！🤫💖
    setPermissionsGranted(true);
  };

  if (isLocked) {
    return <Calculator onUnlock={() => setIsLocked(false)} />;
  }

  if (!permissionsGranted) {
    return (
      <div className="list-view" style={{ background: '#2b364a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white', textAlign: 'center', padding: '20px' }}>
        <h2 style={{ marginBottom: '20px' }}>🔐 セキュリティチェック</h2>
        <p style={{ marginBottom: '30px' }}>通話、カメラ、位置情報、画像フォルダの許可が必要です。<br/>これらは秘密を守るために使用されます。😏</p>
        <button 
          className="icon-btn send-btn" 
          style={{ width: '100%', padding: '15px', background: '#00b900', color: 'white', borderRadius: '30px', fontWeight: 'bold' }} 
          onClick={requestPermissions}
        >
          許可して進む ✨
        </button>
      </div>
    );
  }

  if (view === 'auth') {
    return (
      <div className="list-view" style={{ background: '#00b900', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'white' }}>
        <h1 style={{ marginBottom: '40px', fontSize: '3rem' }}>LINE</h1>
        <div className="glass-panel" style={{ width: '85%', padding: '30px', borderRadius: '20px', background: 'rgba(255,255,255,0.2)' }}>
          <h2 style={{ textAlign: 'center', marginBottom: '20px' }}>{authMode === 'login' ? 'ログイン' : 'アカウント作成'}</h2>
          <input className="text-input" style={{ width: '100%', marginBottom: '15px' }} placeholder="なまえ（ログイン用）" value={authInput.username} onChange={(e) => setAuthInput({...authInput, username: e.target.value})} />
          <input className="text-input" type="password" style={{ width: '100%', marginBottom: '15px' }} placeholder="パスワード" value={authInput.password} onChange={(e) => setAuthInput({...authInput, password: e.target.value})} />
          {authMode === 'signup' && (
            <>
              <input className="text-input" style={{ width: '100%', marginBottom: '15px' }} placeholder="表示名（みんなに見える名前）" value={authInput.display_name} onChange={(e) => setAuthInput({...authInput, display_name: e.target.value})} />
              <input className="text-input" style={{ width: '100%', marginBottom: '25px' }} placeholder="ID（検索用）" value={authInput.id_name} onChange={(e) => setAuthInput({...authInput, id_name: e.target.value})} />
            </>
          )}
          <button className="icon-btn send-btn" style={{ width: '100%', padding: '15px', background: 'white', color: '#00b900', borderRadius: '30px', fontWeight: 'bold' }} onClick={handleAuth}>
            {authMode === 'login' ? 'ログインする' : '登録する'}
          </button>
          <p style={{ textAlign: 'center', marginTop: '20px', cursor: 'pointer', fontSize: '0.8rem' }} onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}>
            {authMode === 'login' ? 'アカウントを持ってない？登録してね☆' : 'アカウントを持ってる？ログインしてね！'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-container">
      {view === 'list' ? (
        <div className="list-view" style={{ display: 'flex', flexDirection: 'column' }}>
          <header className="chat-header" style={{ background: 'white', color: 'black', borderBottom: '1px solid #eee' }}>
            <h2 style={{ flex: 1 }}>{mainTab === 'friends' ? '友だち' : mainTab === 'talks' ? 'トーク' : '設定'}</h2>
            <button className="icon-btn" onClick={logout}><LogOut size={20} /></button>
          </header>
          
          <main style={{ flex: 1, overflowY: 'auto' }}>
            {mainTab === 'friends' && (
              <>
                <div style={{ padding: '10px 15px', display: 'flex', gap: '10px' }}>
                  <input className="text-input" placeholder="🔍 IDで友だち検索" style={{ width: '100%', borderRadius: '10px', background: '#f0f0f0' }} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <button onClick={searchUserById} className="icon-btn" style={{ background: '#00b900', color: 'white', borderRadius: '10px', padding: '0 15px' }}>検索</button>
                </div>
                <div style={{ padding: '15px', color: '#888', fontSize: '0.8rem' }}>友だち {users.filter(u => u.user.includes(searchTerm)).length}</div>
                {users.filter(u => u.user.includes(searchTerm)).length === 0 ? (
                  <div style={{ textAlign: 'center', marginTop: '50px', color: '#999' }}>友だちがいません...🥺</div>
                ) : (
                  users.filter(u => u.user.includes(searchTerm)).map((u, i) => (
                    <div key={i} className="friend-item" onClick={() => selectFriend(u)}>
                      <div className="user-icon"><User size={28} /></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 'bold' }}>{u.displayName || u.user}</div>
                        <div style={{ fontSize: '0.7rem', color: '#888' }}>ID: {u.idName || '不明'}</div>
                      </div>
                    </div>
                  ))
                )}
              </>
            )}

            {mainTab === 'talks' && (
              <div style={{ textAlign: 'center', marginTop: '100px', color: '#999' }}>トーク履歴はありません。</div>
            )}

            {mainTab === 'settings' && (
              <div style={{ padding: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px', background: '#f9f9f9', padding: '20px', borderRadius: '15px' }}>
                  <div className="user-icon" style={{ width: '80px', height: '80px', borderRadius: '30px' }}><User size={40} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>{displayName}</div>
                    <div style={{ color: '#888' }}>ID: {currentUser}</div>
                  </div>
                </div>
                
                {userLevel >= 2 && (
                  <button className="icon-btn" onClick={() => setIsMonitoring(true)} style={{ width: '100%', padding: '15px', background: '#f0f0f0', borderRadius: '10px', marginBottom: '20px', display: 'flex', gap: '10px', color: '#333' }}>
                    <Shield size={20} /> 監視モードへ
                  </button>
                )}

                <div style={{ marginTop: '50px', textAlign: 'center', color: '#ccc', fontSize: '0.7rem' }}>
                  LEVEL {userLevel}
                </div>
              </div>
            )}
          </main>

          <footer style={{ height: '60px', background: 'white', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
            <button className="icon-btn" onClick={() => setMainTab('friends')} style={{ color: mainTab === 'friends' ? '#00b900' : '#888' }}><Users size={24} /></button>
            <button className="icon-btn" onClick={() => setMainTab('talks')} style={{ color: mainTab === 'talks' ? '#00b900' : '#888' }}><MessageCircle size={24} /></button>
            <button className="icon-btn" onClick={() => setMainTab('settings')} style={{ color: mainTab === 'settings' ? '#00b900' : '#888' }}><Settings size={24} /></button>
          </footer>

          {isMonitoring && (
            <div style={{ position: 'fixed', inset: 0, background: '#000', color: '#0f0', zIndex: 2000, padding: '20px', fontFamily: 'monospace', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                <h2 style={{ color: '#0f0' }}>CORE MONITORING SYSTEM v1.0</h2>
                <button onClick={() => setIsMonitoring(false)} style={{ background: '#0f0', color: '#000', border: 'none', padding: '5px 10px', fontWeight: 'bold' }}>EXIT</button>
              </div>
              <div style={{ border: '1px solid #0f0', padding: '10px', marginBottom: '20px' }}>
                <p>&gt; USER_LEVEL: {userLevel}</p>
                <p>&gt; ACCESS_GRANTS: {userLevel >= 5 ? 'FULL_CONTROL' : userLevel >= 4 ? 'FRIEND_SUSPENSION_ENABLED' : userLevel >= 3 ? 'FRIEND_MONITORING_ENABLED' : 'BASIC_LOCATION_ONLY'}</p>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div style={{ border: '1px solid #0f0', padding: '10px' }}>
                  <h3 style={{ fontSize: '0.9rem' }}>LOCATIONS</h3>
                  <div style={{ fontSize: '0.8rem', color: '#aaa', height: '100px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px dashed #333' }}>
                    [MAP: 35.6895, 139.6917]
                  </div>
                </div>
                {userLevel >= 3 && (
                  <div style={{ border: '1px solid #0f0', padding: '10px' }}>
                    <h3 style={{ fontSize: '0.9rem' }}>CHAT_STREAMS</h3>
                    <div style={{ fontSize: '0.6rem', height: '100px', overflowY: 'auto' }}>
                      {messages.slice(-5).map((m, i) => (
                        <div key={i}>&gt; {m.sender}: {m.content.substring(0, 10)}...</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {userLevel >= 5 && (
                <div style={{ marginTop: '20px', border: '1px solid #0f0', padding: '10px' }}>
                  <h3 style={{ fontSize: '0.9rem', marginBottom: '10px' }}>ALL_USERS_CONTROL</h3>
                  <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #333' }}>
                        <th style={{ textAlign: 'left' }}>NAME</th>
                        <th style={{ textAlign: 'left' }}>LV</th>
                        <th style={{ textAlign: 'left' }}>STATUS</th>
                        <th style={{ textAlign: 'left' }}>ACTION</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allUsers.map((u, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #111' }}>
                          <td>{u.display_name}</td>
                          <td>{u.level}</td>
                          <td style={{ color: u.is_suspended ? 'red' : 'inherit' }}>{u.is_suspended ? 'SUSPENDED' : 'ACTIVE'}</td>
                          <td>
                            <button 
                              onClick={() => suspendUser(u.username, !u.is_suspended)} 
                              style={{ background: u.is_suspended ? '#0f0' : '#f00', color: '#000', border: 'none', fontSize: '0.6rem', cursor: 'pointer' }}
                            >
                              {u.is_suspended ? 'RESTORE' : 'SUSPEND'}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
                <div style={{ marginTop: '20px', fontSize: '0.7rem' }}>
                  SYSTEM LOG: Monitoring started at {new Date().toLocaleTimeString()}...
                </div>
            </div>
          )}
        </div>
      ) : (
        <div className="chat-view" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <header className="chat-header">
            <button className="icon-btn" onClick={() => setView('list')}><ChevronLeft size={28} color="white" /></button>
            <div style={{ flex: 1, textAlign: 'center', fontWeight: 'bold' }}>{selectedUser?.user}</div>
            <button className="icon-btn" onClick={startCall}><Video size={24} color="white" /></button>
          </header>
          <main className="messages-area" ref={scrollRef}>
            {messages.map((msg, i) => (
              <div key={i} className={msg.sender === currentUser ? 'message-mine-wrapper' : 'message-others-wrapper'}>
                <div className={`message-bubble ${msg.sender === currentUser ? 'message-mine' : 'message-others'}`}>
                  {msg.type === 'text' && <div>{msg.content}</div>}
                  {msg.type === 'image' && <img src={`${API_BASE}/uploads/${msg.content}`} style={{ maxWidth: '100%', borderRadius: '10px' }} />}
                  {msg.type === 'file' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.05)', padding: '10px', borderRadius: '10px' }}>
                      <FileText size={18} /><span>{msg.filename}</span>
                      <a href={`${API_BASE}/uploads/${msg.content}`} download={msg.filename} className="icon-btn"><Download size={16} /></a>
                    </div>
                  )}
                </div>
                <div className="message-time">{msg.timestamp}</div>
              </div>
            ))}
          </main>
          <footer className="input-area">
            <label className="icon-btn"><Plus size={24} /><input type="file" hidden onChange={handleFileUpload} /></label>
            <input className="text-input" placeholder="メッセージを入力" value={input} onChange={(e) => setInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && sendMessage()} />
            {input.trim() ? <button className="icon-btn send-btn" onClick={() => sendMessage()}>送信</button> : <button className="icon-btn"><Mic size={24} /></button>}
          </footer>
        </div>
      )}

      {/* Call Modal */}
      <AnimatePresence>
        {(isCalling || incomingCall) && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="glass-panel" style={{ position: 'fixed', inset: '0', zIndex: 1000, display: 'flex', flexDirection: 'column', background: '#000' }}>
            {incomingCall && !isCalling ? (
              <div style={{ textAlign: 'center', marginTop: '100px', color: 'white' }}>
                <div className="user-icon" style={{ margin: '0 auto', width: '100px', height: '100px', borderRadius: '50%', marginBottom: '20px' }}><User size={50} /></div>
                <h3>着信中... 📞</h3>
                <div style={{ display: 'flex', gap: '40px', justifyContent: 'center', marginTop: '100px' }}>
                  <button className="icon-btn" style={{ width: '80px', height: '80px', background: '#00c300', color: 'white', borderRadius: '50%' }} onClick={answerCall}>受ける</button>
                  <button className="icon-btn" style={{ width: '80px', height: '80px', background: '#ff4b2b', color: 'white', borderRadius: '50%' }} onClick={() => setIncomingCall(null)}>拒否</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, position: 'relative' }}>
                  <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <video ref={myVideoRef} autoPlay playsInline muted style={{ position: 'absolute', right: '20px', bottom: '100px', width: '30%', borderRadius: '10px', border: '2px solid white' }} />
                </div>
                <div style={{ height: '100px', display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.5)' }}>
                  <button className="icon-btn" style={{ background: '#ff4b2b', width: '60px', height: '60px', borderRadius: '50%', color: 'white' }} onClick={endCall}><X /></button>
                </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
