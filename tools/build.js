// Builds app/src/main/assets/index.html from src/my-money.html (works with python3, python or py).
const { spawnSync } = require('child_process'); const path = require('path');
const script = path.join(__dirname, 'make_apk_html.py');
for (const py of ['python3', 'python', 'py']) { const r = spawnSync(py, [script, ...process.argv.slice(2)], { stdio: 'inherit' }); if (!r.error) process.exit(r.status) }
console.error('Python 3 is needed to build (install it from python.org).'); process.exit(1);
