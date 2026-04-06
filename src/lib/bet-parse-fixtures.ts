/**
 * Ten realistic natural-language bets for parse / QA (zh + en mixed).
 * Run through POST /api/challenges/parse or `parseChallenge()` in tests.
 */
export const TEN_REAL_BET_INPUTS: readonly string[] = [
  "我赌下一辆经过的车是正红色，输的人请喝奶茶，10 credits。",
  "来比俯卧撑，标准姿势，1 分钟内至少 15 个，谁少谁转对方 5U。",
  "谁先跑到湖边长椅谁赢，用 Strava GPS 截图作证，公开挑战。",
  "两人各做一道番茄炒蛋，视频记录全程，评委按卖相打分，押 20 credits。",
  "赌以太坊下一根 15m K 线是阳线还是阴线，以 Binance 收盘价为准，输的 50 credits。",
  "LeetCode 同一题，谁先 AC 谁赢，提交记录截图 + 时间戳，私有房间。",
  "平板支撑坚持更久者胜，侧面全身入镜，最长 3 分钟封顶，免费娱乐局。",
  "猜今晚球赛总进球数，更接近官方比分者赢，API 数据为准，押 100 credits。",
  "谁先在本地跑通这个 repo 的 `npm test` 全绿，终端录屏为证，48 小时内。",
  "街头象棋快棋 5+3，输家付 10 credits，可视频或现场照片 + 棋谱。",
] as const;
