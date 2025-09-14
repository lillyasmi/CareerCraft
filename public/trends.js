const searchBtn = document.getElementById("search-btn");
const trendInput = document.getElementById("trend-input");
let skillsChart = null;

// Support Enter key
trendInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") searchBtn.click();
});

searchBtn.addEventListener("click", async () => {
  const topic = trendInput.value.trim();
  if (!topic) return alert("Please enter a technology/domain");

  document.getElementById("trend-results").style.display = "block";
  showLoadingState();

  searchBtn.disabled = true;
  searchBtn.textContent = "Searching...";

  try {
    const res = await fetch("/api/trends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
    });

    const data = await res.json();
    populateResults(data);

  } catch (err) {
    console.error("Frontend error:", err);
    document.getElementById("overview").innerHTML =
      `<div class="error-message">⚠️ Error: ${err.message}</div>`;
  } finally {
    searchBtn.disabled = false;
    searchBtn.textContent = "Search";
  }
});

function showLoadingState() {
  ["overview", "roadmap", "certifications", "jobs", "ai-advice", "news"]
    .forEach(id => document.getElementById(id).innerHTML =
      '<div class="loading-spinner">⏳ Loading...</div>');
}

function populateResults(data) {
  document.getElementById("overview").innerHTML = `
    <p>${data.overview}</p>
    <strong>Market Size:</strong> ${data.marketSize || "N/A"}<br>
    <strong>Growth:</strong> ${data.growth || "N/A"}
  `;

  document.getElementById("roadmap").innerText = data.roadmap;
  document.getElementById("certifications").innerHTML =
    (data.certifications || []).map(c => `🏆 ${c}`).join("<br>");
  document.getElementById("jobs").innerText = data.jobs;
  document.getElementById("ai-advice").innerText = data.advice;

  document.getElementById("news").innerHTML =
    (data.news || []).map((n, i) => `<div>${i + 1}. ${n}</div>`).join("");

  createSkillsChart(data.skills);
}

function createSkillsChart(skills) {
  const canvas = document.getElementById("skillsChart");
  const ctx = canvas.getContext("2d");

  if (skillsChart) skillsChart.destroy();

  if (!skills || !skills.length) {
    ctx.fillText("No skills data available", canvas.width/2, canvas.height/2);
    return;
  }

  skillsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: skills.map(s => s.name),
      datasets: [{ label: "Demand (%)", data: skills.map(s => s.demand), backgroundColor: "#00c3ff" }]
    },
    options: { scales: { y: { beginAtZero: true, max: 100 } }, plugins: { legend: { display: false } } }
  });
}
