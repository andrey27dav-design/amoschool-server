/**
 * Rate limiter + retry with exponential backoff for CRM API calls.
 * AMO CRM: max 7 req/sec
 * Kommo CRM: max 7 req/sec
 */
const logger = require('./logger');

const MAX_RPS     = 7;
const MIN_INTERVAL = Math.ceil(1000 / MAX_RPS); // ~143ms
const MAX_RETRIES  = 4;
const BASE_DELAY   = 1000; // 1s

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Creates a rate-limited, auto-retry axios wrapper for one CRM.
 * @param {string} name - 'AMO' or 'Kommo' for logging
 */
function createRateLimiter(name) {
  let lastRequestTime = 0;
  let queue = Promise.resolve();

  async function throttle() {
    await queue;
    queue = queue.then(async () => {
      const now = Date.now();
      const wait = MIN_INTERVAL - (now - lastRequestTime);
      if (wait > 0) await sleep(wait);
      lastRequestTime = Date.now();
    });
    await queue;
  }

  /**
   * Execute fn() with rate limiting + retry on 429/5xx
   * @param {Function} fn - async function that makes the request
   * @param {string} label - description for logs
   */
  async function execute(fn, label = '') {
    let attempt = 0;
    while (true) {
      await throttle();
      try {
        return await fn();
      } catch (err) {
        const status = err.response?.status;
        attempt++;

        // 429 Too Many Requests — use Retry-After header if available
        if (status === 429) {
          const retryAfter = parseInt(err.response?.headers?.['retry-after'] || '5', 10);
          const delay = retryAfter * 1000;
          logger.warn(`[${name}] 429 rate limit${label ? ` (${label})` : ''}. Retry in ${retryAfter}s (attempt ${attempt})`);
          await sleep(delay);
          continue;
        }

        // 5xx server error — exponential backoff
        if (status >= 500 && attempt <= MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1);
          logger.warn(`[${name}] ${status} server error${label ? ` (${label})` : ''}. Retry in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }

        // Connection errors — retry a few times
        if (!status && attempt <= MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, attempt - 1);
          logger.warn(`[${name}] Network error ${err.code || err.message}${label ? ` (${label})` : ''}. Retry in ${delay}ms (attempt ${attempt}/${MAX_RETRIES})`);
          await sleep(delay);
          continue;
        }

        // Non-retriable or max retries exceeded
        logger.error(`[${name}] Request failed${label ? ` (${label})` : ''}: ${err.message}`);
        throw err;
      }
    }
  }

  return { execute };
}

module.exports = { createRateLimiter };
