const { execFile } = require('child_process');

/**
 * ICMP ping via the OS `ping` command — the same tool a technician
 * would type by hand. Cross-platform (Windows / *nix) and non-blocking.
 *
 * @param {string} host - Target hostname or IP address.
 * @param {number} [timeoutMs=3000] - Maximum time to wait for a reply.
 * @returns {Promise<{alive: boolean, rttMs: number|null}>}
 */
function ping(host, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const args = isWin
      ? ['-n', '2', '-w', String(Math.floor(timeoutMs / 2)), host]
      : ['-c', '2', '-W', '2', host];
    const start = Date.now();
    execFile('ping', args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) return resolve({ alive: false, rttMs: null });
      resolve({ alive: true, rttMs: parseRtt(stdout, isWin) });
    });
  });
}

/**
 * Extract average round-trip time from `ping` output.
 *
 * @param {string} out - Raw stdout from the ping command.
 * @param {boolean} isWin - Whether the output is Windows-formatted.
 * @returns {number|null} Average RTT in milliseconds, or null on parse failure.
 */
function parseRtt(out, isWin) {
  const re = isWin
    ? /Average = (\d+)ms/i
    : /rtt min\/avg\/max\/mdev = [\d.]+\/([\d.]+)/;
  const m = out.match(re);
  return m ? parseFloat(m[1]) : null;
}

module.exports = { ping };