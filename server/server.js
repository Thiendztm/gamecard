require('dotenv').config();
const path = require('path');
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { ping, pool } = require('./db');
// Optional: run DB migration automatically when starting (controlled by env)
if (process.env.MIGRATE_ON_START === 'true') {
  try {
    const { spawnSync } = require('child_process');
    const migratePath = path.join(__dirname, 'db', 'migrate.js');
    console.log('⏳ Running database migrations (MIGRATE_ON_START=true)...');
    const res = spawnSync('node', [migratePath], { stdio: 'inherit' });
    if (res.status !== 0) {
      console.error('✗ Migrations failed, exiting server start');
      process.exit(res.status || 1);
    } else {
      console.log('✓ Migrations completed');
    }
  } catch (e) {
    console.error('Failed to run migrations:', e.message);
  }
}

const PORT = process.env.PORT || 4000;
const CLIENT_DIR = path.join(__dirname, '..', 'client');

// Test database connection
(async () => {
  try {
    await ping();
    console.log('✓ Database connection OK');
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
  }
})();

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// ===== In-memory lobby state (simplified) =====
const gameRooms = new Map(); // roomId -> roomData
const playerRooms = new Map(); // socket.id -> roomId
const playerSockets = new Map(); // playerId(username) -> socket.id

// ===== CARD GAME ENGINE (ported) =====
const fs = require('fs');
let rules;
try {
  rules = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'rules.json')));
} catch (e) {
  console.warn('Could not load rules.json for card game, using defaults');
  rules = { HP_START:100, TURN_LIMIT:10, TURN_SECONDS:20, HAND_SIZE:5, DECK_MAX:15, TYPE_LIMIT:6, CARD_VALUES:{attack:30,defend:25,heal:35,curse:0}, SPECIALS:{ Reimu:{bonus:20}, Marisa:{bonus:25} }, CURSE:{ duration:3, hpDebuff:5, atkDebuff:5 } };
}

const { AIBotManager } = require('../bot.js');
const aiManager = new AIBotManager();
setInterval(()=> aiManager.cleanup(), 3600000);

let cardGameWaiting = null; // waiting socket id for PvP
const cardGameRooms = new Map(); // gameRoomId -> room
let nextCardGameRoomId = 1;

function shuffle(arr){ for(let i=arr.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [arr[i],arr[j]]=[arr[j],arr[i]];} return arr; }
function makeDeckFromList(list){ return shuffle(list.slice()); }
function drawCards(state,count){ const drawn=[]; for(let i=0;i<count;i++){ if(state.deck.length===0){ state.deck=shuffle(state.discard); state.discard=[]; if(state.deck.length===0) break; } drawn.push(state.deck.pop()); } state.hand.push(...drawn); }
function validateDeck(cards){ if(!Array.isArray(cards)) return 'Deck must be array'; if(cards.length!==rules.DECK_MAX) return `Deck size must be exactly ${rules.DECK_MAX}`; const counts={attack:0,defend:0,heal:0,curse:0}; for(const c of cards){ if(!['attack','defend','heal','curse'].includes(c)) return 'Unknown card '+c; counts[c]++; } for(const t of ['attack','defend','heal','curse']){ if(counts[t]>rules.TYPE_LIMIT) return `Too many ${t}`; } return null; }
function publicCardGameState(room){ const now=Date.now(); return { roomId:room.id, phase:room.phase, turn:room.turn, turnEndsAt:room.turnEndsAt, timerRemaining: Math.max(0, Math.floor((room.turnEndsAt-now)/1000)), players:Object.fromEntries(Object.entries(room.players).map(([sid,p])=>[sid,{ name:p.name, character:p.character, avatar:p.avatar, hp:p.hp, shield:p.shield, specialUsed:p.specialUsed, submitted:!!room.submissions[sid], lastPlayed:room.lastPlayed[sid]||null }]))}; }
function privateCardGameState(room,sid){ const pub=publicCardGameState(room); const me=room.players[sid]; return {...pub, you:sid, hand: me.hand }; }
function startCardGameTurn(room){ room.phase='play'; room.turn+=1; room.submissions={}; room.lastPlayed={}; room.turnEndsAt=Date.now()+rules.TURN_SECONDS*1000; for(const sid of Object.keys(room.players)){ if(!sid.startsWith('ai-bot-')) io.to(sid).emit('cardgame/state', privateCardGameState(room,sid)); }
  if(room.isAIGame) handleAITurn(room);
  clearTimeout(room.timer); room.timer=setTimeout(()=>resolveCardGameTurn(room), rules.TURN_SECONDS*1000+50);
}
function resolveCardGameTurn(room){ if(room.phase!=='play') return; room.phase='resolve'; for(const [sid,p] of Object.entries(room.players)){ if(!room.submissions[sid]){ p.hp-=20; room.lastPlayed[sid]={ card:null, note:'No play (-20 HP)' }; } }
  const ids=Object.keys(room.players); if(ids.length!==2) return; const [aId,bId]=ids; const A=room.players[aId]; const B=room.players[bId];
  function applySubmission(source,target,sub,sid){ if(!sub) return; const {card,useSpecial}=sub; if(card!=null && card>=0 && card<source.hand.length){ const type=source.hand[card]; source.discard.push(type); source.hand.splice(card,1); let note=type; if(useSpecial && !source.specialUsed){ if(source.character==='Reimu' && type==='heal'){ source._bonus={heal:rules.SPECIALS.Reimu.bonus}; source.specialUsed=true; note+=' + Special'; } else if(source.character==='Marisa' && type==='attack'){ source._bonus={attack:rules.SPECIALS.Marisa.bonus}; source.specialUsed=true; note+=' + Special'; } else { note+=' (special had no effect)'; } }
      if(type==='defend'){ source._queued=source._queued||[]; source._queued.push({kind:'shield', amount: rules.CARD_VALUES.defend}); }
      else if(type==='heal'){ let healAmount=rules.CARD_VALUES.heal; if(source.curse&&source.curse.turns>0){ healAmount=15; source.curse=null; source._curedCurse=true; } const bonus=(source._bonus&&source._bonus.heal)||0; source._queued=source._queued||[]; source._queued.push({kind:'heal', amount:healAmount+bonus}); }
      else if(type==='attack'){ const bonus=(source._bonus&&source._bonus.attack)||0; source._queued=source._queued||[]; source._queued.push({kind:'attack', amount: rules.CARD_VALUES.attack+bonus}); }
      else if(type==='curse'){ if(!target.curse||!target.curse.turns||target.curse.turns<=0){ target.curse={turns: rules.CURSE.duration}; } note+=' (Curse)'; }
      room.lastPlayed[sid]={ card:type, note };
    } }
  applySubmission(A,B,room.submissions[aId],aId); applySubmission(B,A,room.submissions[bId],bId);
  function applySelf(p){ if(!p._queued) return; for(const eff of p._queued){ if(eff.kind==='shield') p.shield+=eff.amount; if(eff.kind==='heal') p.hp=Math.min(rules.HP_START,p.hp+eff.amount); } }
  applySelf(A); applySelf(B);
  for(const p of [A,B]){ if(p.curse&&p.curse.turns>0){ p.hp-=rules.CURSE.hpDebuff; p.curse.turns--; if(p.curse.turns<=0) p.curse=null; } }
  function dealDamage(t,amt){ let rem=amt; const absorbed=Math.min(t.shield,rem); t.shield-=absorbed; rem-=absorbed; t.hp-=rem; }
  function applyAttacks(src,tgt){ if(!src._queued) return; let atkDebuff= (src.curse&&src.curse.turns>0)? rules.CURSE.atkDebuff:0; for(const eff of src._queued){ if(eff.kind==='attack') dealDamage(tgt, Math.max(0, eff.amount-atkDebuff)); } }
  applyAttacks(A,B); applyAttacks(B,A);
  for(const p of [A,B]){ delete p._queued; delete p._bonus; }
  for(const p of [A,B]){ const need=Math.max(0, rules.HAND_SIZE - p.hand.length); drawCards(p, need); }
  for(const sid of Object.keys(room.players)){ io.to(sid).emit('cardgame/state', privateCardGameState(room,sid)); }
  const someoneDead = A.hp<=0 || B.hp<=0; const turnLimit = room.turn>=rules.TURN_LIMIT; 
  if(someoneDead || turnLimit){ 
    room.phase='end'; 
    const result={ a:{id:aId,hp:A.hp}, b:{id:bId,hp:B.hp}, turn:room.turn }; 
    io.to(room.id).emit('cardgame/end', result); 
    
    // Clean up room after game ends
    setTimeout(() => {
      cardGameRooms.delete(room.id);
      console.log(`Card game room ${room.id} deleted after game end`);
    }, 1000);
    
    return; 
  }
  setTimeout(()=>startCardGameTurn(room),800);
}
function createCardGameRoom(a,b){ const id='cardgame-'+(nextCardGameRoomId++); const room={ id, players:{}, phase:'deckbuild', turn:0, turnEndsAt:0, timer:null, submissions:{}, lastPlayed:{} }; cardGameRooms.set(id,room); for(const s of [a,b]){ s.join(id); room.players[s.id]={ id:s.id, name:s.data?.name||'Player', character:s.data?.character||'Reimu', avatar:s.data?.avatar||null, hp:rules.HP_START, shield:0, deck:[], hand:[], discard:[], specialUsed:false }; } io.to(id).emit('cardgame/matched',{roomId:id, phase:room.phase}); for(const sid of [a.id,b.id]) io.to(sid).emit('cardgame/state', privateCardGameState(room,sid)); return room; }
function createAIRoom(humanSocket, aiDifficulty='medium'){ 
  console.log("Creating AI room for socket:", humanSocket.id);
  const id='airoom-'+(nextCardGameRoomId++); 
  const aiBot = aiManager.createBot(null,'Marisa', aiDifficulty); 
  aiBot.generateDeck(); 
  const room={ id, players:{}, phase:'deckbuild', turn:0, turnEndsAt:0, timer:null, submissions:{}, lastPlayed:{}, isAIGame:true, aiBot }; 
  cardGameRooms.set(id,room); 
  humanSocket.join(id); 
  room.players[humanSocket.id]={ id:humanSocket.id, name:humanSocket.data?.name||'Player', character:humanSocket.data?.character||'Reimu', avatar:humanSocket.data?.avatar||null, hp:rules.HP_START, shield:0, deck:[], hand:[], discard:[], specialUsed:false }; 
  room.players[aiBot.id]={ id:aiBot.id, name:aiBot.name, character:aiBot.character, avatar:'/assets/marisa.png', hp:aiBot.hp, shield:aiBot.shield, deck:aiBot.deck, hand:aiBot.hand, discard:aiBot.discard, specialUsed:aiBot.specialUsed }; 
  console.log("AI room created, emitting matched event to:", humanSocket.id);
  io.to(id).emit('cardgame/matched',{ roomId:id, phase:room.phase, isAIGame:true, aiOpponent:{ name:aiBot.name, character:aiBot.character, difficulty:aiBot.difficulty } }); 
  io.to(humanSocket.id).emit('cardgame/state', privateCardGameState(room, humanSocket.id)); 
  return room; 
}
function handleAITurn(room){ const aiBot=room.aiBot; if(!aiBot) return; const humanId=Object.keys(room.players).find(id=>id!==aiBot.id); const gameState={ turn:room.turn, players:room.players, phase:room.phase }; const decision=aiBot.makeDecision(gameState); const thinkingTime = aiBot.difficulty==='easy'? 500+Math.random()*1000 : aiBot.difficulty==='medium'? 1000+Math.random()*1500 : aiBot.difficulty==='hard'? 1500+Math.random()*2000 : 2000+Math.random()*2500; setTimeout(()=>{ if(room.phase==='play' && !room.submissions[aiBot.id]){ let final=decision; if(decision.cardIndex>=aiBot.hand.length || decision.cardIndex<0) final={cardIndex:0,useSpecial:false}; room.submissions[aiBot.id]={ card: final.cardIndex, useSpecial: final.useSpecial }; io.to(room.id).emit('cardgame/submitted',{ player: aiBot.id, isAI:true }); if(Object.keys(room.submissions).length===Object.keys(room.players).length) resolveCardGameTurn(room); } }, thinkingTime); }

async function getUserAvatar(username) {
  try {
    await ensureAvatarColumn();
    const [rows] = await pool.execute('SELECT avatar FROM users WHERE username = ? LIMIT 1', [username]);
    if (rows.length && rows[0].avatar) return rows[0].avatar;
  } catch (e) {
    // ignore
  }
  return '/assets/reimu2.png';
}

function broadcastRoomList() {
  io.emit('roomList', Array.from(gameRooms.values()));
}

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for development
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { success: false, message: 'Too many requests' }
});
app.use('/api/', limiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 auth requests per windowMs
  message: { success: false, message: 'Too many auth attempts' }
});
app.use('/api/register', authLimiter);
app.use('/api/verify', authLimiter);
app.use('/api/login', authLimiter);

// Body parser and cookies
app.use(express.json());
app.use(cookieParser());

// Serve static files
app.use(express.static(CLIENT_DIR));
app.use('/DesignHud', express.static(path.join(__dirname, '..', 'DesignHud')));

// Mount auth routes
app.use('/api', require('./routes/auth'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, status: 'OK', timestamp: new Date().toISOString() });
});

// Ensure "avatar" column exists in users table (idempotent for dev convenience)
async function ensureAvatarColumn() {
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM users LIKE 'avatar'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE users ADD COLUMN avatar VARCHAR(255) NULL AFTER password_hash");
      console.log('Added avatar column to users table');
    }
  } catch (e) {
    console.warn('Could not ensure avatar column:', e.message);
  }
}
ensureAvatarColumn();

// POST /api/set-test-avatars - development helper to set avatars for test users
app.post('/api/set-test-avatars', async (req, res) => {
  try {
    await ensureAvatarColumn();
    const testUsers = {
      thiendzz: '/assets/marisa.png',
      thiencc: '/assets/cirno.png'
    };

    const updated = [];
    for (const [username, avatar] of Object.entries(testUsers)) {
      const [updateRes] = await pool.execute('UPDATE users SET avatar = ? WHERE username = ?', [avatar, username]);
      if (updateRes.affectedRows === 0) {
        // Insert user if missing (dev helper) with random password hash placeholder
        const placeholderPass = 'dev_placeholder';
        await pool.execute('INSERT INTO users (email, username, password_hash, avatar) VALUES (?, ?, ?, ?)', [
          `${username}@example.dev`, username, placeholderPass, avatar
        ]).catch(()=>{});
        const [secondUpdate] = await pool.execute('UPDATE users SET avatar = ? WHERE username = ?', [avatar, username]);
        if (secondUpdate.affectedRows > 0) {
          updated.push(username);
          console.log(`Inserted & set avatar for ${username}: ${avatar}`);
        } else {
          console.log(`Failed to set avatar for ${username}`);
        }
      } else {
        updated.push(username);
        console.log(`Set avatar for ${username}: ${avatar}`);
      }
    }

    res.json({
      success: true,
      message: 'Test avatars processed',
      updated,
      requested: Object.keys(testUsers)
    });
  } catch (err) {
    console.error('Error in set-test-avatars:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Send current rooms to new client
  socket.emit('roomList', Array.from(gameRooms.values()));

  // ===== CARD GAME EVENTS =====
  socket.data = { name: 'Player', character: 'Reimu' };
  socket.on('cardgame/join', ({ name, character, isBot, avatar }) => {
    console.log(`Card game join request: ${name}, ${character}, isBot: ${isBot}`);
    socket.data.name = name || 'Player';
    socket.data.character = character || 'Reimu';
    socket.data.avatar = avatar || socket.data.avatar || null;
    if(isBot){
      console.log("Creating AI room for", socket.id);
      createAIRoom(socket, 'medium');
    } else {
      console.log("PvP mode - cardGameWaiting:", cardGameWaiting);
      if(!cardGameWaiting){ 
        cardGameWaiting = socket.id; 
        console.log("Setting player as waiting:", socket.id);
        socket.emit('cardgame/waiting'); 
      }
      else if(cardGameWaiting !== socket.id){ 
        const other = io.sockets.sockets.get(cardGameWaiting); 
        console.log("Matching with waiting player:", cardGameWaiting);
        cardGameWaiting = null; 
        createCardGameRoom(other, socket); 
      }
    }
  });
  socket.on('cardgame/submitDeck', (cards) => { 
    const roomId=[...socket.rooms].find(r=>r.startsWith('cardgame-')||r.startsWith('airoom-')); 
    if(!roomId) return; 
    const room=cardGameRooms.get(roomId); 
    if(!room) return; 
    const err=validateDeck(cards); 
    if(err){ socket.emit('cardgame/deckError', err); return; } 
    const P=room.players[socket.id]; 
    if(!P) return; 
    
    // Reset player state
    P.deck=makeDeckFromList(cards); 
    P.hand=[]; 
    P.discard=[]; 
    P.hp=rules.HP_START; 
    P.shield=0; 
    P.specialUsed=false; 
    
    for(let i=0;i<rules.HAND_SIZE;i++) drawCards(P,1); 
    socket.emit('cardgame/deckOk'); 
    io.to(socket.id).emit('cardgame/state', privateCardGameState(room, socket.id)); 
    
    if(room.isAIGame){ 
      // Reset room state for AI game
      room.turn=0; 
      room.phase='deckbuild'; 
      room.submissions={}; 
      room.lastPlayed={}; 
      const aiBot=room.aiBot; 
      if(aiBot){ 
        aiBot.reset(); 
        aiBot.generateDeck(); 
        const aiPlayer=room.players[aiBot.id]; 
        if(aiPlayer){ 
          aiPlayer.deck=[...aiBot.deck]; 
          aiPlayer.hand=[...aiBot.hand]; 
          aiPlayer.discard=[...aiBot.discard]; 
          aiPlayer.hp=aiBot.hp; 
          aiPlayer.shield=aiBot.shield; 
          aiPlayer.specialUsed=aiBot.specialUsed; 
        } 
        startCardGameTurn(room); 
        return; 
      } 
    } 
    
    // Check if all players are ready
    const ready=Object.values(room.players).every(p=>p.deck.length>0 && p.hand.length===rules.HAND_SIZE); 
    if(ready) {
      // Reset room state for PvP game when both players are ready
      room.turn=0; 
      room.phase='deckbuild'; 
      room.submissions={}; 
      room.lastPlayed={};
      
      // Reset all players' HP, shield, specialUsed
      Object.values(room.players).forEach(player => {
        player.hp = rules.HP_START;
        player.shield = 0;
        player.specialUsed = false;
      });
      
      startCardGameTurn(room); 
    }
  });
  socket.on('cardgame/play', ({cardIndex, useSpecial}) => { const roomId=[...socket.rooms].find(r=>r.startsWith('cardgame-')||r.startsWith('airoom-')); if(!roomId) return; const room=cardGameRooms.get(roomId); if(!room||room.phase!=='play') return; const P=room.players[socket.id]; if(!P) return; if(room.submissions[socket.id]) return; if(cardIndex!=null && (cardIndex<0 || cardIndex>=P.hand.length)){ socket.emit('cardgame/error','Invalid card index.'); return; } room.submissions[socket.id]={ card:cardIndex, useSpecial:!!useSpecial }; io.to(room.id).emit('cardgame/submitted', { player: socket.id }); if(Object.keys(room.submissions).length===Object.keys(room.players).length) resolveCardGameTurn(room); });

  // Create normal room
  socket.on('createRoom', async (roomData) => {
    try {
      if (!roomData || !roomData.id) return;
      // Ensure host avatar
      if (roomData.players && roomData.players.length > 0) {
        const hostPlayer = roomData.players[0];
        if (!hostPlayer.avatar) {
          hostPlayer.avatar = await getUserAvatar(hostPlayer.id);
        }
        playerSockets.set(hostPlayer.id, socket.id);
      }
      gameRooms.set(roomData.id, roomData);
      playerRooms.set(socket.id, roomData.id);
      socket.join(roomData.id);
      io.emit('roomCreated', roomData);
      socket.emit('roomJoined', roomData);
      // Gửi avatarUpdated riêng để client chắc chắn cập nhật avatar ngay cả khi UI không đọc roomCreated
      roomData.players.forEach(p=>{
        io.to(roomData.id).emit('avatarUpdated', { roomId: roomData.id, playerId: p.id, avatar: p.avatar });
      });
      broadcastRoomList();
      console.log(`Room ${roomData.id} created by ${roomData.host}`);
    } catch (err) {
      console.error('Error creating room:', err);
      socket.emit('error', { message: 'Không thể tạo phòng' });
    }
  });

  // Create AI room (simplified lobby only)
  socket.on('createAIRoom', async (roomData) => {
    try {
      if (!roomData || !roomData.id) return;
      const aiDifficulty = roomData.aiDifficulty || 'medium';
      const hostPlayer = roomData.players?.[0];
      if (hostPlayer) {
        if (!hostPlayer.avatar) {
          hostPlayer.avatar = await getUserAvatar(hostPlayer.id);
        }
        playerSockets.set(hostPlayer.id, socket.id);
      }
      const lobbyRoom = {
        ...roomData,
        players: [
          hostPlayer,
          { id: 'ai-bot', name: `AI Bot (${aiDifficulty})`, ready: true, avatar: '/assets/marisa.png' }
        ],
        maxPlayers: 2,
        isAIRoom: true,
        aiDifficulty
      };
      gameRooms.set(roomData.id, lobbyRoom);
      playerRooms.set(socket.id, roomData.id);
      socket.join(roomData.id);
      io.emit('roomCreated', lobbyRoom);
      socket.emit('roomJoined', lobbyRoom);
      lobbyRoom.players.forEach(p=>{
        io.to(lobbyRoom.id).emit('avatarUpdated', { roomId: lobbyRoom.id, playerId: p.id, avatar: p.avatar });
      });
      broadcastRoomList();
      console.log(`AI Room ${roomData.id} created by ${roomData.host}`);
    } catch (err) {
      console.error('Error creating AI room:', err);
      socket.emit('error', { message: 'Không thể tạo phòng AI' });
    }
  });

  // Get room list on demand
  socket.on('getRoomList', () => {
    socket.emit('roomList', Array.from(gameRooms.values()));
  });

  // Join room
  socket.on('joinRoom', async ({ roomId, player, password }) => {
    try {
      const room = gameRooms.get(roomId);
      if (!room) return socket.emit('error', { message: 'Phòng không tồn tại' });
      if (room.status === 'Khóa' && room.password && room.password !== password) {
        return socket.emit('error', { message: 'Mật khẩu không đúng' });
      }
      if (room.players.length >= room.maxPlayers) {
        return socket.emit('error', { message: 'Phòng đã đầy' });
      }
      if (room.players.find(p => p.id === player.id)) {
        return socket.emit('error', { message: 'Bạn đã ở trong phòng' });
      }
      if (!player.avatar) {
        player.avatar = await getUserAvatar(player.id);
      }
      room.players.push(player);
      playerRooms.set(socket.id, roomId);
      playerSockets.set(player.id, socket.id);
      socket.join(roomId);
      gameRooms.set(roomId, room);
      io.to(roomId).emit('playerJoined', { roomId, player, players: room.players });
      socket.emit('roomJoined', room);
      broadcastRoomList();
      console.log(`Player ${player.name} joined ${roomId}`);
    } catch (err) {
      console.error('Error joining room:', err);
      socket.emit('error', { message: 'Không thể vào phòng' });
    }
  });

  // Leave room
  socket.on('leaveRoom', ({ roomId, playerId }) => {
    try {
      const room = gameRooms.get(roomId);
      if (!room) return;
      room.players = room.players.filter(p => p.id !== playerId);
      playerRooms.delete(socket.id);
      playerSockets.delete(playerId);
      socket.leave(roomId);
      if (room.players.length === 0) {
        gameRooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      } else {
        gameRooms.set(roomId, room);
        io.to(roomId).emit('playerLeft', { roomId, playerId, players: room.players });
      }
      broadcastRoomList();
    } catch (err) {
      console.error('Error leaving room:', err);
    }
  });

  // Player ready toggle
  socket.on('playerReady', ({ roomId, playerId, ready }) => {
    try {
      const room = gameRooms.get(roomId);
      if (!room) return;
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.ready = ready;
        gameRooms.set(roomId, room);
        io.to(roomId).emit('playerReady', { roomId, playerId, ready });
        // Auto-start normal game when all ready (2 players) or AI room when human ready
        const allReady = room.players.length === room.maxPlayers && room.players.every(p => p.ready);
        const isAIRoom = room.isAIRoom;
        if ((allReady && !isAIRoom) || (isAIRoom && ready && playerId !== 'ai-bot')) {
          io.to(roomId).emit('gameStart', { roomId, players: room.players, isAIGame: !!isAIRoom });
          // Remove room after start
          gameRooms.delete(roomId);
          broadcastRoomList();
        }
      }
    } catch (err) {
      console.error('Error updating ready:', err);
    }
  });

  // Avatar update broadcast
  socket.on('avatarUpdate', async ({ roomId, playerId, avatar }) => {
    try {
      const room = gameRooms.get(roomId);
      if (!room) return;
      const player = room.players.find(p => p.id === playerId);
      if (player) {
        player.avatar = avatar;
        gameRooms.set(roomId, room);
        io.to(roomId).emit('avatarUpdated', { roomId, playerId, avatar });
      }
    } catch (err) {
      console.error('Error updating avatar:', err);
    }
  });

  // Manual start (fallback)
  socket.on('startGame', ({ roomId }) => {
    const room = gameRooms.get(roomId);
    if (!room) return;
    io.to(roomId).emit('gameStart', { roomId, players: room.players, isAIGame: !!room.isAIRoom });
    gameRooms.delete(roomId);
    broadcastRoomList();
  });

  // Disconnect cleanup (lobby + card game)
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if(cardGameWaiting===socket.id) cardGameWaiting=null;
    const cgRoomId=[...socket.rooms].find(r=>r&& (r.startsWith('cardgame-')||r.startsWith('airoom-')));
    if(cgRoomId){ const room=cardGameRooms.get(cgRoomId); if(room){ io.to(cgRoomId).emit('cardgame/end',{ reason:'opponent_left' }); cardGameRooms.delete(cgRoomId); } }
    const roomId = playerRooms.get(socket.id);
    if (roomId) {
      const room = gameRooms.get(roomId);
      if (room) {
        room.players = room.players.filter(p => playerSockets.get(p.id) !== socket.id);
        if (room.players.length === 0) {
          gameRooms.delete(roomId);
        } else {
          gameRooms.set(roomId, room);
          io.to(roomId).emit('playerLeft', { roomId, playerId: 'unknown', players: room.players });
        }
      }
      broadcastRoomList();
    }
  });
});

// Fallback to index.html for client-side routing (exclude API routes)
app.get('*', (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith('/api/')) {
    return next();
  }
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
