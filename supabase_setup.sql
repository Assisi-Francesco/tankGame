-- Tank Battle 게임을 위한 Supabase 테이블 설정
-- Supabase Dashboard > SQL Editor에서 실행하세요

-- 1. 게임 방 테이블 생성
CREATE TABLE IF NOT EXISTS tank_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code VARCHAR(10) UNIQUE NOT NULL,
  host_id VARCHAR(50) NOT NULL,
  host_name VARCHAR(50) NOT NULL,
  guest_id VARCHAR(50),
  guest_name VARCHAR(50),
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'ready', 'playing', 'finished')),
  game_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. RLS (Row Level Security) 활성화
ALTER TABLE tank_rooms ENABLE ROW LEVEL SECURITY;

-- 3. 모든 사용자가 방을 조회할 수 있도록 허용
CREATE POLICY "Anyone can view rooms" ON tank_rooms
  FOR SELECT USING (true);

-- 4. 모든 사용자가 방을 생성할 수 있도록 허용
CREATE POLICY "Anyone can create rooms" ON tank_rooms
  FOR INSERT WITH CHECK (true);

-- 5. 모든 사용자가 방을 업데이트할 수 있도록 허용
CREATE POLICY "Anyone can update rooms" ON tank_rooms
  FOR UPDATE USING (true);

-- 6. 모든 사용자가 방을 삭제할 수 있도록 허용
CREATE POLICY "Anyone can delete rooms" ON tank_rooms
  FOR DELETE USING (true);

-- 7. 실시간 기능 활성화
ALTER PUBLICATION supabase_realtime ADD TABLE tank_rooms;

-- 8. 오래된 방 자동 삭제를 위한 함수 (선택사항)
CREATE OR REPLACE FUNCTION delete_old_rooms()
RETURNS void AS $$
BEGIN
  DELETE FROM tank_rooms
  WHERE created_at < NOW() - INTERVAL '1 hour'
  AND status IN ('waiting', 'finished');
END;
$$ LANGUAGE plpgsql;

-- 9. updated_at 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tank_rooms_updated_at
  BEFORE UPDATE ON tank_rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ========================================
-- 게임 전적 테이블
-- ========================================

-- 10. 게임 전적 테이블 생성
CREATE TABLE IF NOT EXISTS game_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  winner_id VARCHAR(50) NOT NULL,
  winner_name VARCHAR(50) NOT NULL,
  loser_id VARCHAR(50) NOT NULL,
  loser_name VARCHAR(50) NOT NULL,
  win_reason VARCHAR(20) DEFAULT 'battle' CHECK (win_reason IN ('battle', 'disconnect')),
  played_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 11. game_records RLS 활성화
ALTER TABLE game_records ENABLE ROW LEVEL SECURITY;

-- 12. 모든 사용자가 전적을 조회할 수 있도록 허용
CREATE POLICY "Anyone can view records" ON game_records
  FOR SELECT USING (true);

-- 13. 모든 사용자가 전적을 추가할 수 있도록 허용
CREATE POLICY "Anyone can insert records" ON game_records
  FOR INSERT WITH CHECK (true);
