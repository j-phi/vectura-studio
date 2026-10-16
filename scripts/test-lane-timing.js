const executionExpired = (startedAt, now, maxSeconds) => now - startedAt >= maxSeconds * 1000;
const parseQueueWait = (line) => {
  const match = String(line).match(/\bevent=lock-acquired\s+queue_wait_ms=(\d+)\b/);
  return match ? Number(match[1]) : null;
};
module.exports = { executionExpired, parseQueueWait };
