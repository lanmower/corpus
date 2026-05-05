// build site/data/medbak-index.json from D:/medbak/archive-manifest.json
const fs = require('fs'); const path = require('path');
const SRC = 'D:/medbak/archive-manifest.json';
const OUT = path.join(__dirname, '..', 'site', 'data', 'medbak-index.json');

function build() {
    let raw = null;
    try { raw = JSON.parse(fs.readFileSync(SRC, 'utf8')); } catch (e) {
        try {
            const subjects = ['cardiology','diabetes','endocrine','gastroenterology','geriatric','nephrology','pulmonology','rheumatology'];
            const out = {};
            for (const s of subjects) {
                const dir = `D:/medbak/${s}/audio-transcripts`;
                if (!fs.existsSync(dir)) continue;
                out[s] = fs.readdirSync(dir).filter(f => f.endsWith('.txt') || f.endsWith('.md'));
            }
            fs.writeFileSync(OUT, JSON.stringify(out, null, 2));
            console.log('built fallback medbak-index.json by scanning D:/medbak');
            return;
        } catch (e2) {
            fs.writeFileSync(OUT, JSON.stringify({}, null, 2));
            console.log('no medbak archive found; wrote empty index');
            return;
        }
    }
    fs.writeFileSync(OUT, JSON.stringify(raw, null, 2));
    console.log('wrote medbak-index.json');
}
build();
