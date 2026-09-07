const { execFile } = require('child_process');

function ping(host, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const args = isWin ? ['-n', '2', '-w', String(Math.floor(timeoutMs / 2)), host] : ['-c', '2', '-W', '2', host];
    const start = Date.now();
    execFile('ping', args, { timeout: timeoutMs }, (err, stdout) => {
      if (err) {
        return resolve({ alive: false, rttMs: null, raw: stdout || '' });
      }
      const rtt = parseRtt(stdout, isWin);
      resolve({ alive: true, rttMs: rtt, raw: stdout });
    });
  });
}

function parseRtt(out, isWin) {
  const re = isWin
    ? /Average = (\d+)ms/i
    : /rtt min\/avg\/max\/mdev = [\d.]+\/([\d.]+)/;
  const m = out.match(re);
  return m ? parseFloat(m[1]) : null;
}

module.exports = { ping };
