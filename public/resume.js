// resume.js
// Handles file upload, parsing, analysis, charts, and AI call via /api/generate

let SKILLS = [];
let JOBS = [];

async function loadData(){
  SKILLS = await (await fetch('/data/skills.json')).json();
  JOBS = await (await fetch('/data/jobs.json')).json();
}
loadData();

/* --------- Helpers: parse files --------- */
const fileInput = document.getElementById('file-input');
const dropArea = document.getElementById('drop-area');
const browseBtn = document.getElementById('browse-btn');
const extractedTextEl = document.getElementById('extracted-text');

browseBtn.addEventListener('click', ()=> fileInput.click());
fileInput.addEventListener('change', ev => handleFile(ev.target.files[0]));

['dragenter','dragover'].forEach(evt=>{
  dropArea.addEventListener(evt, e => { e.preventDefault(); dropArea.style.borderColor = 'rgba(255,255,255,0.12)'; });
});
['dragleave','drop'].forEach(evt=>{
  dropArea.addEventListener(evt, e => { e.preventDefault(); dropArea.style.borderColor = ''; });
});
dropArea.addEventListener('drop', e => {
  if (e.dataTransfer.files && e.dataTransfer.files.length) {
    handleFile(e.dataTransfer.files[0]);
  }
});

async function handleFile(file){
  if (!file) return;
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  try {
    let text = '';
    if (ext === 'pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const typed = new Uint8Array(arrayBuffer);
      const pdf = await pdfjsLib.getDocument({data: typed}).promise;
      for (let i=1;i<=pdf.numPages;i++){
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map(it=>it.str);
        text += strings.join('\n') + '\n\n';
      }
    } else if (ext === 'docx') {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.extractRawText({arrayBuffer});
      text = result.value;
    } else {
      text = await file.text();
    }
    extractedTextEl.innerText = text.trim();
  } catch (err) {
    console.error('parse error', err);
    alert('Failed to parse file: ' + err.message);
  }
}

/* --------- Skill extraction --------- */
function extractSkillsFromText(text){
  const t = text.toLowerCase();
  const found = [];
  for (const s of SKILLS){
    const kw = s.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('\\b' + kw.toLowerCase() + '\\b', 'i');
    if (re.test(t)) found.push(s);
  }
  return Array.from(new Map(found.map(s=>[s.keyword.toLowerCase(), s])).values());
}

/* --------- ATS scoring --------- */
function computeATSScores(text, foundSkills){
  const scores = { contact:0, sections:0, length:0, keywords:0 };
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text);
  const phone = /(\+?\d{1,3}[\s-]?)?(\d{3}[\s-]?\d{3}[\s-]?\d{4}|\d{10})/.test(text);
  scores.contact = (email?10:0) + (phone?8:0);

  const sections = ['experience','education','skills','projects','summary'];
  let secCount = 0;
  const tl = text.toLowerCase();
  for (const s of sections) if (tl.includes(s)) secCount++;
  scores.sections = Math.min(15, secCount * 3);

  const words = text.split(/\s+/).filter(Boolean).length;
  if (words >= 400 && words <= 1200) scores.length = 20;
  else if (words >= 250 && words < 400) scores.length = 12;
  else if (words > 1200) scores.length = 10;
  else scores.length = 5;

  const keywordCount = foundSkills.length;
  scores.keywords = Math.min(20, Math.round((keywordCount / Math.max(1, SKILLS.length)) * 100 * 0.2));

  const total = scores.contact + scores.sections + scores.length + scores.keywords;
  return {total: Math.min(100, total), breakdown: scores, words, keywordCount};
}

/* --------- Chart.js Plugin for Center Text --------- */
const centerTextPlugin = {
  id: 'centerText',
  beforeDraw(chart) {
    const { ctx, width, height } = chart;
    const opts = chart.config.options.plugins.centerText;
    if (!opts || !opts.text) return;

    ctx.save();
    ctx.font = `${Math.round(width / 12)}px Arial`;
    ctx.fillStyle = opts.color || 'var(--text)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(opts.text, width / 2, height / 2);
    ctx.restore();
  }
};
Chart.register(centerTextPlugin);

/* --------- Render functions --------- */
let skillsChart = null;
function renderSkillSummary(foundSkills){
  const categories = {};
  SKILLS.forEach(s => categories[s.category] = categories[s.category] || 0);
  foundSkills.forEach(s => categories[s.category] = (categories[s.category] || 0) + 1);
  const labels = Object.keys(categories);
  const data = labels.map(l => categories[l] || 0);

  const ctx = document.getElementById('radarChart').getContext('2d');
  if (skillsChart) skillsChart.destroy();
  skillsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: [
          '#4fd1c5', '#f6ad55', '#63b3ed',
          '#f56565', '#9f7aea', '#68d391'
        ],
        borderWidth: 1
      }]
    },
    options: {
      cutout: '60%',
      plugins: {
        legend: { position: 'right', labels:{color:'#ffffff'} },
      }
    }
  });

  const listEl = document.getElementById('skill-list');
  if (!foundSkills.length) listEl.innerHTML = '<em class="small-muted">No skills detected automatically.</em>';
  else listEl.innerHTML = `<strong>Detected:</strong> ${foundSkills.map(s=>s.keyword).join(', ')}`;
}

let atsChart = null;
function renderATSScore(score){
  const ctx = document.getElementById('atsChart').getContext('2d');
  if (atsChart) atsChart.destroy();
  atsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [score, 100 - score],
        backgroundColor: ['#4fd1c5', '#2d3748'],
        borderWidth: 0
      }]
    },
    options: {
      cutout: '70%',
      plugins: {
        legend:{display:false}, tooltip:{enabled:false},
        centerText: { text: `${score}%`, color: '#fff' }
      }
    }
  });
  document.getElementById('ats-text').innerHTML = `<strong>${score}%</strong> ATS Compatibility`;
}

let readinessChart = null;
function renderReadinessScore(score){
  const ctx = document.getElementById('readinessChart').getContext('2d');
  if (readinessChart) readinessChart.destroy();
  readinessChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [score, 100 - score],
        backgroundColor: ['#f6ad55', '#2d3748'],
        borderWidth: 0
      }]
    },
    options: {
      cutout: '70%',
      plugins: {
        legend:{display:false}, tooltip:{enabled:false},
        centerText: { text: `${score}%`, color: '#fff' }
      }
    }
  });
  document.getElementById('readiness-text').innerHTML = `<strong>${score}%</strong> Career Readiness`;
}

/* --------- Job Matches --------- */
function renderJobMatches(foundSkills){
  const container = document.getElementById('job-matches');
  container.innerHTML = '';
  const foundSet = new Set(foundSkills.map(s=>s.keyword.toLowerCase()));
  const scored = JOBS.map(job=>{
    const required = job.required_skills || [];
    const matched = required.filter(r => foundSet.has(r.toLowerCase())).length;
    const score = Math.round((matched / Math.max(1, required.length)) * 100);
    const missing = required.filter(r => !foundSet.has(r.toLowerCase()));
    return {...job, score, matched, missing};
  }).sort((a,b)=>b.score-a.score);

  const top = scored.slice(0,5);
  top.forEach(job=>{
    const div = document.createElement('div');
    div.className = 'job';
    div.innerHTML = `
      <h5 style="margin:6px 0;color:var(--accent)">${job.title}</h5>
      <p class="small-muted" style="margin:0 0 8px 0;">${job.description || ''}</p>
      <div class="progress"><span style="width:${job.score}%"></span></div>
      <p class="small-muted" style="margin-top:6px">Match ${job.score}% — Missing: ${job.missing.join(', ') || 'None'}</p>
    `;
    container.appendChild(div);
  });
  const avg = Math.round(top.reduce((s,j)=>s+j.score,0)/Math.max(1, top.length));
  return avg;
}

/* --------- Readiness score --------- */
function computeReadiness(atsScore, avgJobMatch, foundSkills){
  const skillsScore = Math.min(100, Math.round((foundSkills.length / Math.max(1, SKILLS.length)) * 100));
  const readiness = Math.round( (atsScore * 0.4) + (avgJobMatch * 0.4) + (skillsScore * 0.2) );
  return {readiness, skillsScore};
}

/* --------- Analyze button --------- */
const analyzeBtn = document.getElementById('analyze-btn');
analyzeBtn.addEventListener('click', async () => {
  const text = extractedTextEl.innerText || '';
  if (!text) return alert('Please upload a resume first.');
  analyzeBtn.disabled = true;
  analyzeBtn.textContent = 'Analyzing...';

  try {
    const found = extractSkillsFromText(text);
    renderSkillSummary(found);
    const avgJobMatch = renderJobMatches(found);

    const ats = computeATSScores(text, found);
    renderATSScore(ats.total);

    const readiness = computeReadiness(ats.total, avgJobMatch, found);
    renderReadinessScore(readiness.readiness);
  } catch (err) {
    console.error(err);
    alert('Analysis failed: ' + err.message);
  } finally {
    analyzeBtn.disabled = false;
    analyzeBtn.textContent = 'Analyze Resume';
  }
});


/* --------- Format AI Output (COMPLETELY REWRITTEN) --------- */
function formatCareerAdvice(raw) {
  let txt = raw.trim();

  // Cleanup: remove numbering, symbols
  txt = txt.replace(/(\*\*?\s*)?\d+\)\s*/g, "");
  txt = txt.replace(/^\s*[:.\-•*]+\s*/gm, "");

  // Convert markdown
  txt = txt.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
  txt = txt.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, "<em>$1</em>");

  // Split lines
  const lines = txt.split("\n").map(line => line.trim()).filter(line => line);

  let result = [];
  let currentSection = "";
  let inList = false;

  const closeList = () => { if (inList) { result.push("</ul>"); inList = false; } };

  for (let line of lines) {
    // --- Headings detection with different colors ---
    if (/top\s+\d+\s+suitable\s+career/i.test(line)) {
      closeList();
      result.push('<h2 style="color:#FFD700;">🌟 Top 3 Suitable Career Paths</h2><ul style="color:white;">'); // Gold
      inList = true;
      currentSection = "career";
      continue;
    }
    if (/missing\s+skills?/i.test(line)) {
      closeList();
      result.push('<h2 style="color:#FF6347;">🛠️ Missing Skills & Improvements</h2><ul style="color:white;">'); // Tomato Red
      inList = true;
      currentSection = "missing";
      continue;
    }
    if (/ats\s+feedback/i.test(line)) {
      closeList();
      result.push('<h2 style="color:#1E90FF;">📊 ATS Feedback</h2><ul style="color:white;">'); // Dodger Blue
      inList = true;
      currentSection = "ats";
      continue;
    }

    // --- Bullet items only ---
    if (!inList) {
      result.push('<ul style="color:white;">');
      inList = true;
    }
    result.push(`<li>${line}</li>`);
  }

  closeList();

  // --- Final Opportunities Section ---
  result.push(`
    <div style="margin-top:20px; color:white;">
      <h2 style="color:#32CD32;">🌍 Where to Find Opportunities</h2> <!-- LimeGreen -->
      <ul style="color:white;">
        <li>💼 LinkedIn Jobs – Networking + job search</li>
        <li>📑 Indeed / Glassdoor – Broad listings</li>
        <li>🚀 AngelList – Startups & tech</li>
        <li>👨‍💻 GitHub & Open Source – Showcase portfolio</li>
        <li>🏆 Hackathons & Competitions – Build experience</li>
      </ul>
    </div>
  `);

  return result.join("\n");
}

/* --------- AI suggestions --------- */
const aiBtn = document.getElementById('ai-suggest-btn');
aiBtn.addEventListener('click', async ()=>{
  const text = extractedTextEl.innerText || '';
  if (!text) return alert('Please upload a resume first.');
  aiBtn.disabled = true; aiBtn.textContent = 'Calling AI...';

  const mode = document.querySelector('input[name="analysis-mode"]:checked').value;
  const prompt = `You are a senior career advisor. Provide a ${mode === 'short' ? 'short' : 'detailed'} analysis of this resume.
Output:
1) Top 3 suitable career paths (bulleted).
2) Missing skills and improvements (bulleted, with suggested free resources).
3) One-paragraph ATS feedback focusing on formatting and keywords.
Resume:
${text}
`;

  try {
    const resp = await fetch('/api/generate', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ prompt })
    });
    const data = await resp.json();
    const raw = data.text || JSON.stringify(data.raw || data, null, 2);
    document.getElementById('ai-output').innerHTML = formatCareerAdvice(raw);
  } catch (err) {
    console.error(err);
    alert('AI request failed: ' + err.message);
  } finally {
    aiBtn.disabled = false; aiBtn.textContent = 'AI: Get Career Advice';
  }
});

/* --------- Download report --------- */
document.getElementById('download-report').addEventListener('click', ()=>{
  const text = extractedTextEl.innerText || '';
  if (!text) return alert('Nothing to download. Analyze first.');
  const found = extractSkillsFromText(text);
  const ats = computeATSScores(text, found);
  const avgJobMatch = (function(){
    const foundSet = new Set(found.map(s=>s.keyword.toLowerCase()));
    const scored = JOBS.map(job=>{
      const required = job.required_skills || [];
      const matched = required.filter(r => foundSet.has(r.toLowerCase())).length;
      const score = Math.round((matched / Math.max(1, required.length)) * 100);
      return score;
    });
    return Math.round(scored.reduce((a,b)=>a+b,0) / Math.max(1, scored.length));
  })();
  const readiness = computeReadiness(ats.total, avgJobMatch, found);
  const report = {
    timestamp: new Date().toISOString(),
    resume_text_excerpt: text.slice(0,200),
    skills: found.map(s=>s.keyword),
    ats, avgJobMatch, readiness
  };
  const blob = new Blob([JSON.stringify(report, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'careercraft_report.json'; document.body.appendChild(a); a.click();
  a.remove(); URL.revokeObjectURL(url);
});
