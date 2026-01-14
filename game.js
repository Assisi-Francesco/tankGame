// Supabase 설정
const SUPABASE_URL = 'https://uivfdqijoohhaosznmcc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_FlGF4nOk7kS0f1XNnhleWw_LJVYhSoU';
let supabaseClient = null;

// 게임 상태
let gameState = {
  currentScreen: 'lobby',
  playerId: null,
  playerName: '',
  roomId: null,
  isHost: false,
  playerNumber: null,
  gameData: null,
  channel: null
};

// Canvas 및 게임 변수
let canvas, ctx;
let gameLoop = null;

// 게임 설정
const GAME_CONFIG = {
  gravity: 0.3,
  maxPower: 15,
  groundHeight: 100,
  tankWidth: 60,
  tankHeight: 40,
  cannonLength: 30,
  projectileRadius: 5,
  explosionRadius: 40,
  maxHealth: 100,
  damageAmount: 25
};

// 게임 오브젝트
let terrain = [];
let tanks = [];
let projectile = null;
let explosions = [];
let wind = 0;
let currentTurn = 1;
let isMyTurn = false;
let gameOver = false;
let isFiring = false; // 발사 중 상태 (중복 발사 방지)

// DOM 요소
const elements = {};

// 초기화
document.addEventListener('DOMContentLoaded', () => {
  // Supabase 클라이언트 초기화
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  initElements();
  initEventListeners();
  generatePlayerId();
  loadRooms();
});

function initElements() {
  // 화면
  elements.lobby = document.getElementById('lobby');
  elements.waitingRoom = document.getElementById('waitingRoom');
  elements.gameScreen = document.getElementById('gameScreen');
  elements.resultScreen = document.getElementById('resultScreen');

  // 로비
  elements.playerName = document.getElementById('playerName');
  elements.createRoomBtn = document.getElementById('createRoomBtn');
  elements.joinRoomBtn = document.getElementById('joinRoomBtn');
  elements.rooms = document.getElementById('rooms');

  // 대기실
  elements.roomCode = document.getElementById('roomCode');
  elements.player1Slot = document.getElementById('player1Slot');
  elements.player2Slot = document.getElementById('player2Slot');
  elements.startGameBtn = document.getElementById('startGameBtn');
  elements.leaveRoomBtn = document.getElementById('leaveRoomBtn');

  // 게임
  elements.canvas = document.getElementById('gameCanvas');
  elements.player1Health = document.getElementById('player1Health');
  elements.player2Health = document.getElementById('player2Health');
  elements.player1NameDisplay = document.getElementById('player1Name');
  elements.player2NameDisplay = document.getElementById('player2Name');
  elements.turnIndicator = document.getElementById('turnIndicator');
  elements.windIndicator = document.getElementById('windIndicator');
  elements.angleSlider = document.getElementById('angleSlider');
  elements.angleValue = document.getElementById('angleValue');
  elements.powerSlider = document.getElementById('powerSlider');
  elements.powerValue = document.getElementById('powerValue');
  elements.fireBtn = document.getElementById('fireBtn');

  // 결과
  elements.resultTitle = document.getElementById('resultTitle');
  elements.resultMessage = document.getElementById('resultMessage');
  elements.returnLobbyBtn = document.getElementById('returnLobbyBtn');

  // Canvas 설정
  canvas = elements.canvas;
  ctx = canvas.getContext('2d');
}

function initEventListeners() {
  elements.createRoomBtn.addEventListener('click', createRoom);
  elements.joinRoomBtn.addEventListener('click', () => {
    const roomCode = prompt('방 코드를 입력하세요:');
    if (roomCode) joinRoom(roomCode);
  });
  elements.startGameBtn.addEventListener('click', startGame);
  elements.leaveRoomBtn.addEventListener('click', leaveRoom);
  elements.fireBtn.addEventListener('click', fire);
  elements.returnLobbyBtn.addEventListener('click', returnToLobby);

  elements.angleSlider.addEventListener('input', (e) => {
    elements.angleValue.textContent = e.target.value;
  });

  elements.powerSlider.addEventListener('input', (e) => {
    elements.powerValue.textContent = e.target.value;
  });

  // 키보드 컨트롤
  document.addEventListener('keydown', (e) => {
    if (gameState.currentScreen !== 'game' || !isMyTurn) return;

    switch (e.key) {
      case 'ArrowUp':
        elements.angleSlider.value = Math.min(90, parseInt(elements.angleSlider.value) + 1);
        elements.angleValue.textContent = elements.angleSlider.value;
        break;
      case 'ArrowDown':
        elements.angleSlider.value = Math.max(0, parseInt(elements.angleSlider.value) - 1);
        elements.angleValue.textContent = elements.angleSlider.value;
        break;
      case 'ArrowRight':
        elements.powerSlider.value = Math.min(100, parseInt(elements.powerSlider.value) + 1);
        elements.powerValue.textContent = elements.powerSlider.value;
        break;
      case 'ArrowLeft':
        elements.powerSlider.value = Math.max(10, parseInt(elements.powerSlider.value) - 1);
        elements.powerValue.textContent = elements.powerSlider.value;
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        fire();
        break;
    }
  });

  window.addEventListener('resize', resizeCanvas);
}

function generatePlayerId() {
  gameState.playerId = 'player_' + Math.random().toString(36).substr(2, 9);
}

// 화면 전환
function showScreen(screenName) {
  ['lobby', 'waitingRoom', 'gameScreen', 'resultScreen'].forEach(name => {
    elements[name === 'gameScreen' ? 'gameScreen' : name].classList.add('hidden');
  });

  const screenElement = screenName === 'game' ? elements.gameScreen :
    screenName === 'waiting' ? elements.waitingRoom :
      screenName === 'result' ? elements.resultScreen : elements.lobby;

  screenElement.classList.remove('hidden');
  gameState.currentScreen = screenName;

  if (screenName === 'game') {
    resizeCanvas();
    initGame();
  }
}

// 방 목록 로드
async function loadRooms() {
  const { data, error } = await supabaseClient
    .from('tank_rooms')
    .select('*')
    .eq('status', 'waiting')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('방 목록 로드 실패:', error);
    return;
  }

  renderRooms(data || []);

  // 실시간 구독
  supabaseClient
    .channel('rooms')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tank_rooms' }, () => {
      loadRooms();
    })
    .subscribe();
}

function renderRooms(rooms) {
  if (rooms.length === 0) {
    elements.rooms.innerHTML = '<p style="color: var(--color-text-muted); text-align: center;">대기 중인 방이 없습니다</p>';
    return;
  }

  elements.rooms.innerHTML = rooms.map(room => `
    <div class="room-item" onclick="joinRoom('${room.room_code}')">
      <span class="room-name">${room.host_name}의 방</span>
      <span class="room-status">1/2</span>
    </div>
  `).join('');
}

// 방 만들기
async function createRoom() {
  const playerName = elements.playerName.value.trim();
  if (!playerName) {
    alert('닉네임을 입력해주세요!');
    return;
  }

  gameState.playerName = playerName;
  const roomCode = Math.random().toString(36).substr(2, 6).toUpperCase();

  const { data, error } = await supabaseClient
    .from('tank_rooms')
    .insert({
      room_code: roomCode,
      host_id: gameState.playerId,
      host_name: playerName,
      status: 'waiting'
    })
    .select()
    .single();

  if (error) {
    console.error('방 생성 실패:', error);
    alert('방 생성에 실패했습니다. 다시 시도해주세요.');
    return;
  }

  gameState.roomId = data.id;
  gameState.isHost = true;
  gameState.playerNumber = 1;

  subscribeToRoom(roomCode);
  showWaitingRoom(roomCode, playerName, null);
}

// 방 참가
async function joinRoom(roomCode) {
  const playerName = elements.playerName.value.trim();
  if (!playerName) {
    alert('닉네임을 입력해주세요!');
    return;
  }

  gameState.playerName = playerName;

  const { data: room, error } = await supabaseClient
    .from('tank_rooms')
    .select('*')
    .eq('room_code', roomCode)
    .eq('status', 'waiting')
    .single();

  if (error || !room) {
    alert('방을 찾을 수 없습니다.');
    return;
  }

  const { error: updateError } = await supabaseClient
    .from('tank_rooms')
    .update({
      guest_id: gameState.playerId,
      guest_name: playerName,
      status: 'ready'
    })
    .eq('id', room.id);

  if (updateError) {
    console.error('방 참가 실패:', updateError);
    alert('방 참가에 실패했습니다.');
    return;
  }

  gameState.roomId = room.id;
  gameState.isHost = false;
  gameState.playerNumber = 2;

  subscribeToRoom(roomCode);
  showWaitingRoom(roomCode, room.host_name, playerName);
}

// 실시간 채널 구독
function subscribeToRoom(roomCode) {
  if (gameState.channel) {
    gameState.channel.unsubscribe();
  }

  gameState.channel = supabaseClient.channel(`room:${roomCode}`)
    .on('broadcast', { event: 'game_update' }, (payload) => {
      handleGameUpdate(payload.payload);
    })
    .on('broadcast', { event: 'game_start' }, (payload) => {
      handleGameStart(payload.payload);
    })
    .on('broadcast', { event: 'player_left' }, () => {
      handlePlayerLeft();
    })
    .subscribe();
}

// 대기실 표시
function showWaitingRoom(roomCode, player1Name, player2Name) {
  elements.roomCode.textContent = roomCode;

  elements.player1Slot.querySelector('.player-name').textContent = player1Name || '대기 중...';
  elements.player2Slot.querySelector('.player-name').textContent = player2Name || '대기 중...';

  if (player1Name) elements.player1Slot.classList.add('ready');
  if (player2Name) elements.player2Slot.classList.add('ready');

  elements.startGameBtn.classList.toggle('hidden', !gameState.isHost || !player2Name);

  showScreen('waiting');

  // 방 상태 실시간 감시
  supabaseClient
    .channel(`room_status:${roomCode}`)
    .on('postgres_changes', {
      event: 'UPDATE',
      schema: 'public',
      table: 'tank_rooms',
      filter: `room_code=eq.${roomCode}`
    }, (payload) => {
      const room = payload.new;
      elements.player2Slot.querySelector('.player-name').textContent = room.guest_name || '대기 중...';
      if (room.guest_name) {
        elements.player2Slot.classList.add('ready');
        if (gameState.isHost) {
          elements.startGameBtn.classList.remove('hidden');
        }
      }
    })
    .subscribe();
}

// 방 나가기
async function leaveRoom() {
  if (gameState.isHost) {
    await supabaseClient
      .from('tank_rooms')
      .delete()
      .eq('id', gameState.roomId);
  } else {
    await supabaseClient
      .from('tank_rooms')
      .update({ guest_id: null, guest_name: null, status: 'waiting' })
      .eq('id', gameState.roomId);
  }

  if (gameState.channel) {
    gameState.channel.send({
      type: 'broadcast',
      event: 'player_left',
      payload: {}
    });
    gameState.channel.unsubscribe();
  }

  resetGameState();
  showScreen('lobby');
}

async function handlePlayerLeft() {
  // 게임 중에 상대방이 나간 경우 - 나의 승리로 처리
  if (gameState.currentScreen === 'game' && !gameOver) {
    gameOver = true;

    // 승리 기록 저장 (내가 승자)
    await saveGameRecord(
      gameState.playerId,
      gameState.playerName,
      gameState.isHost ? 'guest' : 'host', // 상대방 ID (대략적)
      gameState.isHost ? '상대방' : '상대방',
      'disconnect'
    );

    alert('상대방이 나갔습니다. 승리!');
    elements.resultTitle.textContent = '승리!';
    elements.resultMessage.textContent = '상대방이 게임을 떠났습니다.';
    showScreen('result');
  } else {
    alert('상대방이 나갔습니다.');
    leaveRoom();
  }
}

// 게임 시작
async function startGame() {
  const initialGameData = {
    turn: 1,
    wind: Math.floor(Math.random() * 11) - 5,
    player1Health: GAME_CONFIG.maxHealth,
    player2Health: GAME_CONFIG.maxHealth,
    terrain: generateTerrainData()
  };

  await supabaseClient
    .from('tank_rooms')
    .update({ status: 'playing', game_data: initialGameData })
    .eq('id', gameState.roomId);

  gameState.channel.send({
    type: 'broadcast',
    event: 'game_start',
    payload: initialGameData
  });

  gameState.gameData = initialGameData;
  showScreen('game');
}

function handleGameStart(data) {
  gameState.gameData = data;
  showScreen('game');
}

// 지형 데이터 생성
function generateTerrainData() {
  const points = [];
  const segments = 50;

  for (let i = 0; i <= segments; i++) {
    const x = i / segments;
    const baseHeight = 0.3;
    const variation = Math.sin(x * Math.PI * 2) * 0.1 +
      Math.sin(x * Math.PI * 4) * 0.05 +
      Math.random() * 0.05;
    points.push(baseHeight + variation);
  }

  return points;
}

// Canvas 크기 조정
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth || window.innerWidth;
  canvas.height = window.innerHeight - 200;

  if (gameState.currentScreen === 'game') {
    render();
  }
}

// 게임 초기화
function initGame() {
  const data = gameState.gameData;
  if (!data) return;

  // 지형 생성
  terrain = data.terrain.map((height, i) => ({
    x: (i / (data.terrain.length - 1)) * canvas.width,
    y: canvas.height - height * canvas.height
  }));

  // 바람 설정
  wind = data.wind;
  updateWindDisplay();

  // 탱크 생성
  const tank1X = canvas.width * 0.15;
  const tank2X = canvas.width * 0.85;

  tanks = [
    {
      x: tank1X,
      y: getTerrainHeight(tank1X) - GAME_CONFIG.tankHeight / 2,
      angle: 45,
      health: data.player1Health,
      color: '#3b82f6',
      direction: 1
    },
    {
      x: tank2X,
      y: getTerrainHeight(tank2X) - GAME_CONFIG.tankHeight / 2,
      angle: 45,
      health: data.player2Health,
      color: '#ef4444',
      direction: -1
    }
  ];

  // 턴 설정
  currentTurn = data.turn;
  isMyTurn = (currentTurn === 1 && gameState.playerNumber === 1) ||
    (currentTurn === 2 && gameState.playerNumber === 2);

  updateTurnDisplay();
  updateHealthDisplay();

  // 컨트롤 활성화/비활성화
  elements.fireBtn.disabled = !isMyTurn;
  elements.angleSlider.disabled = !isMyTurn;
  elements.powerSlider.disabled = !isMyTurn;

  projectile = null;
  explosions = [];
  gameOver = false;
  isFiring = false;

  // 게임 루프 시작
  if (gameLoop) cancelAnimationFrame(gameLoop);
  gameLoop = requestAnimationFrame(update);
}

function getTerrainHeight(x) {
  if (terrain.length < 2) return canvas.height - GAME_CONFIG.groundHeight;

  for (let i = 0; i < terrain.length - 1; i++) {
    if (x >= terrain[i].x && x <= terrain[i + 1].x) {
      const t = (x - terrain[i].x) / (terrain[i + 1].x - terrain[i].x);
      return terrain[i].y + (terrain[i + 1].y - terrain[i].y) * t;
    }
  }

  return terrain[terrain.length - 1].y;
}

// 발사
function fire() {
  // 중복 발사 방지: 내 턴이 아니거나, 이미 발사 중이거나, 투사체가 있거나, 게임 오버면 리턴
  if (!isMyTurn || isFiring || projectile || gameOver) return;

  // 발사 시작 - 즉시 턴 잠금
  isFiring = true;
  isMyTurn = false;
  elements.fireBtn.disabled = true;
  elements.angleSlider.disabled = true;
  elements.powerSlider.disabled = true;

  const angle = parseInt(elements.angleSlider.value);
  const power = parseInt(elements.powerSlider.value) / 100 * GAME_CONFIG.maxPower;
  const tank = tanks[gameState.playerNumber - 1];

  const radians = (tank.direction === 1 ? angle : 180 - angle) * Math.PI / 180;

  projectile = {
    x: tank.x + Math.cos(radians) * GAME_CONFIG.cannonLength,
    y: tank.y - Math.sin(radians) * GAME_CONFIG.cannonLength,
    vx: Math.cos(radians) * power,
    vy: -Math.sin(radians) * power
  };

  // 상대방에게 발사 정보 + 턴 변경 전송
  const nextTurn = gameState.playerNumber === 1 ? 2 : 1;
  const newWind = Math.floor(Math.random() * 11) - 5;

  gameState.channel.send({
    type: 'broadcast',
    event: 'game_update',
    payload: {
      type: 'fire',
      angle,
      power: parseInt(elements.powerSlider.value),
      playerNumber: gameState.playerNumber,
      nextTurn: nextTurn,
      newWind: newWind
    }
  });
}

// 게임 업데이트 핸들러
function handleGameUpdate(data) {
  switch (data.type) {
    case 'fire':
      if (data.playerNumber !== gameState.playerNumber) {
        // 상대방의 발사 재현
        const tank = tanks[data.playerNumber - 1];
        const power = data.power / 100 * GAME_CONFIG.maxPower;
        const radians = (tank.direction === 1 ? data.angle : 180 - data.angle) * Math.PI / 180;

        projectile = {
          x: tank.x + Math.cos(radians) * GAME_CONFIG.cannonLength,
          y: tank.y - Math.sin(radians) * GAME_CONFIG.cannonLength,
          vx: Math.cos(radians) * power,
          vy: -Math.sin(radians) * power
        };

        // 상대방이 발사 완료 - 내 턴으로 전환
        currentTurn = data.nextTurn;
        wind = data.newWind;
        isMyTurn = (currentTurn === gameState.playerNumber);
        isFiring = false;

        updateWindDisplay();
        updateTurnDisplay();
        // 투사체가 날아가는 중에는 컨트롤 비활성화, 충돌 후 활성화
      }
      break;

    case 'turn_change':
      // 이제 fire 이벤트에서 턴 변경을 처리하므로 이 케이스는 거의 사용되지 않음
      currentTurn = data.turn;
      isMyTurn = (currentTurn === 1 && gameState.playerNumber === 1) ||
        (currentTurn === 2 && gameState.playerNumber === 2);
      isFiring = false;
      updateTurnDisplay();
      elements.fireBtn.disabled = !isMyTurn;
      elements.angleSlider.disabled = !isMyTurn;
      elements.powerSlider.disabled = !isMyTurn;
      break;

    case 'damage':
      tanks[data.targetPlayer - 1].health = data.health;
      updateHealthDisplay();

      if (data.health <= 0) {
        endGame(data.targetPlayer === 1 ? 2 : 1);
      }
      break;

    case 'game_over':
      endGame(data.winner);
      break;
  }
}

// 게임 루프
function update() {
  if (gameOver) return;

  // 투사체 업데이트
  if (projectile) {
    projectile.x += projectile.vx;
    projectile.y += projectile.vy;
    projectile.vy += GAME_CONFIG.gravity;
    projectile.vx += wind * 0.01;

    // 충돌 체크
    checkCollision();
  }

  // 폭발 업데이트
  explosions = explosions.filter(exp => {
    exp.radius += 5;
    exp.alpha -= 0.05;
    return exp.alpha > 0;
  });

  render();
  gameLoop = requestAnimationFrame(update);
}

function checkCollision() {
  if (!projectile) return;

  // 화면 밖으로 나감
  if (projectile.x < 0 || projectile.x > canvas.width || projectile.y > canvas.height) {
    projectile = null;
    changeTurn();
    return;
  }

  // 지형 충돌
  const terrainY = getTerrainHeight(projectile.x);
  if (projectile.y >= terrainY) {
    createExplosion(projectile.x, terrainY);
    checkTankDamage(projectile.x, terrainY);
    projectile = null;
    return;
  }

  // 탱크 직접 충돌
  tanks.forEach((tank, index) => {
    const dx = projectile.x - tank.x;
    const dy = projectile.y - tank.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < GAME_CONFIG.tankWidth / 2) {
      createExplosion(projectile.x, projectile.y);
      applyDamage(index + 1, GAME_CONFIG.damageAmount * 1.5);
      projectile = null;
    }
  });
}

function createExplosion(x, y) {
  explosions.push({
    x,
    y,
    radius: 10,
    alpha: 1
  });
}

function checkTankDamage(x, y) {
  tanks.forEach((tank, index) => {
    const dx = x - tank.x;
    const dy = y - tank.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < GAME_CONFIG.explosionRadius) {
      const damage = Math.floor(GAME_CONFIG.damageAmount * (1 - distance / GAME_CONFIG.explosionRadius));
      applyDamage(index + 1, damage);
    }
  });

  changeTurn();
}

function applyDamage(targetPlayer, damage) {
  const tank = tanks[targetPlayer - 1];
  tank.health = Math.max(0, tank.health - damage);
  updateHealthDisplay();

  // 데미지 동기화
  gameState.channel.send({
    type: 'broadcast',
    event: 'game_update',
    payload: {
      type: 'damage',
      targetPlayer,
      health: tank.health
    }
  });

  if (tank.health <= 0) {
    endGame(targetPlayer === 1 ? 2 : 1);
  }
}

function changeTurn() {
  // 투사체 충돌 후 호출됨 - 컨트롤만 활성화
  // 턴 변경은 fire() 함수에서 이미 처리됨
  isFiring = false;

  // 내 턴이면 컨트롤 활성화
  if (isMyTurn) {
    elements.fireBtn.disabled = false;
    elements.angleSlider.disabled = false;
    elements.powerSlider.disabled = false;
  }
}

function updateTurnDisplay() {
  elements.turnIndicator.textContent = isMyTurn ? '내 턴' : '상대 턴';
  elements.turnIndicator.classList.toggle('enemy-turn', !isMyTurn);
}

function updateWindDisplay() {
  const arrow = wind > 0 ? '→' : wind < 0 ? '←' : '';
  elements.windIndicator.textContent = `바람: ${arrow}${Math.abs(wind)}`;
}

function updateHealthDisplay() {
  const health1 = tanks[0]?.health || 100;
  const health2 = tanks[1]?.health || 100;

  elements.player1Health.style.width = `${health1}%`;
  elements.player2Health.style.width = `${health2}%`;

  if (health1 < 30) elements.player1Health.classList.add('low');
  if (health2 < 30) elements.player2Health.classList.add('low');

  elements.player1NameDisplay.textContent = gameState.isHost ? gameState.playerName : '상대방';
  elements.player2NameDisplay.textContent = gameState.isHost ? '상대방' : gameState.playerName;
}

async function endGame(winner) {
  if (gameOver) return; // 중복 호출 방지
  gameOver = true;
  cancelAnimationFrame(gameLoop);

  const isWinner = (winner === 1 && gameState.playerNumber === 1) ||
    (winner === 2 && gameState.playerNumber === 2);

  // 호스트만 전적 기록 저장 (중복 방지)
  if (gameState.isHost) {
    const winnerName = winner === 1 ? gameState.playerName : '상대방';
    const loserName = winner === 1 ? '상대방' : gameState.playerName;
    const winnerId = winner === 1 ? gameState.playerId : 'opponent';
    const loserId = winner === 1 ? 'opponent' : gameState.playerId;

    await saveGameRecord(winnerId, winnerName, loserId, loserName, 'battle');
  }

  elements.resultTitle.textContent = isWinner ? '승리!' : '패배...';
  elements.resultMessage.textContent = isWinner ?
    '축하합니다! 상대를 물리쳤습니다!' :
    '아쉽네요. 다음엔 꼭 이기세요!';

  setTimeout(() => {
    showScreen('result');
  }, 1500);
}

// 전적 기록 저장
async function saveGameRecord(winnerId, winnerName, loserId, loserName, winReason) {
  try {
    const { error } = await supabaseClient
      .from('game_records')
      .insert({
        winner_id: winnerId,
        winner_name: winnerName,
        loser_id: loserId,
        loser_name: loserName,
        win_reason: winReason
      });

    if (error) {
      console.error('전적 저장 실패:', error);
    } else {
      console.log('전적 저장 완료');
    }
  } catch (err) {
    console.error('전적 저장 오류:', err);
  }
}

function returnToLobby() {
  resetGameState();
  showScreen('lobby');
  loadRooms();
}

function resetGameState() {
  if (gameState.channel) {
    gameState.channel.unsubscribe();
  }

  gameState.roomId = null;
  gameState.isHost = false;
  gameState.playerNumber = null;
  gameState.gameData = null;
  gameState.channel = null;

  if (gameLoop) {
    cancelAnimationFrame(gameLoop);
    gameLoop = null;
  }
}

// 렌더링
function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 배경
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#1a1a2e');
  gradient.addColorStop(1, '#16213e');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // 지형 그리기
  drawTerrain();

  // 탱크 그리기
  tanks.forEach((tank, index) => {
    drawTank(tank, index);
  });

  // 투사체 그리기
  if (projectile) {
    drawProjectile();
  }

  // 폭발 그리기
  explosions.forEach(drawExplosion);

  // 조준선 그리기 (내 턴일 때만)
  if (isMyTurn && !projectile) {
    drawAimLine();
  }
}

function drawTerrain() {
  if (terrain.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(0, canvas.height);
  ctx.lineTo(terrain[0].x, terrain[0].y);

  for (let i = 1; i < terrain.length; i++) {
    ctx.lineTo(terrain[i].x, terrain[i].y);
  }

  ctx.lineTo(canvas.width, canvas.height);
  ctx.closePath();

  const gradient = ctx.createLinearGradient(0, canvas.height - 200, 0, canvas.height);
  gradient.addColorStop(0, '#2d5a27');
  gradient.addColorStop(0.5, '#1e3d1a');
  gradient.addColorStop(1, '#0f1f0d');
  ctx.fillStyle = gradient;
  ctx.fill();

  // 지형 윤곽선
  ctx.strokeStyle = '#3d7a35';
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawTank(tank, index) {
  ctx.save();
  ctx.translate(tank.x, tank.y);

  // 탱크 본체
  ctx.fillStyle = tank.color;
  ctx.beginPath();
  ctx.roundRect(
    -GAME_CONFIG.tankWidth / 2,
    -GAME_CONFIG.tankHeight / 2,
    GAME_CONFIG.tankWidth,
    GAME_CONFIG.tankHeight,
    8
  );
  ctx.fill();

  // 탱크 상단 (터렛)
  ctx.fillStyle = tank.color;
  ctx.beginPath();
  ctx.arc(0, -GAME_CONFIG.tankHeight / 4, 15, 0, Math.PI * 2);
  ctx.fill();

  // 포신
  const currentAngle = index === gameState.playerNumber - 1 ?
    parseInt(elements.angleSlider.value) : 45;
  const radians = (tank.direction === 1 ? currentAngle : 180 - currentAngle) * Math.PI / 180;

  ctx.strokeStyle = '#333';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, -GAME_CONFIG.tankHeight / 4);
  ctx.lineTo(
    Math.cos(radians) * GAME_CONFIG.cannonLength,
    -GAME_CONFIG.tankHeight / 4 - Math.sin(radians) * GAME_CONFIG.cannonLength
  );
  ctx.stroke();

  // 바퀴
  ctx.fillStyle = '#222';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.arc(i * 20, GAME_CONFIG.tankHeight / 2 - 5, 8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawProjectile() {
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(projectile.x, projectile.y, GAME_CONFIG.projectileRadius, 0, Math.PI * 2);
  ctx.fill();

  // 발광 효과
  ctx.shadowColor = '#fbbf24';
  ctx.shadowBlur = 15;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawExplosion(exp) {
  ctx.save();
  ctx.globalAlpha = exp.alpha;

  const gradient = ctx.createRadialGradient(exp.x, exp.y, 0, exp.x, exp.y, exp.radius);
  gradient.addColorStop(0, '#fff');
  gradient.addColorStop(0.3, '#fbbf24');
  gradient.addColorStop(0.6, '#ef4444');
  gradient.addColorStop(1, 'transparent');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(exp.x, exp.y, exp.radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawAimLine() {
  const tank = tanks[gameState.playerNumber - 1];
  if (!tank) return;

  const angle = parseInt(elements.angleSlider.value);
  const power = parseInt(elements.powerSlider.value) / 100 * GAME_CONFIG.maxPower;
  const radians = (tank.direction === 1 ? angle : 180 - angle) * Math.PI / 180;

  ctx.save();
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.lineWidth = 2;

  ctx.beginPath();
  let x = tank.x + Math.cos(radians) * GAME_CONFIG.cannonLength;
  let y = tank.y - GAME_CONFIG.tankHeight / 4 - Math.sin(radians) * GAME_CONFIG.cannonLength;
  let vx = Math.cos(radians) * power * 0.3;
  let vy = -Math.sin(radians) * power * 0.3;

  ctx.moveTo(x, y);

  for (let i = 0; i < 30; i++) {
    x += vx;
    y += vy;
    vy += GAME_CONFIG.gravity * 0.3;
    vx += wind * 0.003;
    ctx.lineTo(x, y);

    if (y > canvas.height) break;
  }

  ctx.stroke();
  ctx.restore();
}

// 전역 함수로 노출 (HTML onclick용)
window.joinRoom = joinRoom;
